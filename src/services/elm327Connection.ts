import { ConnectionConfig, ConnectionType, PacketLog, TelemetryData } from '../types';
import { J1850Decoder } from './j1850Decoder';

/**
 * Converte bytes brutos em string hexadecimal formatada (ex: "41 54 5A 0D")
 */
function formatBytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}

/**
 * Converte bytes brutos em representação ASCII segura (exibe caracteres legíveis e escapa controles)
 */
function formatBytesToSafeAscii(bytes: Uint8Array): string {
  let res = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x0d) res += '\\r';
    else if (b === 0x0a) res += '\\n';
    else if (b === 0x09) res += '\\t';
    else if (b >= 32 && b <= 126) res += String.fromCharCode(b);
    else res += `\\x${b.toString(16).padStart(2, '0').toUpperCase()}`;
  }
  return res;
}

/**
 * Lista de UUIDs de serviços GATT BLE conhecidos para adaptadores OBD2 (ELM327 / STN / clones)
 * 
 * NOTA DE ARQUITETURA (Bluetooth Classic/SPP vs BLE GATT):
 * O UUID '00001101-0000-1000-8000-00805f9b34fb' refere-se ao perfil Serial Port Profile (SPP)
 * clássico do Bluetooth 2.0/2.1 (RFCOMM). A Web Bluetooth API opera estritamente sobre
 * Bluetooth Low Energy (BLE) / GATT. Alguns adaptadores BLE expõem um serviço GATT customizado
 * usando o UUID do SPP de 16-bits mapeado na base Bluetooth, mas a comunicação real é sempre
 * via Characteristics GATT (leitura/escrita/notificações), não sockets RFCOMM de porta serial.
 */
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
  'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f', // Carista OBD BLE
  '0000fff9-0000-1000-8000-00805f9b34fb',
  '0000ff90-0000-1000-8000-00805f9b34fb',
  '00001101-0000-1000-8000-00805f9b34fb', // SPP Serial (Classic 16-bit UUID mapeado em base GATT)
];

export class ELM327Connection {
  private connectionType: ConnectionType = 'disconnected';
  private decoder = new J1850Decoder();
  private textDecoder = new TextDecoder('utf-8');
  private textEncoder = new TextEncoder();

  // Bluetooth objects com separação estrita de TX e RX
  private bluetoothDevice: any = null;
  private gattServer: any = null;
  private bluetoothTxCharacteristic: any = null;
  private bluetoothRxCharacteristic: any = null;

  // Aliases para compatibilidade interna
  private get txCharacteristic(): any {
    return this.bluetoothTxCharacteristic;
  }
  private set txCharacteristic(c: any) {
    this.bluetoothTxCharacteristic = c;
  }
  private get rxCharacteristic(): any {
    return this.bluetoothRxCharacteristic;
  }
  private set rxCharacteristic(c: any) {
    this.bluetoothRxCharacteristic = c;
  }

  // Active polling timer for real hardware fallback
  private pollTimer: any = null;

  // Incoming data listeners for request/expect flow (HarleyDroid chat mechanism)
  private responseListeners: Array<(line: string) => void> = [];
  private isDiagnosticBusy: boolean = false;

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
   * Prioriza escrita COM resposta (writeValueWithResponse) quando suportada e registra [BLE-TX-MODE] e [BLE-TX-RAW]
   */
  private async writeBleCharacteristic(char: any, data: Uint8Array): Promise<void> {
    if (!char) throw new Error('Característica BLE de envio não disponível');
    const props = char.properties || {};

    const hexStr = formatBytesToHex(data);
    const asciiStr = formatBytesToSafeAscii(data);

    // Prioriza escrita COM resposta GATT quando 'write=true' estiver disponível
    const hasWriteWithResponse = props.write === true && (typeof char.writeValueWithResponse === 'function' || typeof char.writeValue === 'function');
    const hasWriteWithoutResponse = props.writeWithoutResponse === true && typeof char.writeValueWithoutResponse === 'function';

    const useWithResponse = hasWriteWithResponse || !hasWriteWithoutResponse;
    const modeName = useWithResponse ? 'writeValueWithResponse' : 'writeValueWithoutResponse';

    // [BLE-TX-MODE] Log do modo de escrita GATT selecionado para esta transmissão
    this.onPacketLog({
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type: 'info',
      raw: modeName,
      decoded: `[BLE-TX-MODE] ${modeName}`,
      tag: 'AT',
    });

    // [BLE-TX-RAW] OBRIGATÓRIO: emitido imediatamente antes da escrita no canal BLE
    this.onPacketLog({
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type: 'tx',
      raw: hexStr,
      decoded: `[BLE-TX-RAW] HEX: ${hexStr} | ASCII: ${asciiStr}`,
      tag: 'AT',
    });

    if (useWithResponse) {
      if (typeof char.writeValueWithResponse === 'function') {
        await char.writeValueWithResponse(data);
      } else if (typeof char.writeValue === 'function') {
        await char.writeValue(data);
      } else {
        throw new Error('Canal Bluetooth não aceita gravação de dados com resposta.');
      }
    } else {
      if (typeof char.writeValueWithoutResponse === 'function') {
        await char.writeValueWithoutResponse(data);
      } else if (typeof char.writeValue === 'function') {
        await char.writeValue(data);
      } else {
        throw new Error('Canal Bluetooth não aceita gravação de dados sem resposta.');
      }
    }
  }

  /**
   * Connect via Web Bluetooth API (BLE OBD2 adapters)
   * Instrumentação completa de enumeração GATT, separação TX/RX e ativação segura de notificações
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

      this.onPacketLog({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'info',
        raw: 'BLE_CONNECTING',
        decoded: `[BLE] Conectando ao GATT Server de "${device.name || 'Dispositivo'}" (ID: ${device.id || 'N/A'})...`,
        tag: 'AT',
      });

      this.gattServer = await device.gatt.connect();
      this.onStatusChange('Bluetooth conectado! Descobrindo serviços e characteristics GATT...');

      this.onPacketLog({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'info',
        raw: 'BLE_CONNECTED',
        decoded: `[BLE] Bluetooth conectado ao GATT Server. Iniciando enumeração de serviços...`,
        tag: 'AT',
      });

      // 1. Enumeração dos Serviços Primários
      const discoveredServices: any[] = [];
      try {
        const allServices = await this.gattServer.getPrimaryServices();
        if (allServices && allServices.length > 0) {
          discoveredServices.push(...allServices);
        }
      } catch (e) {
        console.warn('getPrimaryServices() não retornou lista geral:', e);
      }

      // Complementa com busca individual caso a lista geral não tenha retornado todos os serviços
      for (const uuid of BLE_SERVICE_UUIDS) {
        if (!discoveredServices.some((s) => s.uuid.toLowerCase() === uuid.toLowerCase())) {
          try {
            const s = await this.gattServer.getPrimaryService(uuid);
            if (s) discoveredServices.push(s);
          } catch {
            // UUID não disponível no adaptador
          }
        }
      }

      if (discoveredServices.length === 0) {
        throw new Error('Nenhum serviço GATT encontrado no adaptador. Se for Bluetooth Classic v2.1 (não-BLE), conecte via "Serial USB / COM".');
      }

      // 2. Enumeração completa de todas as Characteristics disponíveis
      interface DiscoveredChar {
        service: any;
        char: any;
        serviceUuid: string;
        charUuid: string;
        properties: {
          read: boolean;
          write: boolean;
          writeWithoutResponse: boolean;
          notify: boolean;
          indicate: boolean;
        };
      }

      const allDiscoveredChars: DiscoveredChar[] = [];

      for (const service of discoveredServices) {
        try {
          const chars = await service.getCharacteristics();
          for (const char of chars) {
            const props = char.properties || {};
            const item: DiscoveredChar = {
              service,
              char,
              serviceUuid: service.uuid,
              charUuid: char.uuid,
              properties: {
                read: !!props.read,
                write: !!props.write,
                writeWithoutResponse: !!props.writeWithoutResponse,
                notify: !!props.notify,
                indicate: !!props.indicate,
              },
            };
            allDiscoveredChars.push(item);

            // [BLE-GATT] Log individual de auditoria
            this.onPacketLog({
              id: Math.random().toString(36).substring(2, 9),
              timestamp: new Date().toLocaleTimeString(),
              type: 'info',
              raw: `GATT: ${service.uuid} -> ${char.uuid}`,
              decoded: `[BLE-GATT] Service: ${service.uuid}\n[BLE-GATT] Characteristic: ${char.uuid}\n[BLE-GATT] properties:\nread=${item.properties.read}\nwrite=${item.properties.write}\nwriteWithoutResponse=${item.properties.writeWithoutResponse}\nnotify=${item.properties.notify}\nindicate=${item.properties.indicate}`,
              tag: 'AT',
            });
          }
        } catch (e: any) {
          console.warn(`Erro ao ler characteristics do serviço ${service.uuid}:`, e);
        }
      }

      if (allDiscoveredChars.length === 0) {
        throw new Error('Nenhuma characteristic encontrada nos serviços GATT do adaptador.');
      }

      // 3. Seleção explícita de TX e RX
      // TX precisa de: write OU writeWithoutResponse
      // RX precisa de: notify OU indicate
      this.bluetoothTxCharacteristic = null;
      this.bluetoothRxCharacteristic = null;

      // Prioridade 1: Characteristic com capacidade simultânea de Write e Notify/Indicate (ex: HM-10 FFE1)
      const bidirCandidate = allDiscoveredChars.find(
        (c) => (c.properties.write || c.properties.writeWithoutResponse) &&
               (c.properties.notify || c.properties.indicate)
      );

      let selectedTxItem: DiscoveredChar | null = null;
      let selectedRxItem: DiscoveredChar | null = null;

      if (bidirCandidate) {
        selectedTxItem = bidirCandidate;
        selectedRxItem = bidirCandidate;
      } else {
        // Prioridade 2: Par TX e RX no mesmo serviço (ex: Nordic UART 6e400002 TX e 6e400003 RX)
        for (const s of discoveredServices) {
          const sChars = allDiscoveredChars.filter((c) => c.serviceUuid === s.uuid);
          const sTx = sChars.find((c) => c.properties.write || c.properties.writeWithoutResponse);
          const sRx = sChars.find((c) => c.properties.notify || c.properties.indicate);
          if (sTx && sRx) {
            selectedTxItem = sTx;
            selectedRxItem = sRx;
            break;
          }
        }

        // Prioridade 3: Qualquer TX e RX válidos no dispositivo
        if (!selectedTxItem) {
          selectedTxItem = allDiscoveredChars.find((c) => c.properties.write || c.properties.writeWithoutResponse) || null;
        }
        if (!selectedRxItem) {
          selectedRxItem = allDiscoveredChars.find((c) => c.properties.notify || c.properties.indicate) || null;
        }
      }

      // Validação das characteristics selecionadas
      if (!selectedTxItem) {
        this.onPacketLog({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'error',
          raw: 'BLE_NO_TX',
          decoded: '[BLE] Erro fatal: Nenhuma characteristic TX com write/writeWithoutResponse encontrada no adaptador.',
          tag: 'AT',
        });
        throw new Error('Bluetooth conectado, mas nenhuma characteristic TX com suporte a escrita foi encontrada.');
      }

      if (!selectedRxItem) {
        this.onPacketLog({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'error',
          raw: 'BLE_NO_RX',
          decoded: '[BLE] Erro fatal: Bluetooth conectado, mas nenhuma characteristic RX Notify/Indicate foi encontrada.',
          tag: 'AT',
        });
        throw new Error('Bluetooth conectado, mas nenhuma characteristic RX Notify/Indicate foi encontrada.');
      }

      this.bluetoothTxCharacteristic = selectedTxItem.char;
      this.bluetoothRxCharacteristic = selectedRxItem.char;

      // [BLE] Log da instrumentação da escolha
      this.onPacketLog({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'info',
        raw: 'BLE_SELECTION',
        decoded: `[BLE] TX characteristic selecionada: ${selectedTxItem.charUuid} (Service: ${selectedTxItem.serviceUuid}, write=${selectedTxItem.properties.write}, writeWithoutResponse=${selectedTxItem.properties.writeWithoutResponse})\n[BLE] RX characteristic selecionada: ${selectedRxItem.charUuid} (Service: ${selectedRxItem.serviceUuid}, notify=${selectedRxItem.properties.notify}, indicate=${selectedRxItem.properties.indicate})`,
        tag: 'AT',
      });

      // 4. Ativação correta do canal RX:
      // a) Registrar listener 'characteristicvaluechanged' ANTES de iniciar comandos
      this.onPacketLog({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'info',
        raw: 'BLE_LISTENER_REGISTER',
        decoded: `[BLE] Listener RX registrado na characteristic ${selectedRxItem.charUuid}`,
        tag: 'AT',
      });

      this.bluetoothRxCharacteristic.addEventListener(
        'characteristicvaluechanged',
        (event: any) => {
          const valueView = event.target.value as DataView;
          if (!valueView) return;
          const rawBytes = new Uint8Array(valueView.buffer, valueView.byteOffset, valueView.byteLength);
          const hexStr = formatBytesToHex(rawBytes);
          const asciiStr = formatBytesToSafeAscii(rawBytes);

          // [BLE-RX-RAW] OBRIGATÓRIO: emitido antes de qualquer parser ou buffer
          this.onPacketLog({
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            type: 'rx',
            raw: hexStr,
            decoded: `[BLE-RX-RAW] HEX: ${hexStr} | ASCII: ${asciiStr}`,
            tag: 'AT',
          });

          this.handleIncomingData(rawBytes);
        }
      );

      // b) Iniciar notificações na characteristic RX
      this.onPacketLog({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'info',
        raw: 'BLE_START_NOTIFY_REQ',
        decoded: `[BLE] startNotifications() solicitado na characteristic ${selectedRxItem.charUuid}`,
        tag: 'AT',
      });

      try {
        await this.bluetoothRxCharacteristic.startNotifications();
        this.onPacketLog({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'info',
          raw: 'BLE_NOTIFY_ACTIVE',
          decoded: `[BLE] RX notifications ATIVADAS com sucesso na characteristic ${selectedRxItem.charUuid}`,
          tag: 'AT',
        });
      } catch (notifyErr: any) {
        this.onPacketLog({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'error',
          raw: 'BLE_NOTIFY_FAIL',
          decoded: `[BLE] Falha ao ativar startNotifications(): ${notifyErr.message || notifyErr}`,
          tag: 'AT',
        });
        throw new Error(`Falha ao ativar notificações RX no adaptador Bluetooth: ${notifyErr.message || notifyErr}`);
      }

      this.connectionType = 'bluetooth';
      this.onStatusChange('Bluetooth pronto! Executando handshake ELM327...');

      // 5. Handshake ELM327 dirigido por resposta (valida ATZ, ATE0, etc.)
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
            const rawBytes = value instanceof Uint8Array ? value : new Uint8Array(value);
            const hexStr = formatBytesToHex(rawBytes);
            const asciiStr = formatBytesToSafeAscii(rawBytes);

            // [SERIAL-RX-RAW] Emitido imediatamente quando readSerialLoop() recebe bytes da porta, ANTES de parser ou buffer
            this.onPacketLog({
              id: Math.random().toString(36).substring(2, 9),
              timestamp: new Date().toLocaleTimeString(),
              type: 'rx',
              raw: hexStr,
              decoded: `[SERIAL-RX-RAW] HEX: ${hexStr} | ASCII: ${asciiStr}`,
              tag: 'AT',
            });

            this.handleIncomingData(rawBytes);
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
   * Send AT initialization commands sequence to ELM327 dirigido por resposta (Handshake validado)
   * Substitui sleeps cegos por validação de resposta via chat(). Não permite ATMA se houver falha.
   */
  public async initializeELM327(config: ConnectionConfig) {
    this.activeConfig = config;
    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

    const logHandshakeSuccess = (cmd: string, detail: string) => {
      this.onPacketLog({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'rx',
        raw: detail,
        decoded: `[ELM-HANDSHAKE] ${cmd}: OK${detail ? ` (${detail})` : ''}`,
        tag: 'AT',
      });
    };

    const logHandshakeFailure = (cmd: string, reply: string) => {
      this.onPacketLog({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'error',
        raw: `FAIL: ${cmd}`,
        decoded: `[ELM-HANDSHAKE] ${cmd}: TIMEOUT / SEM RESPOSTA VÁLIDA. Resposta obtida: ${reply.trim() || 'NENHUMA'}`,
        tag: 'AT',
      });
    };

    try {
      // 1. ATZ (Reset) - aguarda conteúdo real de identificação (ELM, STN, OBD) sem aceitar '>' isolado
      this.onStatusChange('Resetando ELM327 (ATZ)...');
      const rAtz = await this.chat('ATZ', 'ELM|STN|OBD', 2500);
      if (!rAtz.success) {
        logHandshakeFailure('ATZ', rAtz.reply);
        throw new Error('ELM327 não respondeu com identificação válida ao comando ATZ. Verifique se o adaptador está energizado e pareado.');
      }
      logHandshakeSuccess('ATZ', rAtz.reply.trim().replace(/[\r\n]+/g, ' '));
      await sleep(150);

      // 2. ATE0 (Echo OFF)
      this.onStatusChange('Configurando Echo OFF (ATE0)...');
      const rAte0 = await this.chat('ATE0', 'OK', 1000);
      if (!rAte0.success) {
        logHandshakeFailure('ATE0', rAte0.reply);
        throw new Error('ELM327 não respondeu com OK ao comando ATE0.');
      }
      logHandshakeSuccess('ATE0', 'OK');
      await sleep(100);

      // 3. ATL0 (Linefeeds OFF)
      this.onStatusChange('Configurando Linefeeds OFF (ATL0)...');
      const rAtl0 = await this.chat('ATL0', 'OK', 1000);
      if (!rAtl0.success) {
        logHandshakeFailure('ATL0', rAtl0.reply);
        throw new Error('ELM327 não respondeu com OK ao comando ATL0.');
      }
      logHandshakeSuccess('ATL0', 'OK');
      await sleep(100);

      // 4. ATS0 (Spaces OFF)
      this.onStatusChange('Configurando Spaces OFF (ATS0)...');
      const rAts0 = await this.chat('ATS0', 'OK', 1000);
      if (!rAts0.success) {
        logHandshakeFailure('ATS0', rAts0.reply);
        throw new Error('ELM327 não respondeu com OK ao comando ATS0.');
      }
      logHandshakeSuccess('ATS0', 'OK');
      await sleep(100);

      // 5. ATH1 (Headers ON) - CRÍTICO para Harley VPW
      this.onStatusChange('Ativando Headers de diagnóstico (ATH1)...');
      const rAth1 = await this.chat('ATH1', 'OK', 1000);
      if (!rAth1.success) {
        logHandshakeFailure('ATH1', rAth1.reply);
        throw new Error('ELM327 não respondeu com OK ao comando ATH1 (Headers ON).');
      }
      logHandshakeSuccess('ATH1', 'OK');
      await sleep(100);

      // 6. Protocolo J1850 (ATSP2)
      const protoCmd = config.protocol || 'ATSP2';
      this.onStatusChange(`Definindo protocolo ${protoCmd} (Harley VPW)...`);
      const rProto = await this.chat(protoCmd, 'OK', 1200);
      if (!rProto.success) {
        logHandshakeFailure(protoCmd, rProto.reply);
        throw new Error(`ELM327 não aceitou o protocolo ${protoCmd}.`);
      }
      logHandshakeSuccess(protoCmd, 'OK');
      await sleep(150);

      // 7. ATRV (Tensão da bateria) - validação explícita de tensão numérica real (\d+(?:\.\d+)?\s*V)
      this.onStatusChange('Lendo tensão de alimentação (ATRV)...');
      const rAtrv = await this.chat('ATRV', /\d+(?:\.\d+)?\s*V/i, 1200);
      if (!rAtrv.success) {
        logHandshakeFailure('ATRV', rAtrv.reply);
        throw new Error('ELM327 não respondeu com valor numérico de tensão válido ao comando ATRV.');
      }
      const voltMatch = rAtrv.reply.match(/(\d+(?:\.\d+)?)\s*V?/i);
      const voltStr = voltMatch ? `${voltMatch[1]}V` : rAtrv.reply.trim();
      logHandshakeSuccess('ATRV', voltStr);
      await sleep(150);

      this.onPacketLog({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'info',
        raw: 'ELM_READY',
        decoded: '[ELM-HANDSHAKE] Handshake concluído com sucesso! Protocolo Harley ativo.',
        tag: 'AT',
      });

      // 8. Ativação do modo Live (ATMA ou Polling)
      if (config.monitorMode) {
        this.stopActivePolling();
        this.onStatusChange('Ativando Monitor de diagnóstico contínuo (ATMA)...');
        await this.sendCommand('ATMA');
        this.onStatusChange('Painel Harley-Davidson Ativo (ATMA)!');
      } else {
        this.onStatusChange('Conectado ao ELM327! Modo Harley Ativo...');
        this.startActivePolling();
      }
    } catch (err: any) {
      this.onStatusChange(`Falha na inicialização do ELM327: ${err.message || err}`, true);
      throw err;
    }
  }

  public startActivePolling() {
    this.stopActivePolling();
    // ATMA e activePolling são mutuamente exclusivos: se monitorMode estiver ativo, não iniciar polling
    if (this.activeConfig?.monitorMode) {
      return;
    }

    // Em modo Harley, ATRV é consultado apenas como alimentação do ELM327; não é tensão ECM/J1850
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
   * Sends a break / abort signal (CR only) to stop ATMA streaming on ELM327.
   * Matches HarleyDroid's empty-line abort semantics and avoids sending
   * an extra character that can leave/restart monitor mode on some ELM327 clones.
   */
  public async sendBreak(): Promise<boolean> {
    const raw = '\r';
    try {
      if (this.connectionType === 'bluetooth' && this.txCharacteristic) {
        await this.writeBleCharacteristic(this.txCharacteristic, this.textEncoder.encode(raw));
        return true;
      } else if (this.connectionType === 'serial' && this.serialWriter) {
        const encoded = this.textEncoder.encode(raw);
        const hexStr = formatBytesToHex(encoded);
        const asciiStr = formatBytesToSafeAscii(encoded);
        this.onPacketLog({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'tx',
          raw: hexStr,
          decoded: `[SERIAL-TX-RAW] HEX: ${hexStr} | ASCII: ${asciiStr}`,
          tag: 'AT',
        });
        await this.serialWriter.write(encoded);
        return true;
      } else if (this.connectionType === 'simulator') {
        this.simStreamPaused = true;
        setTimeout(() => {
          this.handleIncomingData(this.textEncoder.encode('>\r\n'));
        }, 50);
        return true;
      }
    } catch (e) {
      console.warn('sendBreak warning:', e);
    }
    return false;
  }

  /**
   * Interrompe ATMA e só libera a próxima transação depois que o prompt ">"
   * do ELM foi realmente recebido pelo mesmo pipeline RX persistente.
   */
  private async stopMonitorAndWaitForPrompt(timeoutMs: number = 1500): Promise<boolean> {
    return new Promise(async (resolve) => {
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        const idx = this.responseListeners.indexOf(listener);
        if (idx !== -1) this.responseListeners.splice(idx, 1);
        clearTimeout(timer);
        if (ok) {
          // Qualquer fragmento anterior ao prompt pertence ao monitor interrompido.
          this.rxBuffer = '';
        }
        resolve(ok);
      };
      const listener = (line: string) => {
        if (line.trim() === '>') finish(true);
      };
      this.responseListeners.push(listener);
      const timer = setTimeout(() => finish(false), timeoutMs);
      const sent = await this.sendBreak();
      if (!sent) finish(false);
    });
  }

  /**
   * Mecanismo chat(send, expect, timeout) equivalente ao HarleyDroid
   * Transmite comando e aguarda resposta esperada antes de prosseguir
   * Suporta tokens alternativos via separador '|' (ex: "ELM|STN|OBD") ou RegExp explícita (ex: /\d+(?:\.\d+)?\s*V/i)
   */
  public async chat(cmd: string, expect: string | RegExp, timeoutMs: number = 800): Promise<{ success: boolean; reply: string }> {
    return new Promise(async (resolve) => {
      let resolved = false;
      let replyAccum = '';
      const isRegex = expect instanceof RegExp;
      const cleanExpect = isRegex ? '' : expect.replace(/[\s:]+/g, '').toUpperCase();
      const expectLabel = isRegex ? expect.toString() : expect;

      const listener = (line: string) => {
        replyAccum += line + '\n';
        let matches = false;
        if (isRegex) {
          matches = (expect as RegExp).test(replyAccum);
        } else {
          const cleanReply = replyAccum.replace(/[\s:]+/g, '').toUpperCase();
          matches = cleanExpect.split('|').some((token) => token && cleanReply.includes(token));
        }

        if (matches) {
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
            decoded: `Timeout aguardando "${expectLabel}" para o comando "${cmd}" (${timeoutMs}ms). Resposta obtida: ${replyAccum.trim() || 'NENHUMA'}`,
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
    // Uma única transação ativa pode controlar o ELM por vez. Sem esta trava,
    // dois cliques/acionamentos concorrentes podem interromper ATMA, trocar o
    // header e restaurar o monitoramento enquanto a outra consulta ainda roda.
    if (this.isDiagnosticBusy) {
      this.onStatusChange('Diagnóstico já está em andamento. Aguarde a conclusão da leitura atual.');
      return;
    }
    this.isDiagnosticBusy = true;

    try {
      const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

      this.onStatusChange('Interrompendo monitoramento contínuo (ATMA)...');
    this.stopActivePolling();
    const monitorStopped = await this.stopMonitorAndWaitForPrompt(1800);
    if (!monitorStopped) {
      this.onPacketLog({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'error',
        raw: 'ATMA_BREAK_NO_PROMPT',
        decoded: '[DIAGNÓSTICO] ATMA interrompido sem confirmação do prompt >. Scanner cancelado para não misturar monitoramento e comandos ativos.',
        tag: 'STATUS',
      });
      this.onStatusChange('Não foi possível sincronizar o ELM após interromper o monitoramento.', true);
      return;
    }
    this.onPacketLog({
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type: 'info',
      raw: 'ATMA_BREAK_PROMPT_OK',
      decoded: '[DIAGNÓSTICO] ATMA interrompido e prompt > confirmado. Iniciando transação ativa.',
      tag: 'STATUS',
    });

    // Reseta apenas estado de diagnóstico sem zerar odômetro live
    this.decoder.resetDiagnosticState();

    let idSuccessCount = 0;
    const totalIdQueries = 8;
    let dtcSuccessCount = 0;
    const totalDtcQueries = 3;

    // 1. CONSULTA DE IDENTIFICAÇÃO DA ECM (0C 10 F1)
    // Comandos 3C 01 até 3C 11
    this.onStatusChange('Configurando cabeçalho de identificação ECM (ATSH 0C 10 F1)...');
    const hId = await this.chat('ATSH 0C 10 F1', 'OK', 500);

    const idCommands = [
      { cmd: '3C 01', expect: '0CF1107C01', label: 'ECM Part Number bloco 01' },
      { cmd: '3C 02', expect: '0CF1107C02', label: 'ECM Part Number bloco 02' },
      { cmd: '3C 03', expect: '0CF1107C03', label: 'Calibration ID bloco 03' },
      { cmd: '3C 04', expect: '0CF1107C04', label: 'Calibration ID bloco 04' },
      { cmd: '3C 0B', expect: '0CF1107C0B', label: 'Software Level 0B' },
      { cmd: '3C 0F', expect: '0CF1107C0F', label: 'VIN bloco 0F' },
      { cmd: '3C 10', expect: '0CF1107C10', label: 'VIN bloco 10' },
      { cmd: '3C 11', expect: '0CF1107C11', label: 'VIN bloco 11' },
    ];

    if (!hId.success) {
      this.onPacketLog({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'error',
        raw: 'ATSH 0C 10 F1 FAIL',
        decoded: 'Erro ao configurar cabeçalho de identificação ECM (ATSH 0C 10 F1: OK não recebido). Bloco 3C pulado.',
        tag: 'AT',
      });
    } else {
      for (const item of idCommands) {
        this.onStatusChange(`Consultando ${item.label}...`);
        const res = await this.chat(item.cmd, item.expect, 600);
        if (res.success) {
          idSuccessCount++;
          this.onPacketLog({
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            type: 'rx',
            raw: res.reply.trim() || item.cmd,
            decoded: `[IDENTIFICAÇÃO] ${item.label}: OK`,
            tag: 'STATUS',
          });
        } else {
          this.onPacketLog({
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            type: 'error',
            raw: `FAIL: ${item.cmd}`,
            decoded: `[IDENTIFICAÇÃO] ${item.label}: TIMEOUT / SEM RESPOSTA ESPERADA`,
            tag: 'STATUS',
          });
        }
        // HarleyDroid aguarda o timeout do comando antes de avançar para o próximo bloco 3C.
        await sleep(500);
      }
    }

    // 2. CONSULTA DE DTCs HARLEY (6C 10/40/60 F1 19 52 FF 00)
    // A classificação histórico/atual é feita pela resposta: 0x10 = histórico, 0x40 = atual.
    // 0x60 é consultado pelo HarleyDroid, mas não é classificado como atual/histórico pelo parser original.
    // Endereço 0x10 = DTC histórico
    this.onStatusChange('Configurando cabeçalho DTC histórico (ATSH 6C 10 F1)...');
    const hDtc10 = await this.chat('ATSH 6C 10 F1', 'OK', 500);
    if (!hDtc10.success) {
      this.onPacketLog({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'error',
        raw: 'ATSH 6C 10 F1 FAIL',
        decoded: 'Erro ao configurar cabeçalho ATSH 6C 10 F1 para consulta de DTC histórico.',
        tag: 'AT',
      });
    } else {
      this.onStatusChange('Lendo DTCs históricos (resposta 0x10)...');
      const resDtc10 = await this.chat('19 52 FF 00', '6CF11059', 2000);
      if (resDtc10.success) {
        dtcSuccessCount++;
        this.onPacketLog({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: resDtc10.reply.trim() || '19 52 FF 00',
          decoded: '[DTC] Consulta resposta 0x10 (Histórico): OK',
          tag: 'DTC',
        });
      } else {
        this.onPacketLog({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'error',
          raw: 'FAIL: 19 52 FF 00 (0x10)',
          decoded: '[DTC] Consulta resposta 0x10 (Histórico): TIMEOUT / SEM RESPOSTA',
          tag: 'DTC',
        });
      }
    }
    // HarleyDroid aguarda GET_DTC_TIMEOUT (2000 ms) antes da próxima consulta.
    await sleep(2000);

    // Endereço 0x40 = DTC atual
    this.onStatusChange('Configurando cabeçalho DTC atual (ATSH 6C 40 F1)...');
    const hDtc40 = await this.chat('ATSH 6C 40 F1', 'OK', 500);
    if (!hDtc40.success) {
      this.onPacketLog({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'error',
        raw: 'ATSH 6C 40 F1 FAIL',
        decoded: 'Erro ao configurar cabeçalho ATSH 6C 40 F1 para consulta de DTC atual.',
        tag: 'AT',
      });
    } else {
      this.onStatusChange('Lendo DTCs atuais (resposta 0x40)...');
      const resDtc40 = await this.chat('19 52 FF 00', '6CF14059', 2000);
      if (resDtc40.success) {
        dtcSuccessCount++;
        this.onPacketLog({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: resDtc40.reply.trim() || '19 52 FF 00',
          decoded: '[DTC] Consulta resposta 0x40 (Atual): OK',
          tag: 'DTC',
        });
      } else {
        this.onPacketLog({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'error',
          raw: 'FAIL: 19 52 FF 00 (0x40)',
          decoded: '[DTC] Consulta resposta 0x40 (Atual): TIMEOUT / SEM RESPOSTA',
          tag: 'DTC',
        });
      }
    }
    await sleep(2000);

    // Endereço 0x60 = terceira consulta HarleyDroid; não classificada como atual/histórica no parser original
    this.onStatusChange('Configurando terceiro cabeçalho DTC (ATSH 6C 60 F1)...');
    const hDtc60 = await this.chat('ATSH 6C 60 F1', 'OK', 500);
    if (!hDtc60.success) {
      this.onPacketLog({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'error',
        raw: 'ATSH 6C 60 F1 FAIL',
        decoded: 'Erro ao configurar cabeçalho ATSH 6C 60 F1 para terceira consulta DTC.',
        tag: 'AT',
      });
    } else {
      this.onStatusChange('Lendo terceira resposta DTC (0x60)...');
      const resDtc60 = await this.chat('19 52 FF 00', '6CF16059', 2000);
      if (resDtc60.success) {
        dtcSuccessCount++;
        this.onPacketLog({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: resDtc60.reply.trim() || '19 52 FF 00',
          decoded: '[DTC] Consulta resposta 0x60 (não classificada): OK',
          tag: 'DTC',
        });
      } else {
        this.onPacketLog({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'error',
          raw: 'FAIL: 19 52 FF 00 (0x60)',
          decoded: '[DTC] Consulta resposta 0x60 (não classificada): TIMEOUT / SEM RESPOSTA',
          tag: 'DTC',
        });
      }
    }
    await sleep(2000);

    // 3. LEITURA ATIVA TTS/HDC2 - DPID 0x11 (somente leitura)
    // Evidência TTS/HDC2 decompilada: Mode 0x2A usa rate 0x01 e exatamente 6 slots de DPID.
    // Slots não usados são preenchidos com 0xFF. Para apenas DPID 0x11: 2A 01 11 FF FF FF FF FF.
    // DPID 0x11 retorna: RPM(2), Desired Idle(1), Battery(1), MAP(1), TPS(1).
    // Executada uma única vez durante a varredura; não altera o polling/ATMA contínuo.
    let activeDpid11Success = 0;
    this.onStatusChange('Lendo dados ativos ECM (TTS DPID 0x11: bateria/MAP/TPS)...');
    const hActive11 = await this.chat('ATSH 6C 10 F1', 'OK', 500);
    if (hActive11.success) {
      // O ELM327 limita normalmente mensagens OBD a 7 data bytes (ATNL).
      // O frame TTS/HDC2 para um único DPID possui 8 data bytes, então habilitamos
      // ATAL somente ao redor desta transação e restauramos ATNL em seguida.
      const allowLong = await this.chat('ATAL', 'OK', 500);
      if (!allowLong.success) {
        this.onPacketLog({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'error',
          raw: allowLong.reply.trim() || 'ATAL -> SEM RESPOSTA',
          decoded: '[SOURCE:ECM-ACTIVE][DPID:0x11] ELM327 não aceitou ATAL; requisição longa não foi enviada à ECM.',
          tag: 'AT',
        });
      } else {
        this.onPacketLog({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'info',
          raw: 'ATAL OK',
          decoded: '[SOURCE:ECM-ACTIVE][DPID:0x11] ELM327 habilitado temporariamente para mensagem longa de 8 data bytes.',
          tag: 'AT',
        });

        const resActive11 = await this.chat('2A 01 11 FF FF FF FF FF', '6CF1106A11', 1500);
        if (resActive11.success) {
          activeDpid11Success = 1;
          this.onPacketLog({
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            type: 'rx',
            raw: resActive11.reply.trim() || '2A 01 11 FF FF FF FF FF',
            decoded: '[SOURCE:ECM-ACTIVE][DPID:0x11] Resposta ECM recebida e encaminhada ao decoder.',
            tag: 'STATUS',
          });
        } else {
          const normalizedActive11Reply = resActive11.reply.toUpperCase().replace(/[\s:]/g, '');
          const negativeResponseMatch = normalizedActive11Reply.match(/6CF1107F2A(?:[0-9A-F]{2})*?([0-9A-F]{2})(?:[0-9A-F]{2})?$/);
          const isNegativeResponse = normalizedActive11Reply.includes('6CF1107F2A');
          const responseCode = negativeResponseMatch?.[1];
          const elmRejected = normalizedActive11Reply.includes('?');

          this.onPacketLog({
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            type: isNegativeResponse || elmRejected ? 'error' : 'info',
            raw: resActive11.reply.trim() || '2A 01 11 FF FF FF FF FF -> SEM RESPOSTA',
            decoded: isNegativeResponse
              ? `[SOURCE:ECM-ACTIVE][DPID:0x11] ECM respondeu negativamente ao Mode 0x2A${responseCode ? ` (código 0x${responseCode})` : ''}. Resposta preservada para diagnóstico; nenhum valor foi fabricado ou substituído.`
              : elmRejected
                ? '[SOURCE:ECM-ACTIVE][DPID:0x11] ELM327 devolveu ? mesmo com ATAL ativo; frame longo não foi aceito pelo adaptador.'
                : '[SOURCE:ECM-ACTIVE][DPID:0x11] Nenhuma resposta positiva/negativa da ECM foi recebida. Nenhum valor foi fabricado ou substituído.',
            tag: 'STATUS',
          });
        }

        const normalLength = await this.chat('ATNL', 'OK', 500);
        this.onPacketLog({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: normalLength.success ? 'info' : 'error',
          raw: normalLength.reply.trim() || 'ATNL -> SEM RESPOSTA',
          decoded: normalLength.success
            ? '[SOURCE:ECM-ACTIVE][DPID:0x11] ELM327 restaurado para comprimento normal (ATNL).'
            : '[SOURCE:ECM-ACTIVE][DPID:0x11] Falha ao restaurar ATNL; estado do adaptador deve ser revisto antes da próxima transação.',
          tag: 'AT',
        });
      }
    } else {
      this.onPacketLog({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'error',
        raw: 'ATSH 6C 10 F1 FAIL',
        decoded: '[SOURCE:ECM-ACTIVE][DPID:0x11] Falha ao configurar cabeçalho; requisição ativa não enviada.',
        tag: 'AT',
      });
    }
    await sleep(500);

    // 4. Resumo Final da Varredura
    const totalSuccess = idSuccessCount + dtcSuccessCount;
    const totalExpected = totalIdQueries + totalDtcQueries;

    if (totalSuccess === totalExpected) {
      const summaryMsg = 'Diagnóstico concluído: todas as consultas responderam.';
      this.onStatusChange(summaryMsg);
      this.onPacketLog({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'rx',
        raw: 'DIAG_COMPLETE',
        decoded: `[RESUMO DIAGNÓSTICO] ${summaryMsg} (Identificação: ${idSuccessCount}/${totalIdQueries} | DTCs: ${dtcSuccessCount}/${totalDtcQueries} módulos | DPID 0x11: ${activeDpid11Success ? 'OK' : 'sem resposta'})`,
        tag: 'STATUS',
      });
    } else {
      const summaryMsg = `Diagnóstico concluído com respostas parciais: ${totalSuccess}/${totalExpected} consultas responderam (Identificação: ${idSuccessCount}/${totalIdQueries}, DTCs: ${dtcSuccessCount}/${totalDtcQueries} módulos, DPID 0x11: ${activeDpid11Success ? 'OK' : 'sem resposta'}).`;
      this.onStatusChange(summaryMsg);
      this.onPacketLog({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'info',
        raw: 'DIAG_PARTIAL',
        decoded: `[RESUMO DIAGNÓSTICO] ${summaryMsg}`,
        tag: 'STATUS',
      });
    }

      // Restaura monitoramento de painel em tempo real
      await this.resumeLiveDashboard();
    } finally {
      this.isDiagnosticBusy = false;
    }
  }

  /**
   * Procedimento de limpeza de falhas Harley (HarleyDroid clearDTC)
   * Envia sequencialmente: 6C 10 F1 14, 6C 40 F1 14, 6C 60 F1 14
   */
  public async clearDTC(): Promise<boolean> {
    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

    this.onStatusChange('Interrompendo monitoramento para limpeza de DTCs...');
    this.stopActivePolling();
    await this.sendBreak();
    await sleep(300);

    let confirmedCount = 0;

    // 1. Limpa memória DTC do nó 0x10 (histórico)
    this.onStatusChange('Apagando DTCs do nó 0x10 (histórico)...');
    const h1 = await this.chat('ATSH 6C 10 F1', 'OK', 500);
    if (h1.success) {
      const r1 = await this.chat('14', '6CF11054', 1200);
      if (r1.success) confirmedCount++;
    }
    // Mantém a mesma folga usada nas consultas DTC para evitar sobreposição no ELM/J1850.
    await sleep(2000);

    // 2. Limpa memória DTC do nó 0x40 (atual)
    this.onStatusChange('Apagando DTCs do nó 0x40 (atual)...');
    const h2 = await this.chat('ATSH 6C 40 F1', 'OK', 500);
    if (h2.success) {
      const r2 = await this.chat('14', '6CF14054', 1200);
      if (r2.success) confirmedCount++;
    }
    await sleep(2000);

    // 3. Tenta limpeza no endereço 0x60 apenas se o header for aceito.
    // Neste veículo a leitura em 0x60 retornou NO DATA; não tratamos esse endereço como DTC atual.
    this.onStatusChange('Tentando limpeza no endereço diagnóstico 0x60...');
    const h3 = await this.chat('ATSH 6C 60 F1', 'OK', 500);
    if (h3.success) {
      const r3 = await this.chat('14', '6CF16054', 1200);
      if (r3.success) confirmedCount++;
    }
    await sleep(500);

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

    // Se monitorMode for true (padrão Harley), restaura ATMA
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
        const encoded = this.textEncoder.encode(formatted);
        const hexStr = formatBytesToHex(encoded);
        const asciiStr = formatBytesToSafeAscii(encoded);
        this.onPacketLog({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'tx',
          raw: hexStr,
          decoded: `[SERIAL-TX-RAW] HEX: ${hexStr} | ASCII: ${asciiStr}`,
          tag: 'AT',
        });
        await this.serialWriter.write(encoded);
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
    let rawBytes: Uint8Array;
    if (data instanceof DataView) {
      rawBytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } else if (data instanceof Uint8Array) {
      rawBytes = data;
    } else {
      rawBytes = new Uint8Array(data);
    }

    const chunkStr = this.textDecoder.decode(rawBytes);

    // [RX-CHUNK] Log de diagnóstico do fragmento recebido na camada de transporte
    this.onPacketLog({
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type: 'info',
      raw: formatBytesToSafeAscii(rawBytes),
      decoded: `[RX-CHUNK] "${formatBytesToSafeAscii(rawBytes)}"`,
      tag: 'AT',
    });

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
      // [RX-LINE] Log de diagnóstico da linha completa extraída do rxBuffer
      this.onPacketLog({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'info',
        raw: line,
        decoded: `[RX-LINE] "${line}"`,
        tag: 'AT',
      });

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
   * Start Harley-Davidson Simulator
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

    this.onStatusChange('Simulador Harley Ativo! Motor em marcha lenta.');
    this.onPacketLog({
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type: 'info',
      raw: 'SIMULATOR_STARTED',
      decoded: 'Simulador Harley-Davidson Big Twin iniciado com transmissão de diagnóstico ativa',
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

      // Transmissão periódica dos frames diagnóstico da Harley (pausada durante varredura diagnóstica)
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

        // Frame Neutro / Embreagem conforme parser HarleyDroid: 0x20 = fora do neutro, 0xA0 = neutro
        const neutralByte = this.simGear === 'N' ? 0xA0 : 0x20;
        const neutralFrame = `48 3B 40 ${neutralByte.toString(16).padStart(2, '0').toUpperCase()}`;

        // Frame Odômetro: A8 69 10 06 XX XX (ticks = km / 0.0004)
        const ticks = Math.round(this.simOdometerKm / 0.0004) % 65536;
        const odoHex = ticks.toString(16).padStart(4, '0').toUpperCase();
        const odoFrame = `A8 69 10 06 ${odoHex.substring(0, 2)} ${odoHex.substring(2, 4)}`;

        // Processa os frames pelo decoder oficial e atualiza o estado de telemetria
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
   * Simula comandos Harley de acordo com as consultas do HarleyDroid
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
    } else if (u === 'ATZ' || u === 'ATWS') {
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
            decoded: 'Harley: Lâmpada de Injeção Eletrônica (MIL) ATIVADA [Nova Falha]',
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
      return { success: true, message: `Comando [${cmd}] transmitido com sucesso ao barramento de diagnóstico.` };
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
