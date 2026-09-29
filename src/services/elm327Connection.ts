import { ConnectionConfig, ConnectionType, PacketLog, TelemetryData } from '../types';
import { J1850Decoder } from './j1850Decoder';

const BLE_SERVICE_UUIDS = [
  '0000ffe0-0000-1000-8000-00805f9b34fb', // Standard BLE OBD (HM-10, CC2541, Viecar, Vgate)
  '0000fff0-0000-1000-8000-00805f9b34fb', // Chinese BLE OBD clones
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service (OBDLink CX, Veepeak, Carista)
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Telink BLE (Konnwei, Vgate iCar Pro BLE 4.0)
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC / Microchip Transparent UART (IS1678 / BM70)
  '000018f0-0000-1000-8000-00805f9b34fb', // Vgate alternate BLE
  '0000fee0-0000-1000-8000-00805f9b34fb', // Veepeak Mini BLE
  '0000fee7-0000-1000-8000-00805f9b34fb', // Tencent OBD BLE
  '0000ffe5-0000-1000-8000-00805f9b34fb',
  '0000ae00-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb',
  '5038a328-9d82-4113-8835-12cf51876970',
  '00001101-0000-1000-8000-00805f9b34fb', // SPP Serial
];

export class ELM327Connection {
  private connectionType: ConnectionType = 'disconnected';
  private decoder = new J1850Decoder();
  private textDecoder = new TextDecoder('utf-8');
  private textEncoder = new TextEncoder();

  // Bluetooth objects
  private bluetoothDevice: any = null;
  private gattServer: any = null;
  private txCharacteristic: any = null;
  private rxCharacteristic: any = null;

  // Active polling timer for real hardware fallback
  private pollTimer: any = null;

  // Incoming data listeners for request/expect flow (HarleyDroid chat mechanism)
  private responseListeners: Array<(line: string) => void> = [];

  // Persistent telemetry state - no fabricated data in real mode
  private currentTelemetryState: TelemetryData = {
    rpm: 0,
    speedKmH: 0,
    speedMph: 0,
    engineTempF: 0,
    engineTempC: 0,
    batteryVoltage: 0,
    gear: 'N',
    turnLeft: false,
    turnRight: false,
    neutral: true,
    checkEngine: false,
    oilWarning: false,
    highBeam: false,
    clutchEngaged: false,
    activeDtcList: [],
    historicDtcList: [],
    lastUpdated: Date.now(),
  };

  // Serial objects
  private serialPort: any = null;
  private serialReader: any = null;
  private serialWriter: any = null;
  private serialKeepReading = false;

  // Persistent RX Buffer for BLE and Serial chunks
  private rxBuffer = '';

  // Active connection configuration
  private activeConfig: ConnectionConfig | null = null;

  // Simulator state
  private simTimer: any = null;
  private simDtcSpawnTimer: any = null;
  private simStreamPaused = false;
  private simCurrentHeader: string = '68 6A F1';
  private simRpm = 980;
  private simTargetRpm = 980;
  private simSpeed = 0;
  private simTargetSpeed = 0;
  private simTempF = 185;
  private simGear: number | 'N' = 'N';
  private simRunning = false;
  private simOdometerKm = 34226;
  private simEngineHours = 892;
  private simEngineMinutes = 24;
  private simEngineStarts = 3120;
  private simActiveDtcs: string[] = ['P0131'];
  private simHistoricDtcs: string[] = ['P0107', 'P0118'];

  // Callback listeners
  private onTelemetryUpdate: (telemetry: TelemetryData) => void = () => {};
  private onPacketLog: (packet: PacketLog) => void = () => {};
  private onStatusChange: (status: string, isError?: boolean) => void = () => {};

  constructor(
    onTelemetry: (t: TelemetryData) => void,
    onPacket: (p: PacketLog) => void,
    onStatus: (s: string, isError?: boolean) => void
  ) {
    this.onTelemetryUpdate = onTelemetry;
    this.onPacketLog = onPacket;
    this.onStatusChange = onStatus;
  }

  public getConnectionType(): ConnectionType {
    return this.connectionType;
  }

  /**
   * Helper to write to BLE characteristic handling writeWithoutResponse / writeWithResponse
   */
  private async writeBleCharacteristic(char: any, data: Uint8Array): Promise<void> {
    if (!char) throw new Error('Característica BLE de envio não disponível');
    const props = char.properties || {};

    try {
      if (props.writeWithoutResponse && typeof char.writeValueWithoutResponse === 'function') {
        await char.writeValueWithoutResponse(data);
      } else if (props.write && typeof char.writeValueWithResponse === 'function') {
        await char.writeValueWithResponse(data);
      } else if (typeof char.writeValueWithoutResponse === 'function') {
        await char.writeValueWithoutResponse(data);
      } else if (typeof char.writeValue === 'function') {
        await char.writeValue(data);
      } else {
        throw new Error('Canal Bluetooth não aceita gravação de dados.');
      }
    } catch (e: any) {
      if (typeof char.writeValue === 'function') {
        await char.writeValue(data);
      } else {
        throw e;
      }
    }
  }

  /**
   * Connect via Web Bluetooth API (BLE OBD2 adapters / SPP)
   */
  public async connectBluetooth(config: ConnectionConfig): Promise<boolean> {
    if (!('bluetooth' in navigator)) {
      this.onStatusChange('Web Bluetooth não é suportado neste navegador. Use Bluefy no iPhone ou Chrome/Edge no PC.', true);
      return false;
    }

    try {
      this.onStatusChange('Procurando adaptador Bluetooth OBD2...');
      
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: BLE_SERVICE_UUIDS,
      });

      this.bluetoothDevice = device;
      this.onStatusChange(`Pareando com ${device.name || 'ELM327 OBDII'}...`);

      device.addEventListener('gattserverdisconnected', () => {
        this.onStatusChange('Dispositivo Bluetooth desconectado.', true);
        this.disconnect();
      });

      this.gattServer = await device.gatt.connect();
      this.onStatusChange('Descobrindo canais de comunicação OBD...');

      let targetService: any = null;
      for (const uuid of BLE_SERVICE_UUIDS) {
        try {
          targetService = await this.gattServer.getPrimaryService(uuid);
          if (targetService) break;
        } catch {
          // Continue searching next service UUID
        }
      }

      if (!targetService) {
        try {
          const services = await this.gattServer.getPrimaryServices();
          if (services && services.length > 0) {
            targetService = services[0];
          }
        } catch {
          // ignore
        }
      }

      if (!targetService) {
        throw new Error('Nenhum canal BLE compatível encontrado. Se for ELM327 Bluetooth clássico v2.1, conecte via "Serial USB / COM".');
      }

      const characteristics = await targetService.getCharacteristics();
      if (characteristics.length === 0) {
        throw new Error('Nenhum canal de envio/recepção serial encontrado no adaptador.');
      }

      this.txCharacteristic = null;
      this.rxCharacteristic = null;

      for (const char of characteristics) {
        const props = char.properties || {};
        if (props.notify || props.indicate) {
          this.rxCharacteristic = char;
        }
        if (props.write || props.writeWithoutResponse) {
          this.txCharacteristic = char;
        }
      }

      if (!this.txCharacteristic) this.txCharacteristic = characteristics[0];
      if (!this.rxCharacteristic) this.rxCharacteristic = characteristics.length > 1 ? characteristics[1] : characteristics[0];

      if (this.rxCharacteristic && (this.rxCharacteristic.properties?.notify || this.rxCharacteristic.properties?.indicate)) {
        await this.rxCharacteristic.startNotifications();
        this.rxCharacteristic.addEventListener(
          'characteristicvaluechanged',
          (event: any) => this.handleIncomingData(event.target.value)
        );
      }

      this.connectionType = 'bluetooth';
      this.onStatusChange('Conectado via Bluetooth! Configurando ELM327 para Harley J1850...');

      await this.initializeELM327(config);
      return true;
    } catch (err: any) {
      this.onStatusChange(`Erro na conexão Bluetooth: ${err.message || err}`, true);
      this.disconnect();
      return false;
    }
  }

  /**
   * Connect via Web Serial API (USB cable or Paired COM Port)
   */
  public async connectSerial(config: ConnectionConfig): Promise<boolean> {
    if (!('serial' in navigator)) {
      this.onStatusChange('Web Serial não é suportado neste navegador. Use Chrome/Edge desktop.', true);
      return false;
    }

    try {
      this.onStatusChange('Selecione a porta serial do ELM327...');
      this.serialPort = await (navigator as any).serial.requestPort();
      const baud = config.baudRate || 38400;
      await this.serialPort.open({ baudRate: baud });

      this.serialWriter = this.serialPort.writable.getWriter();
      this.serialKeepReading = true;
      this.connectionType = 'serial';
      this.onStatusChange('Conectado à Porta Serial! Inicializando ELM327...');

      this.readSerialLoop();
      await this.initializeELM327(config);
      return true;
    } catch (err: any) {
      this.onStatusChange(`Erro na conexão Serial: ${err.message || err}`, true);
      this.disconnect();
      return false;
    }
  }

  private async readSerialLoop() {
    while (this.serialPort && this.serialPort.readable && this.serialKeepReading) {
      try {
        this.serialReader = this.serialPort.readable.getReader();
        while (true) {
          const { value, done } = await this.serialReader.read();
          if (done) break;
          if (value) {
            this.handleIncomingData(value);
          }
        }
      } catch (err) {
        if (this.serialKeepReading) {
          console.error('Serial read error:', err);
        }
      } finally {
        if (this.serialReader) {
          this.serialReader.releaseLock();
          this.serialReader = null;
        }
      }
    }
  }

  /**
   * Send AT initialization commands sequence to ELM327
   */
  public async initializeELM327(config: ConnectionConfig) {
    this.activeConfig = config;
    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

    try {
      this.onStatusChange('Resetando ELM327 (ATZ)...');
      await this.sendCommand('ATZ');
      await sleep(1000);

      this.onStatusChange('Configurando ELM327 (ATE0, ATL0, ATS0, ATH1)...');
      await this.sendCommand('ATE0'); // Echo OFF
      await sleep(200);
      await this.sendCommand('ATL0'); // Linefeeds OFF
      await sleep(200);
      await this.sendCommand('ATS0'); // Spaces OFF
      await sleep(200);

      // AT H1 is CRITICAL for Harley J1850 VPW to preserve message headers
      await this.sendCommand('ATH1');
      await sleep(200);

      // Protocol selection (ATSP2 = SAE J1850 VPW for Harley Davidson)
      this.onStatusChange(`Definindo protocolo ${config.protocol} (Harley J1850 VPW)...`);
      await this.sendCommand(config.protocol);
      await sleep(400);

      // Check battery voltage
      await this.sendCommand('ATRV');
      await sleep(300);

      if (config.monitorMode) {
        this.stopActivePolling();
        this.onStatusChange('Ativando Monitor J1850 contínuo (ATMA)...');
        await this.sendCommand('ATMA');
      } else {
        this.onStatusChange('Conectado ao ELM327! Modo Harley J1850 Ativo...');
        this.startActivePolling();
      }
    } catch (err: any) {
      this.onStatusChange(`Aviso durante inicialização: ${err.message || err}`);
    }
  }

  public startActivePolling() {
    this.stopActivePolling();
    // ATMA e activePolling são mutuamente exclusivos: se monitorMode estiver ativo, não iniciar polling
    if (this.activeConfig?.monitorMode) {
      return;
    }

    // Em modo Harley J1850, não concorre com 010C/010D/0105; consulta apenas tensão ATRV controlada
    this.pollTimer = setInterval(async () => {
      if (this.connectionType === 'disconnected' || this.connectionType === 'simulator') {
        this.stopActivePolling();
        return;
      }
      await this.sendCommand('ATRV');
    }, 2500);
  }

  public stopActivePolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Sends a break / abort signal (single space or CR) to stop ATMA streaming on ELM327
   */
  public async sendBreak(): Promise<boolean> {
    const raw = ' \r';
    try {
      if (this.connectionType === 'bluetooth' && this.txCharacteristic) {
        await this.writeBleCharacteristic(this.txCharacteristic, this.textEncoder.encode(raw));
        return true;
      } else if (this.connectionType === 'serial' && this.serialWriter) {
        await this.serialWriter.write(this.textEncoder.encode(raw));
        return true;
      } else if (this.connectionType === 'simulator') {
        this.simStreamPaused = true;
        return true;
      }
    } catch (e) {
      console.warn('sendBreak warning:', e);
    }
    return false;
  }

  /**
   * Mecanismo chat(send, expect, timeout) equivalente ao HarleyDroid
   * Transmite comando e aguarda resposta esperada antes de prosseguir
   */
  public async chat(cmd: string, expect: string, timeoutMs: number = 800): Promise<{ success: boolean; reply: string }> {
    return new Promise(async (resolve) => {
      let resolved = false;
      let replyAccum = '';
      const cleanExpect = expect.replace(/[\s:]+/g, '').toUpperCase();

      const listener = (line: string) => {
        replyAccum += line + '\n';
        const cleanLine = line.replace(/[\s:]+/g, '').toUpperCase();
        if (cleanExpect && cleanLine.includes(cleanExpect)) {
          if (!resolved) {
            resolved = true;
            cleanup();
            resolve({ success: true, reply: replyAccum });
          }
        }
      };

      const cleanup = () => {
        const idx = this.responseListeners.indexOf(listener);
        if (idx !== -1) {
          this.responseListeners.splice(idx, 1);
        }
        if (timer) clearTimeout(timer);
      };

      this.responseListeners.push(listener);

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          this.onPacketLog({
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            type: 'error',
            raw: `TIMEOUT: ${cmd}`,
            decoded: `Timeout aguardando "${expect}" para o comando "${cmd}" (${timeoutMs}ms). Resposta obtida: ${replyAccum.trim() || 'NENHUMA'}`,
            tag: 'AT',
          });
          resolve({ success: false, reply: replyAccum });
        }
      }, timeoutMs);

      // Transmite o comando
      await this.sendCommand(cmd);
    });
  }

  /**
   * Request Harley Diagnostics (VIN, ECU Part Number, CalID, SW Level, DTCs Atuais e Históricos)
   * Baseado estritamente na rotina de envio do HarleyDroid
   */
  public async requestHarleyDiagnostics(): Promise<void> {
    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

    this.onStatusChange('Interrompendo monitoramento contínuo (ATMA)...');
    this.stopActivePolling();
    await this.sendBreak();
    await sleep(350);

    // Reseta apenas estado de diagnóstico sem zerar odômetro live
    this.decoder.resetDiagnosticState();

    // 1. CONSULTA DE IDENTIFICAÇÃO DA ECM (0C 10 F1)
    // Comandos 3C 01 até 3C 11
    this.onStatusChange('Configurando cabeçalho de identificação ECM (ATSH 0C 10 F1)...');
    await this.chat('ATSH 0C 10 F1', 'OK', 500);

    const idCommands = [
      { cmd: '3C 01', expect: '0CF1107C01', desc: 'ECM Part Number (Bloco 1)' },
      { cmd: '3C 02', expect: '0CF1107C02', desc: 'ECM Part Number (Bloco 2)' },
      { cmd: '3C 03', expect: '0CF1107C03', desc: 'Calibration ID (Bloco 1)' },
      { cmd: '3C 04', expect: '0CF1107C04', desc: 'Calibration ID (Bloco 2)' },
      { cmd: '3C 0B', expect: '0CF1107C0B', desc: 'ECM Software Level' },
      { cmd: '3C 0F', expect: '0CF1107C0F', desc: 'Chassi VIN (Bloco 1)' },
      { cmd: '3C 10', expect: '0CF1107C10', desc: 'Chassi VIN (Bloco 2)' },
      { cmd: '3C 11', expect: '0CF1107C11', desc: 'Chassi VIN (Bloco 3)' },
    ];

    for (const item of idCommands) {
      this.onStatusChange(`Lendo ${item.desc}...`);
      await this.chat(item.cmd, item.expect, 600);
      await sleep(100);
    }

    // 2. CONSULTA DE DTCs HARLEY (6C 10/40/60 F1 19 52 FF 00)
    // Nó 0x10 = ECM (DTC Histórico)
    this.onStatusChange('Lendo DTCs da ECM (Histórico - Nó 0x10)...');
    await this.chat('ATSH 6C 10 F1', 'OK', 500);
    await this.chat('19 52 FF 00', '6CF11059', 2000);
    await sleep(150);

    // Nó 0x40 = BCM / TSM (DTC Atual)
    this.onStatusChange('Lendo DTCs do BCM/TSM (Atuais - Nó 0x40)...');
    await this.chat('ATSH 6C 40 F1', 'OK', 500);
    await this.chat('19 52 FF 00', '6CF14059', 2000);
    await sleep(150);

    // Nó 0x60 = Velocímetro (DTCs do Painel)
    this.onStatusChange('Lendo DTCs do Velocímetro (Nó 0x60)...');
    await this.chat('ATSH 6C 60 F1', 'OK', 500);
    await this.chat('19 52 FF 00', '6CF16059', 2000);
    await sleep(150);

    this.onStatusChange('Varredura de diagnóstico Harley J1850 concluída!');

    // Restaura monitoramento de painel em tempo real
    await this.resumeLiveDashboard();
  }

  /**
   * Procedimento de limpeza de falhas Harley J1850 (HarleyDroid clearDTC)
   * Envia sequencialmente: 6C 10 F1 14, 6C 40 F1 14, 6C 60 F1 14
   */
  public async clearDTC(): Promise<boolean> {
    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

    this.onStatusChange('Interrompendo monitoramento para limpeza de DTCs...');
    this.stopActivePolling();
    await this.sendBreak();
    await sleep(300);

    let confirmedCount = 0;

    // 1. Limpa ECM (Nó 0x10)
    this.onStatusChange('Apagando falhas da ECM (6C 10 F1 14)...');
    await this.chat('ATSH 6C 10 F1', 'OK', 500);
    const r1 = await this.chat('14', '6CF11054', 1000);
    if (r1.success) confirmedCount++;
    await sleep(150);

    // 2. Limpa BCM/TSM (Nó 0x40)
    this.onStatusChange('Apagando falhas do BCM/TSM (6C 40 F1 14)...');
    await this.chat('ATSH 6C 40 F1', 'OK', 500);
    const r2 = await this.chat('14', '6CF14054', 1000);
    if (r2.success) confirmedCount++;
    await sleep(150);

    // 3. Limpa Velocímetro (Nó 0x60)
    this.onStatusChange('Apagando falhas do Velocímetro (6C 60 F1 14)...');
    await this.chat('ATSH 6C 60 F1', 'OK', 500);
    const r3 = await this.chat('14', '6CF16054', 1000);
    if (r3.success) confirmedCount++;
    await sleep(200);

    // Se no simulador ou recebida resposta positiva, limpa listas locais
    if (this.connectionType === 'simulator' || confirmedCount > 0) {
      this.decoder.clearDtcLists();
      this.currentTelemetryState.activeDtcList = [];
      this.currentTelemetryState.historicDtcList = [];
      this.currentTelemetryState.checkEngine = false;
      this.onTelemetryUpdate({ ...this.currentTelemetryState });
      this.onStatusChange('Falhas da Harley-Davidson apagadas com sucesso!');
    } else {
      this.onStatusChange('Aviso: ECU não confirmou resposta 54 para o comando 14.', true);
    }

    // Restaura monitoramento
    await this.resumeLiveDashboard();
    return confirmedCount > 0;
  }

  /**
   * Resumes live dashboard monitoring (re-enters ATMA or polling based on ConnectionConfig)
   */
  public async resumeLiveDashboard(): Promise<void> {
    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
    this.onStatusChange('Retornando ao Painel em Tempo Real...');
    this.stopActivePolling();
    await this.sendBreak();
    await sleep(250);

    // Reset default functional header
    await this.sendCommand('ATSH 68 6A F1');
    await sleep(200);

    // Se monitorMode for true (padrão Harley J1850), restaura ATMA
    if (this.activeConfig?.monitorMode !== false) {
      await this.sendCommand('ATMA');
      this.onStatusChange('Painel Harley-Davidson Ativo (ATMA)!');
    } else {
      this.startActivePolling();
      this.onStatusChange('Painel Harley-Davidson Ativo (Polling)!');
    }
  }

  /**
   * Sends raw string to ELM327
   */
  public async sendCommand(cmd: string): Promise<boolean> {
    const clean = cmd.trim();
    const formatted = (clean || ' ') + '\r';

    this.onPacketLog({
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type: 'tx',
      raw: clean || '\\r',
      decoded: `Comando enviado: ${clean || 'BREAK'}`,
      tag: 'AT',
    });

    try {
      if (this.connectionType === 'bluetooth' && this.txCharacteristic) {
        await this.writeBleCharacteristic(this.txCharacteristic, this.textEncoder.encode(formatted));
        return true;
      } else if (this.connectionType === 'serial' && this.serialWriter) {
        await this.serialWriter.write(this.textEncoder.encode(formatted));
        return true;
      } else if (this.connectionType === 'simulator') {
        this.simulateCommandResponse(clean);
        return true;
      }
    } catch (err: any) {
      this.onPacketLog({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'error',
        raw: clean,
        decoded: `Falha no envio: ${err.message || err}`,
        tag: 'AT',
      });
    }
    return false;
  }

  /**
   * Process raw byte chunks coming from Bluetooth, Serial or Simulator using persistent RX buffer
   */
  private handleIncomingData(data: ArrayBuffer | Uint8Array | DataView) {
    let chunkStr = '';
    if (data instanceof DataView) {
      chunkStr = this.textDecoder.decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    } else {
      chunkStr = this.textDecoder.decode(data);
    }

    this.rxBuffer += chunkStr;

    // Extrai linhas completas delimitadas por \r, \n ou prompt '>'
    const completeLines: string[] = [];
    while (this.rxBuffer.length > 0) {
      const crIdx = this.rxBuffer.indexOf('\r');
      const lfIdx = this.rxBuffer.indexOf('\n');
      const promptIdx = this.rxBuffer.indexOf('>');

      const validIndices = [crIdx, lfIdx, promptIdx].filter((i) => i !== -1);
      if (validIndices.length === 0) {
        // Sem delimitadores completos disponíveis; mantém fragmento pendente no buffer
        break;
      }

      const nextDelimiter = Math.min(...validIndices);
      const lineSegment = this.rxBuffer.substring(0, nextDelimiter).trim();
      const delimiterChar = this.rxBuffer[nextDelimiter];

      // Avança além do delimitador consumido (se for \r\n, consome ambos)
      if (this.rxBuffer.startsWith('\r\n', nextDelimiter)) {
        this.rxBuffer = this.rxBuffer.substring(nextDelimiter + 2);
      } else {
        this.rxBuffer = this.rxBuffer.substring(nextDelimiter + 1);
      }

      if (lineSegment) {
        completeLines.push(lineSegment);
      } else if (delimiterChar === '>') {
        completeLines.push('>');
      }
    }

    // Processa a MESMA linha completa para listeners/chat, decoder e logs
    for (const line of completeLines) {
      // 1. Notifica listeners de resposta ativos (rotina chat)
      for (const listener of [...this.responseListeners]) {
        listener(line);
      }

      // 2. Decodifica a linha pelo J1850Decoder oficial e emite logs
      const updated = this.decoder.parseChunk(line + '\r\n', this.currentTelemetryState, (packet) => {
        this.onPacketLog(packet);
      });

      this.currentTelemetryState = updated;
    }

    if (completeLines.length > 0) {
      this.onTelemetryUpdate({ ...this.currentTelemetryState });
    }
  }

  /**
   * Start Harley-Davidson J1850 Simulator
   */
  public startSimulator() {
    this.disconnect();
    this.connectionType = 'simulator';
    this.simRunning = true;
    this.simStreamPaused = false;
    this.simRpm = 980;
    this.simTargetRpm = 980;
    this.simSpeed = 0;
    this.simTargetSpeed = 0;
    this.simTempF = 180;
    this.simGear = 'N';
    this.simActiveDtcs = ['P0131'];
    this.simHistoricDtcs = ['P0107', 'P0118'];

    this.currentTelemetryState = {
      rpm: 980,
      speedKmH: 0,
      speedMph: 0,
      engineTempF: 180,
      engineTempC: 82,
      batteryVoltage: 14.1,
      gear: 'N',
      turnLeft: false,
      turnRight: false,
      neutral: true,
      checkEngine: true,
      oilWarning: false,
      highBeam: false,
      clutchEngaged: false,
      fuelLevelPercent: 78,
      odometerKm: this.simOdometerKm,
      engineHoursTotal: this.simEngineHours,
      engineMinutesTotal: this.simEngineMinutes,
      engineIgnitionCycles: this.simEngineStarts,
      vin: '1HD1BX1194K012345',
      ecuPartNumber: '32124-04B',
      ecuCalId: '32852-04A',
      ecuSoftwareLevel: 8,
      activeDtcList: [...this.simActiveDtcs],
      historicDtcList: [...this.simHistoricDtcs],
      lastUpdated: Date.now(),
    };

    this.onStatusChange('Simulador Harley J1850 Ativo! Motor em marcha lenta.');
    this.onPacketLog({
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type: 'info',
      raw: 'SIMULATOR_STARTED',
      decoded: 'Simulador Harley-Davidson Big Twin iniciado com transmissão J1850 ativa',
      tag: 'STATUS',
    });

    this.onTelemetryUpdate(this.currentTelemetryState);

    let tick = 0;
    this.simTimer = setInterval(() => {
      tick++;

      // Dinâmica de RPM e oscilação orgânica do V-Twin Harley
      if (this.simTargetRpm <= 1050) {
        // Marcha lenta natural Harley (oscilação orgânica ~950 a 1020 RPM)
        const lopeWave = Math.sin(tick * 0.35) * 22;
        const randomPuff = (Math.random() - 0.5) * 26;
        this.simRpm = Math.round(this.simTargetRpm + lopeWave + randomPuff);
      } else {
        // Aceleração progressiva com inércia mecânica suave
        this.simRpm += (this.simTargetRpm - this.simRpm) * 0.25 + (Math.random() - 0.5) * 15;
      }
      this.simRpm = Math.max(0, Math.min(6500, Math.round(this.simRpm)));

      this.simSpeed += (this.simTargetSpeed - this.simSpeed) * 0.2;
      this.simSpeed = Math.max(0, Math.min(220, Math.round(this.simSpeed)));

      if (this.simSpeed > 0) {
        this.simOdometerKm += (this.simSpeed / 3600) * 0.12;
      }

      if (this.simRpm > 0 && tick % 500 === 0) {
        this.simEngineMinutes += 1;
        if (this.simEngineMinutes >= 60) {
          this.simEngineMinutes = 0;
          this.simEngineHours += 1;
        }
      }

      if (this.simRpm > 0 && this.simTempF < 210) {
        this.simTempF += 0.05;
      }

      // Transmissão periódica dos frames J1850 da Harley (pausada durante varredura diagnóstica)
      if (!this.simStreamPaused && tick % 2 === 0) {
        // Frame RPM: 28 1B 10 02 XX XX
        const rpmHex = (Math.round(this.simRpm * 4)).toString(16).padStart(4, '0').toUpperCase();
        const rpmFrame = `28 1B 10 02 ${rpmHex.substring(0, 2)} ${rpmHex.substring(2, 4)}`;

        // Frame Velocidade: 48 29 10 02 XX XX
        const speedHex = (Math.round(this.simSpeed * 128)).toString(16).padStart(4, '0').toUpperCase();
        const speedFrame = `48 29 10 02 ${speedHex.substring(0, 2)} ${speedHex.substring(2, 4)}`;

        // Frame Temperatura: A8 49 10 10 XX
        const tempHex = Math.round(this.simTempF).toString(16).padStart(2, '0').toUpperCase();
        const tempFrame = `A8 49 10 10 ${tempHex}`;

        // Frame Marcha Real: A8 3B 10 03 XX
        let gearByteHex = '00';
        if (this.simGear === 1) gearByteHex = '01';
        else if (this.simGear === 2) gearByteHex = '03';
        else if (this.simGear === 3) gearByteHex = '07';
        else if (this.simGear === 4) gearByteHex = '0F';
        else if (this.simGear === 5) gearByteHex = '1F';
        else if (this.simGear === 6) gearByteHex = '3F';
        const gearFrame = `A8 3B 10 03 ${gearByteHex}`;

        // Frame Neutro / Embreagem: 48 3B 40 XX (bit 0x20 neutro, bit 0x80 embreagem)
        const neutralByte = (this.simGear === 'N' ? 0x20 : 0x00) | (this.simGear === 'N' ? 0x80 : 0x00);
        const neutralFrame = `48 3B 40 ${neutralByte.toString(16).padStart(2, '0').toUpperCase()}`;

        // Frame Odômetro: A8 69 10 06 XX XX (ticks = km / 0.0004)
        const ticks = Math.round(this.simOdometerKm / 0.0004) % 65536;
        const odoHex = ticks.toString(16).padStart(4, '0').toUpperCase();
        const odoFrame = `A8 69 10 06 ${odoHex.substring(0, 2)} ${odoHex.substring(2, 4)}`;

        // Processa os frames J1850 pelo decoder oficial e atualiza o estado de telemetria
        this.currentTelemetryState = this.decoder.parseChunk(
          `${rpmFrame}\r\n${speedFrame}\r\n${tempFrame}\r\n${gearFrame}\r\n${neutralFrame}\r\n${odoFrame}\r\n`,
          this.currentTelemetryState,
          (p) => {
            this.onPacketLog(p);
          }
        );

        // Oscilação de Sondas Lambda O2
        const timeSec = tick * 0.05;
        const o2Oscillation = Math.sin(timeSec * 6);
        const frontO2 = this.simRpm > 0 ? Number((0.50 + 0.35 * o2Oscillation + (Math.random() - 0.5) * 0.03).toFixed(3)) : 0.450;
        const rearO2 = this.simRpm > 0 ? Number((0.50 + 0.34 * Math.sin(timeSec * 6 + 0.85) + (Math.random() - 0.5) * 0.03).toFixed(3)) : 0.450;
        const frontTrim = Number(((frontO2 - 0.5) * -7.5 + (Math.random() - 0.5) * 1.2).toFixed(1));
        const rearTrim = Number(((rearO2 - 0.5) * -7.5 + (Math.random() - 0.5) * 1.2).toFixed(1));
        const tps = Math.min(100, Math.max(0, Math.round((this.simSpeed / 200) * 75 + (this.simRpm / 6000) * 25)));
        const map = Math.min(100, Math.max(32, Math.round(38 + (tps / 100) * 58 + (Math.random() - 0.5) * 2)));

        this.currentTelemetryState.frontO2Voltage = frontO2;
        this.currentTelemetryState.rearO2Voltage = rearO2;
        this.currentTelemetryState.frontShortTermFuelTrim = frontTrim;
        this.currentTelemetryState.rearShortTermFuelTrim = rearTrim;
        this.currentTelemetryState.frontAFR = Number((14.7 - (frontO2 - 0.45) * 2.6).toFixed(2));
        this.currentTelemetryState.rearAFR = Number((14.7 - (rearO2 - 0.45) * 2.6).toFixed(2));
        this.currentTelemetryState.throttlePosition = tps;
        this.currentTelemetryState.manifoldPressureKpa = map;
        this.currentTelemetryState.batteryVoltage = Number((14.1 + (Math.random() - 0.5) * 0.2).toFixed(1));
        this.currentTelemetryState.lastUpdated = Date.now();

        this.onTelemetryUpdate({ ...this.currentTelemetryState });
      }
    }, 120);
  }

  public updateSimulatorInputs(targetRpm: number, targetSpeed: number, gear: number | 'N') {
    this.simTargetRpm = targetRpm;
    this.simTargetSpeed = targetSpeed;
    this.simGear = gear;
  }

  /**
   * Simula comandos Harley J1850 de acordo com as consultas do HarleyDroid
   */
  private simulateCommandResponse(cmd: string) {
    const u = cmd.toUpperCase().trim();
    let resp = 'OK';

    if (u.startsWith('ATSH')) {
      this.simCurrentHeader = u.replace('ATSH', '').trim();
      resp = 'OK';
    } else if (u === 'ATMA' || u.startsWith('ATMA')) {
      this.simStreamPaused = false;
      resp = 'OK';
    } else if (u === 'ATZ') {
      resp = 'ELM327 v1.5';
    } else if (u.startsWith('AT')) {
      resp = 'OK';
    }
    // Harley ECM Identification responses: 0C F1 10 7C ...
    else if (u === '3C 01' || u === '3C01') {
      // P/N Bloco 1 (ASCII: '32124-') -> 33 32 31 32 34 2D
      resp = '0C F1 10 7C 01 33 32 31 32 34 2D';
    } else if (u === '3C 02' || u === '3C02') {
      // P/N Bloco 2 (ASCII: '04B   ') -> 30 34 42 20 20 20
      resp = '0C F1 10 7C 02 30 34 42 20 20 20';
    } else if (u === '3C 03' || u === '3C03') {
      // CalID Bloco 1 (ASCII: '32852-') -> 33 32 38 35 32 2D
      resp = '0C F1 10 7C 03 33 32 38 35 32 2D';
    } else if (u === '3C 04' || u === '3C04') {
      // CalID Bloco 2 (ASCII: '04A   ') -> 30 34 41 20 20 20
      resp = '0C F1 10 7C 04 30 34 41 20 20 20';
    } else if (u === '3C 0B' || u === '3C0B') {
      // SW Level = 8
      resp = '0C F1 10 7C 0B 08';
    } else if (u === '3C 0F' || u === '3C0F') {
      // VIN Bloco 1 (ASCII: '1HD1BX') -> 31 48 44 31 42 58
      resp = '0C F1 10 7C 0F 31 48 44 31 42 58';
    } else if (u === '3C 10' || u === '3C10') {
      // VIN Bloco 2 (ASCII: '1194K0') -> 31 31 39 34 4B 30
      resp = '0C F1 10 7C 10 31 31 39 34 4B 30';
    } else if (u === '3C 11' || u === '3C11') {
      // VIN Bloco 3 (ASCII: '12345') -> 31 32 33 34 35
      resp = '0C F1 10 7C 11 31 32 33 34 35';
    }
    // Harley DTCs Read (19 52 FF 00)
    else if (u === '19 52 FF 00' || u === '1952FF00') {
      if (this.simCurrentHeader.includes('10')) {
        // ECM Histórico: P0107 (01 07), P0118 (01 18)
        resp = this.simHistoricDtcs.length > 0 ? '6C F1 10 59 01 07 01 18' : '6C F1 10 59 00 00';
      } else if (this.simCurrentHeader.includes('40')) {
        // BCM/TSM Atual: P0131 (01 31)
        resp = this.simActiveDtcs.length > 0 ? '6C F1 40 59 01 31' : '6C F1 40 59 00 00';
      } else {
        // Velocímetro (Nó 0x60): Sem falhas
        resp = '6C F1 60 59 00 00';
      }
    }
    // Harley Clear DTC (14)
    else if (u === '14') {
      if (this.simCurrentHeader.includes('10')) {
        resp = '6C F1 10 54';
        this.simHistoricDtcs = [];
      } else if (this.simCurrentHeader.includes('40')) {
        resp = '6C F1 40 54';
        this.simActiveDtcs = [];
      } else {
        resp = '6C F1 60 54';
      }

      // Se todas as falhas foram limpas, inicia o temporizador de 3 segundos para gerar uma nova falha aleatória
      if (this.simActiveDtcs.length === 0 && this.simHistoricDtcs.length === 0) {
        if (this.simDtcSpawnTimer) {
          clearTimeout(this.simDtcSpawnTimer);
        }
        this.simDtcSpawnTimer = setTimeout(() => {
          if (this.connectionType !== 'simulator') return;

          const possibleFaults = [
            { code: 'P0131', hex: '01 31', desc: 'Sensor de O2 Dianteiro Pobre / Sinal Baixo' },
            { code: 'P0562', hex: '05 62', desc: 'Tensão do Sistema Baixa (Bateria/Carga)' },
            { code: 'P0118', hex: '01 18', desc: 'Sensor ET (Temperatura do Motor) Aberto/Alto' },
            { code: 'P0505', hex: '05 05', desc: 'Controle de Marcha Lenta (IAC) com Perda de Passo' },
            { code: 'P1356', hex: '13 56', desc: 'Sem Combustão no Cilindro Traseiro (Misfire)' },
            { code: 'P0107', hex: '01 07', desc: 'Sensor MAP Circuito Aberto/Baixo' },
            { code: 'P0261', hex: '02 61', desc: 'Injetor Frontal Aberto/Baixo' },
            { code: 'P0122', hex: '01 22', desc: 'Sensor TPS 1 Tensão Baixa' },
          ];

          const randomFault = possibleFaults[Math.floor(Math.random() * possibleFaults.length)];
          this.simActiveDtcs = [randomFault.code];
          this.currentTelemetryState.activeDtcList = [randomFault.code];
          this.currentTelemetryState.checkEngine = true;

          // Emite log da nova falha e ativação da lâmpada MIL no J1850
          this.onPacketLog({
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            type: 'rx',
            raw: `6C F1 40 59 ${randomFault.hex}`,
            decoded: `[SIMULADOR] Nova falha gravada na ECU: ${randomFault.code} - ${randomFault.desc}`,
            tag: 'DTC',
          });

          this.onPacketLog({
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            type: 'rx',
            raw: '68 88 10 83',
            decoded: 'Harley J1850: Lâmpada de Injeção Eletrônica (MIL) ATIVADA [Nova Falha]',
            tag: 'DTC',
          });

          this.onStatusChange(`Simulador: Nova falha detectada após 3s (${randomFault.code}). Luz de injeção acendeu!`);
          this.onTelemetryUpdate({ ...this.currentTelemetryState });
        }, 3000);
      }
    }

    setTimeout(() => {
      this.handleIncomingData(this.textEncoder.encode(resp + '\r\n'));
    }, 80);
  }

  /**
   * Executa teste bidirecional de atuadores (Controle Ativo da Moto / ECU Delphi / TSSM / Painel)
   */
  public async runActuatorTest(testId: string): Promise<{ success: boolean; message: string }> {
    this.onPacketLog({
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type: 'tx',
      raw: `TEST:${testId.toUpperCase()}`,
      decoded: `Solicitando teste ativo de atuador: ${testId}`,
      tag: 'ACTUATOR',
    });

    if (this.connectionType === 'simulator') {
      return this.simulateActuatorTest(testId);
    }

    let cmd = '';
    switch (testId) {
      case 'fuel_pump':
        cmd = '30 01 01';
        break;
      case 'spark_front':
        cmd = '30 02 01';
        break;
      case 'spark_rear':
        cmd = '30 03 01';
        break;
      case 'needle_sweep':
        cmd = '48 29 10 02 FF FF';
        break;
      case 'turn_left':
        cmd = '68 88 10 01';
        break;
      case 'turn_right':
        cmd = '68 88 10 02';
        break;
      case 'exhaust_valve':
        cmd = '30 05 01';
        break;
      case 'intake_solenoid':
        cmd = '30 06 01';
        break;
      default:
        cmd = '30 01 01';
    }

    try {
      await this.sendCommand(cmd);
      return { success: true, message: `Comando [${cmd}] transmitido com sucesso ao barramento J1850.` };
    } catch (e: any) {
      return { success: false, message: `Falha ao transmitir: ${e.message || e}` };
    }
  }

  private async simulateActuatorTest(testId: string): Promise<{ success: boolean; message: string }> {
    switch (testId) {
      case 'fuel_pump':
        this.onStatusChange('Atuador: Bomba de combustível acionada por 3 segundos (pressurizando 4.1 bar / 60 PSI)...');
        this.onPacketLog({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: '70 01 01 3C',
          decoded: 'ECU Delphi: Relé da Bomba Ligado. Pressão no rail: 60 PSI [OK]',
          tag: 'ACTUATOR',
        });
        return { success: true, message: 'Bomba de combustível pressurizada por 3s com sucesso (4.1 bar).' };

      case 'spark_front':
        this.onStatusChange('Atuador: 5 pulsos de centelha disparados na vela do cilindro dianteiro...');
        this.onPacketLog({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: '70 02 01 05',
          decoded: 'ECU Delphi: Bobina 1 disparou 5 pulsos de ignição no Cilindro Frontal [OK]',
          tag: 'ACTUATOR',
        });
        return { success: true, message: 'Bobina dianteira disparou 5 faíscas de alta tensão perfeitamente.' };

      case 'spark_rear':
        this.onStatusChange('Atuador: 5 pulsos de centelha disparados na vela do cilindro traseiro...');
        this.onPacketLog({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: '70 03 01 05',
          decoded: 'ECU Delphi: Bobina 2 disparou 5 pulsos de ignição no Cilindro Traseiro [OK]',
          tag: 'ACTUATOR',
        });
        return { success: true, message: 'Bobina traseira disparou 5 faíscas de alta tensão perfeitamente.' };

      case 'needle_sweep': {
        this.onStatusChange('Atuador: Teste de varredura (Gauge Needle Sweep) executando...');
        const originalRpm = this.simTargetRpm;
        const originalSpeed = this.simTargetSpeed;
        this.simTargetRpm = 6000;
        this.simTargetSpeed = 220;
        setTimeout(() => {
          this.simTargetRpm = 0;
          this.simTargetSpeed = 0;
          setTimeout(() => {
            this.simTargetRpm = originalRpm;
            this.simTargetSpeed = originalSpeed;
            this.onStatusChange('Varredura concluída: motores de passo do velocímetro e tacômetro operacionais.');
          }, 1200);
        }, 1200);
        return { success: true, message: 'Varredura completa de ponteiros 0 -> Max -> 0 executada.' };
      }

      case 'turn_left':
        this.onStatusChange('Atuador: TSSM/BCM acionou pisca dianteiro e traseiro esquerdos por 4s...');
        return { success: true, message: 'Circuito do pisca esquerdo acionado e verificado no TSSM.' };

      case 'turn_right':
        this.onStatusChange('Atuador: TSSM/BCM acionou pisca dianteiro e traseiro direitos por 4s...');
        return { success: true, message: 'Circuito do pisca direito acionado e verificado no TSSM.' };

      case 'exhaust_valve':
        this.onStatusChange('Atuador: Servomotor da Válvula Ativa de Escape movimentado (Aberto/Fechado)...');
        return { success: true, message: 'Servomotor da válvula de escape respondeu com ciclo de 0° a 90°.' };

      case 'intake_solenoid':
        this.onStatusChange('Atuador: Solenoide da portinhola do filtro de ar comutado 3 vezes...');
        return { success: true, message: 'Solenoide do filtro de ar acionado com estalo mecânico [OK].' };

      default:
        return { success: true, message: 'Teste executado.' };
    }
  }

  /**
   * Clean disconnect
   */
  public disconnect() {
    this.stopActivePolling();

    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
    if (this.simDtcSpawnTimer) {
      clearTimeout(this.simDtcSpawnTimer);
      this.simDtcSpawnTimer = null;
    }
    this.simRunning = false;
    this.simStreamPaused = false;
    this.responseListeners = [];
    this.rxBuffer = '';
    this.decoder.resetCounters();

    if (this.gattServer && this.gattServer.connected) {
      try {
        this.gattServer.disconnect();
      } catch (e) {
        console.error(e);
      }
    }
    this.gattServer = null;
    this.bluetoothDevice = null;
    this.txCharacteristic = null;
    this.rxCharacteristic = null;

    if (this.serialReader) {
      this.serialKeepReading = false;
      try {
        this.serialReader.cancel();
      } catch (e) {
        console.error(e);
      }
    }
    if (this.serialPort) {
      try {
        this.serialPort.close();
      } catch (e) {
        console.error(e);
      }
      this.serialPort = null;
    }

    this.connectionType = 'disconnected';
    this.onStatusChange('Desconectado.');
  }
}
