import { ConnectionConfig, ConnectionType, PacketLog, TelemetryData } from '../types';
import { J1850Decoder } from './j1850Decoder';

const BLE_SERVICE_UUIDS = [
  '0000ffe0-0000-1000-8000-00805f9b34fb', // Vgate, Veepeak, standard BLE OBD
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service (OBDLink, Viecar BLE)
  '0000fff0-0000-1000-8000-00805f9b34fb', // Alternate BLE OBD
  '00001101-0000-1000-8000-00805f9b34fb', // SPP Serial (classic)
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

  // Serial objects
  private serialPort: any = null;
  private serialReader: any = null;
  private serialWriter: any = null;
  private serialKeepReading = false;

  // Simulator
  private simTimer: any = null;
  private simDtcSpawnTimer: any = null;
  private simActiveDtcHex: string = '01 07 01 18';
  private simRpm = 950;
  private simTargetRpm = 950;
  private simSpeed = 0;
  private simTargetSpeed = 0;
  private simTempF = 185;
  private simGear: number | 'N' = 'N';
  private simRunning = false;
  private simOdometerKm = 34226.4;
  private simEngineHours = 892;
  private simEngineMinutes = 24;
  private simEngineStarts = 3120;

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
   * Connect via Web Bluetooth API (BLE OBD2 adapters / SPP)
   */
  public async connectBluetooth(config: ConnectionConfig): Promise<boolean> {
    if (!('bluetooth' in navigator)) {
      this.onStatusChange('Web Bluetooth não é suportado neste navegador. Use Chrome/Edge ou teste via Modo Simulador.', true);
      return false;
    }

    try {
      this.onStatusChange('Procurando adaptador Bluetooth OBD2...');
      
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: BLE_SERVICE_UUIDS,
      });

      this.bluetoothDevice = device;
      this.onStatusChange(`Pareando com ${device.name || 'ELM327'}...`);

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
        // Fallback: try getting any primary service
        const services = await this.gattServer.getPrimaryServices();
        if (services.length > 0) {
          targetService = services[0];
        }
      }

      if (!targetService) {
        throw new Error('Nenhum serviço Serial/OBD2 compatível encontrado no dispositivo.');
      }

      const characteristics = await targetService.getCharacteristics();
      if (characteristics.length === 0) {
        throw new Error('Nenhuma característica serial encontrada.');
      }

      // Check characteristics for read/notify/write
      this.txCharacteristic = characteristics[0];
      this.rxCharacteristic = characteristics.length > 1 ? characteristics[1] : characteristics[0];

      // In Nordic UART: RX (write to adapter) is 6e400002, TX (notify from adapter) is 6e400003
      for (const char of characteristics) {
        const props = char.properties;
        if (props.notify || props.indicate) {
          this.rxCharacteristic = char;
        }
        if (props.write || props.writeWithoutResponse) {
          this.txCharacteristic = char;
        }
      }

      // Start notifications
      await this.rxCharacteristic.startNotifications();
      this.rxCharacteristic.addEventListener(
        'characteristicvaluechanged',
        (event: any) => this.handleIncomingData(event.target.value)
      );

      this.connectionType = 'bluetooth';
      this.onStatusChange('Conectado via Bluetooth! Inicializando protocolo J1850...');

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
      await this.serialPort.open({ baudRate: 38400 });

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
    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

    try {
      this.onStatusChange('Resetando ELM327 (ATZ)...');
      await this.sendCommand('ATZ');
      await sleep(1200);

      this.onStatusChange('Desativando Echo (ATE0)...');
      await this.sendCommand('ATE0');
      await sleep(400);

      this.onStatusChange('Configurando formato de linha (ATL0, ATS0)...');
      await this.sendCommand('ATL0'); // Linefeeds off
      await sleep(300);
      await this.sendCommand('ATS0'); // Spaces off
      await sleep(300);

      // Protocol selection (ATSP2 = SAE J1850 VPW for Harley Davidson)
      this.onStatusChange(`Definindo protocolo ${config.protocol} (Harley J1850 VPW)...`);
      await this.sendCommand(config.protocol);
      await sleep(500);

      // Check battery voltage
      await this.sendCommand('ATRV');
      await sleep(400);

      if (config.monitorMode) {
        this.onStatusChange('Ativando Monitor J1850 em tempo real (ATMA)...');
        await this.sendCommand('ATMA');
      } else {
        this.onStatusChange('Pronto para comunicação Harley J1850!');
      }
    } catch (err: any) {
      this.onStatusChange(`Aviso durante inicialização: ${err.message || err}`);
    }
  }

  /**
   * Sends raw string to ELM327
   */
  public async sendCommand(cmd: string): Promise<boolean> {
    const clean = cmd.trim();
    if (!clean) return false;
    const formatted = clean + '\r';

    this.onPacketLog({
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type: 'tx',
      raw: clean,
      decoded: `Comando enviado: ${clean}`,
      tag: 'AT',
    });

    try {
      if (this.connectionType === 'bluetooth' && this.txCharacteristic) {
        await this.txCharacteristic.writeValue(this.textEncoder.encode(formatted));
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
   * Process raw byte chunks coming from Bluetooth or Serial
   */
  private handleIncomingData(data: ArrayBuffer | Uint8Array | DataView) {
    let str = '';
    if (data instanceof DataView) {
      str = this.textDecoder.decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    } else {
      str = this.textDecoder.decode(data);
    }

    // Pass to decoder
    const current: TelemetryData = {
      rpm: 0,
      speedKmH: 0,
      speedMph: 0,
      engineTempF: 180,
      engineTempC: 82,
      batteryVoltage: 13.8,
      gear: 'N',
      turnLeft: false,
      turnRight: false,
      neutral: true,
      checkEngine: false,
      oilWarning: false,
      highBeam: false,
      clutchEngaged: false,
      lastUpdated: Date.now(),
    };

    const updated = this.decoder.parseChunk(str, current, (packet) => {
      this.onPacketLog(packet);
    });

    this.onTelemetryUpdate(updated);
  }

  /**
   * Start Harley-Davidson J1850 Simulator
   */
  public startSimulator() {
    this.disconnect();
    this.connectionType = 'simulator';
    this.simRunning = true;
    this.simActiveDtcHex = '01 07 01 18';
    this.simRpm = 980;
    this.simTargetRpm = 980;
    this.simSpeed = 0;
    this.simTargetSpeed = 0;
    this.simTempF = 180;
    this.simGear = 'N';

    this.onStatusChange('Simulador Harley J1850 Ativo! Motor em marcha lenta.');
    this.onPacketLog({
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type: 'info',
      raw: 'SIMULATOR_STARTED',
      decoded: 'Simulador Harley-Davidson Big Twin iniciado com transmissão J1850 ativa',
      tag: 'STATUS',
    });

    let tick = 0;
    this.simTimer = setInterval(() => {
      tick++;

      // Realistic V-Twin idle fluctuation (+- 35 RPM)
      const idleJitter = (Math.random() - 0.5) * 45;
      this.simRpm += (this.simTargetRpm - this.simRpm) * 0.2 + idleJitter;
      this.simRpm = Math.max(0, Math.min(6500, Math.round(this.simRpm)));

      // Speed follows target
      this.simSpeed += (this.simTargetSpeed - this.simSpeed) * 0.15;
      this.simSpeed = Math.max(0, Math.min(220, Math.round(this.simSpeed)));

      // Accumulate odometer distance (km)
      if (this.simSpeed > 0) {
        this.simOdometerKm += (this.simSpeed / 3600) * 0.12;
      }

      // Engine runtime accumulation
      if (this.simRpm > 0 && tick % 500 === 0) {
        this.simEngineMinutes += 1;
        if (this.simEngineMinutes >= 60) {
          this.simEngineMinutes = 0;
          this.simEngineHours += 1;
        }
      }

      // Engine temp gradual warmup
      if (this.simRpm > 0 && this.simTempF < 210) {
        this.simTempF += 0.05;
      }

      // Format Harley J1850 frames:
      // RPM frame: 28 1b 10 02 [rpm * 4 in 4-char hex]
      const rpmHex = (Math.round(this.simRpm * 4)).toString(16).padStart(4, '0').toUpperCase();
      const rpmFrame = `28 1B 10 02 ${rpmHex.substring(0, 2)} ${rpmHex.substring(2, 4)}`;

      // Speed frame: 48 29 10 02 [speed * 128 in 4-char hex]
      const speedHex = (Math.round(this.simSpeed * 128)).toString(16).padStart(4, '0').toUpperCase();
      const speedFrame = `48 29 10 02 ${speedHex.substring(0, 2)} ${speedHex.substring(2, 4)}`;

      // Temp frame: A8 49 10 10 [temp in hex]
      const tempHex = Math.round(this.simTempF).toString(16).padStart(2, '0').toUpperCase();
      const tempFrame = `A8 49 10 10 ${tempHex}`;

      // Emit frames into decoder occasionally to replicate bus broadcast
      if (tick % 2 === 0) {
        this.decoder.decodeHex(rpmFrame.replace(/\s+/g, '').toLowerCase(), rpmFrame, {
          rpm: this.simRpm,
          speedKmH: this.simSpeed,
          speedMph: Math.round(this.simSpeed * 0.621371),
          engineTempF: Math.round(this.simTempF),
          engineTempC: Math.round(((this.simTempF - 32) * 5) / 9),
          batteryVoltage: 14.1 + (Math.random() - 0.5) * 0.2,
          gear: this.simGear,
          turnLeft: false,
          turnRight: false,
          neutral: this.simGear === 'N',
          checkEngine: false,
          oilWarning: this.simRpm < 200,
          highBeam: false,
          clutchEngaged: false,
          odometerKm: Math.round(this.simOdometerKm),
          engineHoursTotal: this.simEngineHours,
          engineMinutesTotal: this.simEngineMinutes,
          engineIgnitionCycles: this.simEngineStarts,
          lastUpdated: Date.now(),
        });

        // Realistic O2 oscillation: ~1.2 Hz switching between 0.150V (lean) and 0.850V (rich)
        const timeSec = tick * 0.05;
        const o2Oscillation = Math.sin(timeSec * 6);
        const frontO2 = this.simRpm > 0 ? Number((0.50 + 0.35 * o2Oscillation + (Math.random() - 0.5) * 0.03).toFixed(3)) : 0.450;
        const rearO2 = this.simRpm > 0 ? Number((0.50 + 0.34 * Math.sin(timeSec * 6 + 0.85) + (Math.random() - 0.5) * 0.03).toFixed(3)) : 0.450;
        const frontTrim = Number(((frontO2 - 0.5) * -7.5 + (Math.random() - 0.5) * 1.2).toFixed(1));
        const rearTrim = Number(((rearO2 - 0.5) * -7.5 + (Math.random() - 0.5) * 1.2).toFixed(1));
        const tps = Math.min(100, Math.max(0, Math.round((this.simSpeed / 200) * 75 + (this.simRpm / 6000) * 25)));
        const map = Math.min(100, Math.max(32, Math.round(38 + (tps / 100) * 58 + (Math.random() - 0.5) * 2)));
        const fuelStatus: 'Closed-Loop' | 'Open-Loop (Cold)' | 'Open-Loop (WOT)' =
          this.simTempF < 130 ? 'Open-Loop (Cold)' : (tps > 80 ? 'Open-Loop (WOT)' : 'Closed-Loop');
        const frontAFR = Number((14.7 - (frontO2 - 0.45) * 2.6).toFixed(2));
        const rearAFR = Number((14.7 - (rearO2 - 0.45) * 2.6).toFixed(2));

        // Notify telemetry
        this.onTelemetryUpdate({
          rpm: this.simRpm,
          speedKmH: this.simSpeed,
          speedMph: Math.round(this.simSpeed * 0.621371),
          engineTempF: Math.round(this.simTempF),
          engineTempC: Math.round(((this.simTempF - 32) * 5) / 9),
          batteryVoltage: Number((14.1 + (Math.random() - 0.5) * 0.2).toFixed(1)),
          gear: this.simGear,
          turnLeft: tick % 8 < 4 && tick > 100, // blinker demo
          turnRight: false,
          neutral: this.simGear === 'N',
          checkEngine: false,
          oilWarning: this.simRpm < 200,
          highBeam: true,
          clutchEngaged: false,
          fuelLevelPercent: 78,
          odometerKm: Math.round(this.simOdometerKm),
          engineHoursTotal: this.simEngineHours,
          engineMinutesTotal: this.simEngineMinutes,
          engineIgnitionCycles: this.simEngineStarts,
          frontO2Voltage: frontO2,
          rearO2Voltage: rearO2,
          frontShortTermFuelTrim: frontTrim,
          rearShortTermFuelTrim: rearTrim,
          frontAFR: frontAFR,
          rearAFR: rearAFR,
          fuelSystemStatus: fuelStatus,
          throttlePosition: tps,
          manifoldPressureKpa: map,
          lastUpdated: Date.now(),
        });
      }

      // Log packet to console periodically
      if (tick % 6 === 0) {
        this.onPacketLog({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: rpmFrame,
          decoded: `Harley J1850 RPM: ${this.simRpm} RPM`,
          tag: 'RPM',
        });
      }
      if (tick % 12 === 0) {
        this.onPacketLog({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: speedFrame,
          decoded: `Harley J1850 Velocidade: ${this.simSpeed} km/h`,
          tag: 'SPEED',
        });
      }
      if (tick % 30 === 0) {
        this.onPacketLog({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: tempFrame,
          decoded: `Harley J1850 Temp: ${Math.round(((this.simTempF - 32) * 5) / 9)}°C / ${Math.round(this.simTempF)}°F`,
          tag: 'TEMP',
        });
      }
    }, 120);
  }

  /**
   * Adjust simulator physics from UI controls
   */
  public updateSimulatorInputs(targetRpm: number, targetSpeed: number, gear: number | 'N') {
    this.simTargetRpm = targetRpm;
    this.simTargetSpeed = targetSpeed;
    this.simGear = gear;
  }

  private simulateCommandResponse(cmd: string) {
    const u = cmd.toUpperCase().trim();
    let resp = 'OK';
    if (u === 'ATZ') resp = 'ELM327 v1.5';
    else if (u === 'ATE0') resp = 'OK';
    else if (u.startsWith('ATSP')) resp = 'OK';
    else if (u === 'ATRV') resp = '14.2V';
    else if (u === 'ATMA') resp = 'SEARCHING...\r\n28 1B 10 02 0F A0\r\n48 29 10 02 00 00';
    else if (u === '0100') resp = '41 00 BE 3F B8 11';
    else if (u === '010C') resp = '41 0C 0F A0'; // 1000 RPM
    else if (u === '010D') resp = '41 0D 00'; // 0 km/h
    else if (u === '0105') resp = '41 05 7A'; // 82°C
    else if (u === '0902') {
      // VIN Mode 09 PID 02: 1HD1BX1194K012345 in Hex
      // 1=31, H=48, D=44, 1=31, B=42, X=58, 1=31, 1=31, 9=39, 4=34, K=4B, 0=30, 1=31, 2=32, 3=33, 4=34, 5=35
      resp = '49 02 31 48 44 31 42 58 31 31 39 34 4B 30 31 32 33 34 35';
    }
    else if (u === '0904') {
      // ECU Part Number: 32124-04B (Delphi EFI ECM)
      resp = '49 04 33 32 31 32 34 2D 30 34 42';
    }
    else if (u === '03') {
      // Retorna os DTCs ativos simulados (ou 43 00 00 se limpo)
      resp = this.simActiveDtcHex ? `43 ${this.simActiveDtcHex}` : '43 00 00';
    }
    else if (u === '220201' || u === '01A6') {
      // Odômetro do Velocímetro (Nó 0x60)
      const hexOdo = Math.round(this.simOdometerKm).toString(16).padStart(6, '0').toUpperCase();
      resp = `62 02 01 ${hexOdo}`;
    }
    else if (u === '22010A' || u === '011F') {
      // Horímetro Total e Ciclos de Ignição da ECM Delphi (Nó 0x10)
      const hexH = this.simEngineHours.toString(16).padStart(4, '0').toUpperCase();
      const hexM = this.simEngineMinutes.toString(16).padStart(2, '0').toUpperCase();
      const hexS = this.simEngineStarts.toString(16).padStart(4, '0').toUpperCase();
      resp = `62 01 0A ${hexH} ${hexM} ${hexS}`;
    }
    else if (u === '04') {
      resp = '44'; // Confirmação OBD2 padrão de memória apagada
      this.simActiveDtcHex = ''; // Limpa memória do simulador

      if (this.simDtcSpawnTimer) {
        clearTimeout(this.simDtcSpawnTimer);
        this.simDtcSpawnTimer = null;
      }

      // Após exatamente 3 segundos, recria uma nova falha aleatória real da Harley para demonstração
      this.simDtcSpawnTimer = setTimeout(() => {
        if (this.connectionType !== 'simulator') return;

        const possibleFaults = [
          { code: 'P0131', hex: '01 31', desc: 'P0131 - Sensor de O2 Dianteiro Pobre' },
          { code: 'P0562', hex: '05 62', desc: 'P0562 - Tensão do Sistema Baixa (Bateria/Carga)' },
          { code: 'P0118', hex: '01 18', desc: 'P0118 - Sensor ET (Temperatura do Motor) Aberto/Alto' },
          { code: 'P0505', hex: '05 05', desc: 'P0505 - Controle de Marcha Lenta (IAC) com Perda de Passo' },
          { code: 'P1356', hex: '13 56', desc: 'P1356 - Sem Combustão no Cilindro Traseiro (Misfire)' },
          { code: 'P0107', hex: '01 07', desc: 'P0107 - Sensor MAP Circuito Aberto/Baixo' },
          { code: 'P0261', hex: '02 61', desc: 'P0261 - Injetor Frontal Aberto/Baixo' },
          { code: 'P0122', hex: '01 22', desc: 'P0122 - Sensor TPS 1 Tensão Baixa' },
        ];

        const randomFault = possibleFaults[Math.floor(Math.random() * possibleFaults.length)];
        this.simActiveDtcHex = randomFault.hex;

        // 1. Emite log com pacote Mode 03 da nova falha
        this.onPacketLog({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: `43 ${randomFault.hex}`,
          decoded: `[SIMULADOR] Nova falha intermitente gravada na ECU: ${randomFault.desc}`,
          tag: 'DTC',
        });

        // 2. Emite transmissão J1850 de lâmpada de injeção acesa
        this.onPacketLog({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: '68 88 10 83',
          decoded: 'Harley J1850: Lâmpada de Injeção Eletrônica (MIL) ATIVADA [Nova Falha]',
          tag: 'DTC',
        });

        this.onStatusChange(`Simulador: Nova falha detectada após 3s (${randomFault.code}). Luz de injeção acendeu!`);

        // 3. Atualiza a telemetria com a luz de injeção acesa
        this.onTelemetryUpdate({
          rpm: this.simRpm,
          speedKmH: this.simSpeed,
          speedMph: Math.round(this.simSpeed * 0.621371),
          engineTempF: Math.round(this.simTempF),
          engineTempC: Math.round(((this.simTempF - 32) * 5) / 9),
          batteryVoltage: 14.1,
          gear: this.simGear,
          turnLeft: false,
          turnRight: false,
          neutral: this.simGear === 'N',
          checkEngine: true,
          oilWarning: false,
          highBeam: false,
          clutchEngaged: false,
          odometerKm: Math.round(this.simOdometerKm),
          engineHoursTotal: this.simEngineHours,
          engineMinutesTotal: this.simEngineMinutes,
          engineIgnitionCycles: this.simEngineStarts,
          lastUpdated: Date.now(),
        });
      }, 3000);
    }

    setTimeout(() => {
      this.onPacketLog({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'rx',
        raw: resp,
        decoded: `Resposta ELM327: ${resp}`,
        tag: u.startsWith('09') || u === '03' || u === '04' || u.startsWith('22') ? 'DTC' : 'AT',
      });

      // Parse simulated diagnostic responses into telemetry
      if (u === '0902' || u === '0904' || u === '03' || u === '04' || u === '220201' || u === '22010A' || u === '01A6' || u === '011F') {
        const dummyTelemetry: TelemetryData = {
          rpm: this.simRpm,
          speedKmH: this.simSpeed,
          speedMph: Math.round(this.simSpeed * 0.621371),
          engineTempF: Math.round(this.simTempF),
          engineTempC: Math.round(((this.simTempF - 32) * 5) / 9),
          batteryVoltage: 14.1,
          gear: this.simGear,
          turnLeft: false,
          turnRight: false,
          neutral: this.simGear === 'N',
          checkEngine: u === '04' ? false : this.simActiveDtcHex !== '',
          oilWarning: false,
          highBeam: false,
          clutchEngaged: false,
          odometerKm: Math.round(this.simOdometerKm),
          engineHoursTotal: this.simEngineHours,
          engineMinutesTotal: this.simEngineMinutes,
          engineIgnitionCycles: this.simEngineStarts,
          lastUpdated: Date.now(),
        };

        const updated = this.decoder.parseChunk(resp + '\r\n', dummyTelemetry, (pkt) => {
          this.onPacketLog(pkt);
        });

        if (u === '04') {
          updated.checkEngine = false;
        }

        this.onTelemetryUpdate(updated);
      }
    }, 150);
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

    // Comandos Mode 30 / 31 e J1850 para Harley Delphi
    let cmd = '';
    switch (testId) {
      case 'fuel_pump':
        cmd = '30 01 01'; // Ativa relé da bomba por 3 segundos
        break;
      case 'spark_front':
        cmd = '30 02 01'; // 5 pulsos de centelha no cilindro dianteiro
        break;
      case 'spark_rear':
        cmd = '30 03 01'; // 5 pulsos de centelha no cilindro traseiro
        break;
      case 'needle_sweep':
        cmd = '48 29 10 02 FF FF'; // Varredura completa velocímetro
        break;
      case 'turn_left':
        cmd = '68 88 10 01'; // Pisca esquerdo ativo
        break;
      case 'turn_right':
        cmd = '68 88 10 02'; // Pisca direito ativo
        break;
      case 'exhaust_valve':
        cmd = '30 05 01'; // Válvula de escape ativa
        break;
      case 'intake_solenoid':
        cmd = '30 06 01'; // Solenoide do filtro de ar
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
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
    if (this.simDtcSpawnTimer) {
      clearTimeout(this.simDtcSpawnTimer);
      this.simDtcSpawnTimer = null;
    }
    this.simRunning = false;

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
