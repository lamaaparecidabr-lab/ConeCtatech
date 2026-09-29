import { TelemetryData, PacketLog } from '../types';

/**
 * Cálculo e validação do CRC J1850 VPW (polinômio 0x1D, valor inicial 0xFF)
 * Baseado fielmente na implementação do HarleyDroid (J1850.java)
 */
export function computeJ1850Crc(bytes: number[]): number {
  let crc = 0xff;
  for (let i = 0; i < bytes.length; i++) {
    let c = bytes[i] & 0xff;
    for (let j = 0; j < 8; ++j) {
      let poly = 0;
      if ((0x80 & (crc ^ c)) !== 0) {
        poly = 0x1d;
      }
      crc = (((crc << 1) & 0xff) ^ poly) & 0xff;
      c = (c << 1) & 0xff;
    }
  }
  return (~crc) & 0xff;
}

export function validateJ1850Crc(bytesWithCrc: number[]): boolean {
  let crc = 0xff;
  for (let i = 0; i < bytesWithCrc.length; i++) {
    let c = bytesWithCrc[i] & 0xff;
    for (let j = 0; j < 8; ++j) {
      let poly = 0;
      if ((0x80 & (crc ^ c)) !== 0) {
        poly = 0x1d;
      }
      crc = (((crc << 1) & 0xff) ^ poly) & 0xff;
      c = (c << 1) & 0xff;
    }
  }
  return (crc & 0xff) === 0xc4;
}

export class J1850Decoder {
  private buffer: string = '';

  // Buffers persistentes para montagem progressiva dos blocos Harley J1850 (HarleyDroid)
  private vinChars: string[] = Array(17).fill('-');
  private ecmPnChars: string[] = Array(12).fill('-');
  private ecmCalIdChars: string[] = Array(12).fill('-');

  // Acumuladores de DTCs
  private activeDtcSet: Set<string> = new Set();
  private historicDtcSet: Set<string> = new Set();

  // Rastreamento de Odômetro (HarleyDroid odoaccum / odolast)
  // Referência HarleyDroid: contador incremental de 16 bits (current trip odometer), 1 tick = 0,4m
  private odolast: number = -1;
  private odoaccum: number = 0;

  // Timestamp da última leitura de marcha real (para não ser sobrescrita pelo fallback de cálculo)
  private lastRealGearTimestamp: number = 0;

  /**
   * Reseta apenas o estado de diagnóstico (VIN, Part Number, CalID e DTCs)
   * Preserva intacto o odômetro acumulado em tempo real da sessão (odolast / odoaccum)
   */
  public resetDiagnosticState() {
    this.vinChars = Array(17).fill('-');
    this.ecmPnChars = Array(12).fill('-');
    this.ecmCalIdChars = Array(12).fill('-');
    this.activeDtcSet.clear();
    this.historicDtcSet.clear();
  }

  /**
   * Reset completo de todos os contadores da sessão (utilizado apenas em nova conexão ou desconexão)
   */
  public resetCounters() {
    this.resetDiagnosticState();
    this.odolast = -1;
    this.odoaccum = 0;
    this.lastRealGearTimestamp = 0;
  }

  public clearDtcLists() {
    this.activeDtcSet.clear();
    this.historicDtcSet.clear();
  }

  /**
   * Converte string de bytes hexadecimais em array de números (bytes)
   */
  private hexStringToBytes(cleanHex: string): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < cleanHex.length; i += 2) {
      const b = parseInt(cleanHex.substr(i, 2), 16);
      if (!isNaN(b)) {
        bytes.push(b);
      }
    }
    return bytes;
  }

  /**
   * Limpa chunk serial bruto e processa linhas completas
   */
  public parseChunk(
    chunk: string,
    currentTelemetry: TelemetryData,
    onPacket: (packet: PacketLog) => void
  ): TelemetryData {
    this.buffer += chunk;

    // Quebra por quebras de linha e prompt '>' do ELM327
    const lines = this.buffer.split(/[\r\n>]+/);
    this.buffer = lines.pop() || '';

    let updatedTelemetry = { ...currentTelemetry };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Leitura de tensão da bateria via ATRV
      if (line.endsWith('V') && !isNaN(parseFloat(line))) {
        const voltage = parseFloat(line);
        updatedTelemetry.batteryVoltage = voltage;
        onPacket({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: line,
          decoded: `Tensão da Bateria: ${voltage.toFixed(1)}V`,
          tag: 'STATUS',
        });
        continue;
      }

      // Mensagens de status do ELM327
      if (
        line.startsWith('AT') ||
        line === 'OK' ||
        line.startsWith('ELM327') ||
        line.includes('SEARCHING') ||
        line.includes('NO DATA') ||
        line.includes('BUS BUSY') ||
        line.includes('STOPPED')
      ) {
        onPacket({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'info',
          raw: line,
          decoded: `ELM327 Status: ${line}`,
          tag: 'AT',
        });
        continue;
      }

      const cleanHex = line.replace(/[\s:]+/g, '').toLowerCase();

      // Decodificação J1850 Harley e fallback OBD2
      const { telemetry, packetLog } = this.decodeHex(cleanHex, line, updatedTelemetry);
      updatedTelemetry = telemetry;
      if (packetLog) {
        onPacket(packetLog);
      }
    }

    return updatedTelemetry;
  }

  /**
   * Decodifica frame J1850 Harley-Davidson / fallback OBD2
   */
  public decodeHex(
    cleanHex: string,
    originalLine: string,
    state: TelemetryData
  ): { telemetry: TelemetryData; packetLog?: PacketLog } {
    let telemetry = { ...state, lastUpdated: Date.now() };
    let packetLog: PacketLog | undefined;

    const bytes = this.hexStringToBytes(cleanHex);

    // =========================================================================
    // 1. HARLEY RPM (Frame 28 1B 10 02 XX XX -> RPM = valor / 4)
    // =========================================================================
    if (cleanHex.includes('281b1002')) {
      const idx = cleanHex.indexOf('281b1002');
      if (cleanHex.length >= idx + 12) {
        const hexBytes = cleanHex.substr(idx + 8, 4);
        const valorDecimal = parseInt(hexBytes, 16);
        if (!isNaN(valorDecimal)) {
          const rpmFinal = Math.round(valorDecimal / 4);
          telemetry.rpm = Math.min(8000, Math.max(0, rpmFinal));
          // Só atualiza neutro por estimativa se não houver leitura do frame real 48 3B 40 XX
          if (telemetry.neutral === undefined) {
            telemetry.neutral = telemetry.speedKmH < 2 && telemetry.rpm > 0 && telemetry.gear === 'N';
          }
          packetLog = {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            type: 'rx',
            raw: originalLine,
            decoded: `Harley J1850 RPM: ${telemetry.rpm} RPM [hex:${hexBytes}]`,
            tag: 'RPM',
          };
        }
      }
    }

    // =========================================================================
    // 2. HARLEY VELOCIDADE (Frame 48 29 10 02 XX XX -> km/h = valor / 128)
    // =========================================================================
    else if (cleanHex.includes('48291002')) {
      const idx = cleanHex.indexOf('48291002');
      if (cleanHex.length >= idx + 12) {
        const hexBytes = cleanHex.substr(idx + 8, 4);
        const valorDecimal = parseInt(hexBytes, 16);
        if (!isNaN(valorDecimal)) {
          const speedFinal = Math.round(valorDecimal / 128);
          telemetry.speedKmH = Math.min(260, Math.max(0, speedFinal));
          telemetry.speedMph = Math.round(telemetry.speedKmH * 0.621371);
          // Usa estimativa de marcha como fallback APENAS se a marcha real não foi recebida nos últimos 3 segundos
          if (Date.now() - this.lastRealGearTimestamp > 3000) {
            telemetry.gear = this.calculateGear(telemetry.rpm, telemetry.speedKmH, telemetry.neutral);
          }
          packetLog = {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            type: 'rx',
            raw: originalLine,
            decoded: `Harley J1850 Velocidade: ${telemetry.speedKmH} km/h (${telemetry.speedMph} mph) [hex:${hexBytes}]`,
            tag: 'SPEED',
          };
        }
      }
    }

    // =========================================================================
    // 3. HARLEY TEMPERATURA MOTOR (Frame A8 49 10 10 XX -> XX = graus Fahrenheit)
    // =========================================================================
    else if (cleanHex.includes('a8491010')) {
      const idx = cleanHex.indexOf('a8491010');
      if (cleanHex.length >= idx + 10) {
        const hexByte = cleanHex.substr(idx + 8, 2);
        const tempFahrenheit = parseInt(hexByte, 16);
        if (!isNaN(tempFahrenheit)) {
          telemetry.engineTempF = tempFahrenheit;
          telemetry.engineTempC = Math.round(((tempFahrenheit - 32) * 5) / 9);
          packetLog = {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            type: 'rx',
            raw: originalLine,
            decoded: `Harley J1850 Temp Motor: ${telemetry.engineTempC}°C / ${telemetry.engineTempF}°F [hex:${hexByte}]`,
            tag: 'TEMP',
          };
        }
      }
    }

    // =========================================================================
    // 4. HARLEY MARCHA REAL (Frame A8 3B 10 03 XX)
    // 01 = 1ª, 03 = 2ª, 07 = 3ª, 0F = 4ª, 1F = 5ª, 3F = 6ª
    // =========================================================================
    else if (cleanHex.includes('a83b1003')) {
      const idx = cleanHex.indexOf('a83b1003');
      if (cleanHex.length >= idx + 10) {
        const hexVal = parseInt(cleanHex.substr(idx + 8, 2), 16);
        if (!isNaN(hexVal)) {
          let gear: number | 'N' = 'N';
          if (hexVal === 0x01) gear = 1;
          else if (hexVal === 0x03) gear = 2;
          else if (hexVal === 0x07) gear = 3;
          else if (hexVal === 0x0f) gear = 4;
          else if (hexVal === 0x1f) gear = 5;
          else if (hexVal === 0x3f) gear = 6;
          else if (hexVal !== 0) {
            // Decodificação genérica por deslocamento de bits (HarleyDroid)
            let g = 0;
            let temp = hexVal;
            while ((temp >>= 1) !== 0) g++;
            gear = (g >= 1 && g <= 6) ? g : 'N';
          }

          telemetry.gear = gear;
          if (gear !== 'N') {
            telemetry.neutral = false;
          }
          this.lastRealGearTimestamp = Date.now();

          packetLog = {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            type: 'rx',
            raw: originalLine,
            decoded: `Harley J1850 Marcha Real: ${gear === 'N' ? 'Neutro (N)' : `${gear}ª Marcha`} [hex:0x${hexVal.toString(16)}]`,
            tag: 'STATUS',
          };
        }
      }
    }

    // =========================================================================
    // 5. HARLEY NEUTRO E EMBREAGEM (Frame 48 3B 40 XX)
    // bit 0x20 = neutro | bit 0x80 = embreagem acionada
    // =========================================================================
    else if (cleanHex.includes('483b40')) {
      const idx = cleanHex.indexOf('483b40');
      if (cleanHex.length >= idx + 8) {
        const xx = parseInt(cleanHex.substr(idx + 6, 2), 16);
        if (!isNaN(xx)) {
          const isNeutral = (xx & 0x20) !== 0;
          const isClutch = (xx & 0x80) !== 0;

          telemetry.neutral = isNeutral;
          telemetry.clutchEngaged = isClutch;
          if (isNeutral) {
            telemetry.gear = 'N';
          }

          packetLog = {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            type: 'rx',
            raw: originalLine,
            decoded: `Harley J1850: Neutro=${isNeutral ? 'SIM' : 'NÃO'} | Embreagem=${isClutch ? 'ACIONADA' : 'LIVRE'} [hex:0x${xx.toString(16)}]`,
            tag: 'STATUS',
          };
        }
      }
    }

    // =========================================================================
    // 6. HARLEY SETAS / INDICADORES (Frame 48 DA 40 39 XX)
    // 01 = esquerda, 02 = direita, 03 = ambas, 00 = desligadas
    // =========================================================================
    else if (cleanHex.includes('48da4039')) {
      const idx = cleanHex.indexOf('48da4039');
      if (cleanHex.length >= idx + 10) {
        const xx = parseInt(cleanHex.substr(idx + 8, 2), 16);
        if (!isNaN(xx)) {
          const signals = xx & 0x03;
          telemetry.turnLeft = (signals === 0x01 || signals === 0x03);
          telemetry.turnRight = (signals === 0x02 || signals === 0x03);

          packetLog = {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            type: 'rx',
            raw: originalLine,
            decoded: `Harley J1850 Setas: Esq=${telemetry.turnLeft ? 'ON' : 'OFF'} | Dir=${telemetry.turnRight ? 'ON' : 'OFF'}`,
            tag: 'STATUS',
          };
        }
      }
    }

    // =========================================================================
    // 7. HARLEY ODÔMETRO (Frame A8 69 10 06 XX XX e A8 69 10 86 XX XX wraparound)
    // Cada tick = 0,4m => quilômetros = ticks * 0.0004
    // =========================================================================
    else if (cleanHex.includes('a8691006') || cleanHex.includes('a8691086')) {
      const is06 = cleanHex.includes('a8691006');
      const idx = is06 ? cleanHex.indexOf('a8691006') : cleanHex.indexOf('a8691086');
      if (cleanHex.length >= idx + 12) {
        const ticksHex = cleanHex.substr(idx + 8, 4);
        const y = parseInt(ticksHex, 16);
        if (!isNaN(y)) {
          if (this.odolast < 0) {
            this.odolast = y;
            this.odoaccum = y;
          } else {
            let delta = y - this.odolast;
            if (delta < 0) delta += 65536;
            this.odoaccum += delta;
            this.odolast = y;
          }

          const kmTotal = Math.round(this.odoaccum * 0.0004);
          if (kmTotal >= 0 && kmTotal < 1000000) {
            telemetry.odometerKm = kmTotal;
            packetLog = {
              id: Math.random().toString(36).substring(2, 9),
              timestamp: new Date().toLocaleTimeString(),
              type: 'rx',
              raw: originalLine,
              decoded: `Harley J1850 Odômetro: ${kmTotal.toLocaleString()} km (Ticks: ${this.odoaccum})`,
              tag: 'STATUS',
            };
          }
        }
      }
    }

    // =========================================================================
    // 8. HARLEY CHECK ENGINE / MIL LAMP (Frame 68 88 10 83 = ON, 68 88 10 03 = OFF)
    // =========================================================================
    else if (cleanHex.includes('68881083')) {
      telemetry.checkEngine = true;
      packetLog = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'rx',
        raw: originalLine,
        decoded: 'Harley J1850: Lâmpada de Injeção Eletrônica (MIL) ATIVADA [Falha Ativa]',
        tag: 'DTC',
      };
    } else if (cleanHex.includes('68881003')) {
      telemetry.checkEngine = false;
      packetLog = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'rx',
        raw: originalLine,
        decoded: 'Harley J1850: Lâmpada de Injeção Eletrônica (MIL) DESLIGADA [OK]',
        tag: 'STATUS',
      };
    }

    // =========================================================================
    // 9. HARLEY IDENTIFICAÇÃO DA ECM (0C F1 10 7C XX ...)
    // Respostas aos comandos 3C 01, 3C 02, 3C 03, 3C 04, 3C 0B, 3C 0F, 3C 10, 3C 11
    // =========================================================================
    else if (cleanHex.includes('0cf1107c')) {
      const idx = cleanHex.indexOf('0cf1107c');
      if (cleanHex.length >= idx + 10) {
        const blockId = parseInt(cleanHex.substr(idx + 8, 2), 16);
        const payloadHex = cleanHex.substring(idx + 10);
        const payloadBytes = this.hexStringToBytes(payloadHex);

        switch (blockId) {
          // ECM Part Number Bloco 1 (6 bytes)
          case 0x01: {
            for (let i = 0; i < Math.min(6, payloadBytes.length); i++) {
              const ch = String.fromCharCode(payloadBytes[i]);
              if (ch.match(/[a-zA-Z0-9-]/)) this.ecmPnChars[i] = ch;
            }
            this.updateEcmPn(telemetry);
            packetLog = {
              id: Math.random().toString(36).substring(2, 9),
              timestamp: new Date().toLocaleTimeString(),
              type: 'rx',
              raw: originalLine,
              decoded: `Harley J1850: ECM P/N Bloco 1 recebido`,
              tag: 'STATUS',
            };
            break;
          }

          // ECM Part Number Bloco 2 (6 bytes)
          case 0x02: {
            for (let i = 0; i < Math.min(6, payloadBytes.length); i++) {
              const ch = String.fromCharCode(payloadBytes[i]);
              if (ch.match(/[a-zA-Z0-9-]/)) this.ecmPnChars[6 + i] = ch;
            }
            this.updateEcmPn(telemetry);
            packetLog = {
              id: Math.random().toString(36).substring(2, 9),
              timestamp: new Date().toLocaleTimeString(),
              type: 'rx',
              raw: originalLine,
              decoded: `Harley J1850: ECM P/N Bloco 2 recebido -> P/N: ${telemetry.ecuPartNumber || 'Incompleto'}`,
              tag: 'STATUS',
            };
            break;
          }

          // Calibration ID Bloco 1 (6 bytes)
          case 0x03: {
            for (let i = 0; i < Math.min(6, payloadBytes.length); i++) {
              const ch = String.fromCharCode(payloadBytes[i]);
              if (ch.match(/[a-zA-Z0-9-]/)) this.ecmCalIdChars[i] = ch;
            }
            this.updateCalId(telemetry);
            packetLog = {
              id: Math.random().toString(36).substring(2, 9),
              timestamp: new Date().toLocaleTimeString(),
              type: 'rx',
              raw: originalLine,
              decoded: `Harley J1850: Cal ID Bloco 1 recebido`,
              tag: 'STATUS',
            };
            break;
          }

          // Calibration ID Bloco 2 (6 bytes)
          case 0x04: {
            for (let i = 0; i < Math.min(6, payloadBytes.length); i++) {
              const ch = String.fromCharCode(payloadBytes[i]);
              if (ch.match(/[a-zA-Z0-9-]/)) this.ecmCalIdChars[6 + i] = ch;
            }
            this.updateCalId(telemetry);
            packetLog = {
              id: Math.random().toString(36).substring(2, 9),
              timestamp: new Date().toLocaleTimeString(),
              type: 'rx',
              raw: originalLine,
              decoded: `Harley J1850: Cal ID Bloco 2 recebido -> CalID: ${telemetry.ecuCalId || 'Incompleto'}`,
              tag: 'STATUS',
            };
            break;
          }

          // Software Level (1 byte)
          case 0x0b: {
            if (payloadBytes.length >= 1) {
              const swLevel = payloadBytes[0];
              telemetry.ecuSoftwareLevel = swLevel;
              packetLog = {
                id: Math.random().toString(36).substring(2, 9),
                timestamp: new Date().toLocaleTimeString(),
                type: 'rx',
                raw: originalLine,
                decoded: `Harley J1850: ECM Software Level = ${swLevel}`,
                tag: 'STATUS',
              };
            }
            break;
          }

          // VIN Bloco 1 (6 bytes -> chars 0..5)
          case 0x0f: {
            for (let i = 0; i < Math.min(6, payloadBytes.length); i++) {
              const ch = String.fromCharCode(payloadBytes[i]);
              if (ch.match(/[a-zA-Z0-9]/)) this.vinChars[i] = ch.toUpperCase();
            }
            this.updateVin(telemetry);
            packetLog = {
              id: Math.random().toString(36).substring(2, 9),
              timestamp: new Date().toLocaleTimeString(),
              type: 'rx',
              raw: originalLine,
              decoded: `Harley J1850: VIN Bloco 1 recebido`,
              tag: 'STATUS',
            };
            break;
          }

          // VIN Bloco 2 (6 bytes -> chars 6..11)
          case 0x10: {
            for (let i = 0; i < Math.min(6, payloadBytes.length); i++) {
              const ch = String.fromCharCode(payloadBytes[i]);
              if (ch.match(/[a-zA-Z0-9]/)) this.vinChars[6 + i] = ch.toUpperCase();
            }
            this.updateVin(telemetry);
            packetLog = {
              id: Math.random().toString(36).substring(2, 9),
              timestamp: new Date().toLocaleTimeString(),
              type: 'rx',
              raw: originalLine,
              decoded: `Harley J1850: VIN Bloco 2 recebido`,
              tag: 'STATUS',
            };
            break;
          }

          // VIN Bloco 3 (5 bytes -> chars 12..16)
          case 0x11: {
            for (let i = 0; i < Math.min(5, payloadBytes.length); i++) {
              const ch = String.fromCharCode(payloadBytes[i]);
              if (ch.match(/[a-zA-Z0-9]/)) this.vinChars[12 + i] = ch.toUpperCase();
            }
            this.updateVin(telemetry);
            packetLog = {
              id: Math.random().toString(36).substring(2, 9),
              timestamp: new Date().toLocaleTimeString(),
              type: 'rx',
              raw: originalLine,
              decoded: `Harley J1850: VIN Bloco 3 recebido -> VIN: ${telemetry.vin || 'Incompleto'}`,
              tag: 'STATUS',
            };
            break;
          }
        }
      }
    }

    // =========================================================================
    // 10. HARLEY DTCs (Respostas 6C F1 10 59, 6C F1 40 59, 6C F1 60 59)
    // in[2] == 0x10 -> histórico | in[2] == 0x40 -> atual
    // =========================================================================
    else if (
      cleanHex.includes('6cf11059') ||
      cleanHex.includes('6cf14059') ||
      cleanHex.includes('6cf16059')
    ) {
      let node = '10';
      if (cleanHex.includes('6cf14059')) node = '40';
      else if (cleanHex.includes('6cf16059')) node = '60';

      const matchKey = `6cf1${node}59`;
      const idx = cleanHex.indexOf(matchKey);
      const frameHex = cleanHex.substring(idx);
      const frameBytes = this.hexStringToBytes(frameHex);

      // Validação formal do CRC J1850 VPW sobre o frame completo recebido
      // Header (3 bytes: 6C F1 NODE) + Service (1 byte: 59) = 4 bytes mínimos.
      // Se houver pelo menos 5 bytes e o frame passar na validação de CRC J1850, o último byte é o checksum confirmado.
      let hasValidCrc = false;
      if (frameBytes.length >= 5) {
        hasValidCrc = validateJ1850Crc(frameBytes) ||
          computeJ1850Crc(frameBytes.slice(0, -1)) === frameBytes[frameBytes.length - 1];
      }

      // SOMENTE se o frame completo passar na validação CRC J1850, remove o último byte (checksum).
      // Se não houver CRC validável, NÃO removemos arbitrariamente o último byte (pode ser byte de DTC legítimo).
      const dataBytes = hasValidCrc
        ? frameBytes.slice(4, frameBytes.length - 1)
        : frameBytes.slice(4);

      const parsedCodes: string[] = [];

      // Cada código DTC Harley é rigorosamente composto por 2 bytes (HarleyDroid in[4], in[5])
      for (let i = 0; i + 1 < dataBytes.length; i += 2) {
        const b0 = dataBytes[i];
        const b1 = dataBytes[i + 1];

        // Se ambos forem 0x00 ou 0xFF, indica ausência de falha / preenchimento
        if ((b0 === 0 && b1 === 0) || (b0 === 0xff && b1 === 0xff)) continue;

        let prefix = 'P';
        switch ((b0 & 0xc0) >> 6) {
          case 0: prefix = 'P'; break;
          case 1: prefix = 'C'; break;
          case 2: prefix = 'B'; break;
          case 3: prefix = 'U'; break;
        }

        const digit1 = ((b0 & 0x30) >> 4).toString(16);
        const digit2 = (b0 & 0x0f).toString(16);
        const digit3 = ((b1 & 0xf0) >> 4).toString(16);
        const digit4 = (b1 & 0x0f).toString(16);
        const fullCode = `${prefix}${digit1}${digit2}${digit3}${digit4}`.toUpperCase();

        // P0000 nunca deve ser registrado como falha
        if (fullCode && fullCode !== 'P0000') {
          parsedCodes.push(fullCode);
          if (node === '10') {
            this.historicDtcSet.add(fullCode);
          } else {
            this.activeDtcSet.add(fullCode);
          }
        }
      }

      telemetry.activeDtcList = Array.from(this.activeDtcSet);
      telemetry.historicDtcList = Array.from(this.historicDtcSet);
      if (this.activeDtcSet.size > 0) {
        telemetry.checkEngine = true;
      }

      const isHistoric = node === '10';
      packetLog = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'rx',
        raw: originalLine,
        decoded: `Harley J1850 DTCs (${isHistoric ? 'Históricos' : 'Atuais'} - Nó 0x${node}${hasValidCrc ? ' [CRC J1850 Válido]' : ''}): ${
          parsedCodes.length > 0 ? parsedCodes.join(', ') : 'Nenhuma falha gravada [OK]'
        }`,
        tag: 'DTC',
      };
    }

    // =========================================================================
    // 11. HARLEY CLEAR DTC CONFIRMAÇÃO (6C F1 10 54 / 6C F1 40 54 / 6C F1 60 54)
    // =========================================================================
    else if (
      cleanHex.includes('6cf11054') ||
      cleanHex.includes('6cf14054') ||
      cleanHex.includes('6cf16054')
    ) {
      packetLog = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'rx',
        raw: originalLine,
        decoded: `Harley J1850: Confirmação de Memória de DTC Limpa [Resposta 54 OK]`,
        tag: 'DTC',
      };
    }

    // =========================================================================
    // 12. FALLBACK ODÔMETRO GENÉRICO / AUDITORIA DELPHI
    // =========================================================================
    else if (cleanHex.includes('620201') || cleanHex.includes('41a6') || cleanHex.includes('486010')) {
      let odoKm = 0;
      if (cleanHex.includes('620201')) {
        const idx = cleanHex.indexOf('620201');
        if (cleanHex.length >= idx + 12) {
          odoKm = parseInt(cleanHex.substr(idx + 6, 6), 16);
        }
      } else if (cleanHex.includes('41a6')) {
        const idx = cleanHex.indexOf('41a6');
        if (cleanHex.length >= idx + 12) {
          odoKm = Math.round(parseInt(cleanHex.substr(idx + 4, 8), 16) / 10);
        }
      } else if (cleanHex.includes('486010')) {
        const idx = cleanHex.indexOf('486010');
        if (cleanHex.length >= idx + 14) {
          odoKm = parseInt(cleanHex.substr(idx + 8, 6), 16);
        }
      }

      if (odoKm > 0 && odoKm < 1000000 && telemetry.odometerKm === undefined) {
        telemetry.odometerKm = odoKm;
        packetLog = {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: originalLine,
          decoded: `Odômetro do Velocímetro: ${odoKm.toLocaleString()} KM`,
          tag: 'STATUS',
        };
      }
    }

    // Horímetro & Partidas ECM Delphi (Modo 22 PID 010A ou 011F)
    else if (cleanHex.includes('62010a') || cleanHex.includes('411f')) {
      if (cleanHex.includes('62010a')) {
        const idx = cleanHex.indexOf('62010a');
        if (cleanHex.length >= idx + 16) {
          const hours = parseInt(cleanHex.substr(idx + 6, 4), 16);
          const minutes = parseInt(cleanHex.substr(idx + 10, 2), 16);
          const starts = parseInt(cleanHex.substr(idx + 12, 4), 16);

          if (!isNaN(hours)) {
            telemetry.engineHoursTotal = hours;
            telemetry.engineMinutesTotal = isNaN(minutes) ? 0 : minutes;
            telemetry.engineIgnitionCycles = isNaN(starts) ? undefined : starts;

            packetLog = {
              id: Math.random().toString(36).substring(2, 9),
              timestamp: new Date().toLocaleTimeString(),
              type: 'rx',
              raw: originalLine,
              decoded: `Auditoria ECM Delphi: ${hours}h ${minutes}m de motor | ${starts} partidas`,
              tag: 'STATUS',
            };
          }
        }
      } else if (cleanHex.includes('411f')) {
        const idx = cleanHex.indexOf('411f');
        if (cleanHex.length >= idx + 8) {
          const seconds = parseInt(cleanHex.substr(idx + 4, 4), 16);
          if (!isNaN(seconds)) {
            const totalMins = Math.round(seconds / 60);
            telemetry.engineHoursTotal = Math.floor(totalMins / 60);
            telemetry.engineMinutesTotal = totalMins % 60;
          }
        }
      }
    }

    // =========================================================================
    // 13. FALLBACK OBD-II GENÉRICO (PRESERVADO PARA COMPATIBILIDADE)
    // =========================================================================
    else if (cleanHex.startsWith('410c') && cleanHex.length >= 8) {
      const a = parseInt(cleanHex.substring(4, 6), 16);
      const b = parseInt(cleanHex.substring(6, 8), 16);
      if (!isNaN(a) && !isNaN(b)) {
        telemetry.rpm = Math.round((a * 256 + b) / 4);
      }
    } else if (cleanHex.startsWith('410d') && cleanHex.length >= 6) {
      const speed = parseInt(cleanHex.substring(4, 6), 16);
      if (!isNaN(speed)) {
        telemetry.speedKmH = speed;
        telemetry.speedMph = Math.round(speed * 0.621371);
      }
    } else if (cleanHex.startsWith('4105') && cleanHex.length >= 6) {
      const rawC = parseInt(cleanHex.substring(4, 6), 16) - 40;
      if (!isNaN(rawC)) {
        telemetry.engineTempC = rawC;
        telemetry.engineTempF = Math.round((rawC * 9) / 5 + 32);
      }
    } else if (cleanHex.startsWith('4142') && cleanHex.length >= 8) {
      const a = parseInt(cleanHex.substring(4, 6), 16);
      const b = parseInt(cleanHex.substring(6, 8), 16);
      if (!isNaN(a) && !isNaN(b)) {
        telemetry.batteryVoltage = (a * 256 + b) / 1000;
      }
    } else if (cleanHex.startsWith('4114') && cleanHex.length >= 8) {
      const voltByte = parseInt(cleanHex.substring(4, 6), 16);
      const trimByte = parseInt(cleanHex.substring(6, 8), 16);
      if (!isNaN(voltByte)) {
        telemetry.frontO2Voltage = Number((voltByte / 200).toFixed(3));
        if (!isNaN(trimByte) && trimByte !== 0xff) {
          telemetry.frontShortTermFuelTrim = Number((((trimByte - 128) * 100) / 128).toFixed(1));
        }
        telemetry.frontAFR = Number((14.7 - (telemetry.frontO2Voltage - 0.45) * 3).toFixed(2));
      }
    } else if (cleanHex.startsWith('4115') && cleanHex.length >= 8) {
      const voltByte = parseInt(cleanHex.substring(4, 6), 16);
      const trimByte = parseInt(cleanHex.substring(6, 8), 16);
      if (!isNaN(voltByte)) {
        telemetry.rearO2Voltage = Number((voltByte / 200).toFixed(3));
        if (!isNaN(trimByte) && trimByte !== 0xff) {
          telemetry.rearShortTermFuelTrim = Number((((trimByte - 128) * 100) / 128).toFixed(1));
        }
        telemetry.rearAFR = Number((14.7 - (telemetry.rearO2Voltage - 0.45) * 3).toFixed(2));
      }
    } else if (cleanHex.startsWith('4111') && cleanHex.length >= 6) {
      const tpsVal = parseInt(cleanHex.substring(4, 6), 16);
      if (!isNaN(tpsVal)) {
        telemetry.throttlePosition = Math.round((tpsVal * 100) / 255);
      }
    } else if (cleanHex.startsWith('410b') && cleanHex.length >= 6) {
      const mapVal = parseInt(cleanHex.substring(4, 6), 16);
      if (!isNaN(mapVal)) {
        telemetry.manifoldPressureKpa = mapVal;
      }
    } else if (cleanHex.startsWith('4103') && cleanHex.length >= 6) {
      const statusByte = parseInt(cleanHex.substring(4, 6), 16);
      if (statusByte === 2) telemetry.fuelSystemStatus = 'Closed-Loop';
      else if (statusByte === 8) telemetry.fuelSystemStatus = 'Open-Loop (WOT)';
      else if (statusByte === 1) telemetry.fuelSystemStatus = 'Open-Loop (Cold)';
      else telemetry.fuelSystemStatus = 'Open-Loop';
    } else if (cleanHex.startsWith('70') || cleanHex.startsWith('71')) {
      packetLog = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'rx',
        raw: originalLine,
        decoded: `[ECU DELPHI] Teste de Atuador Aceito e em Execução`,
        tag: 'ACTUATOR',
      };
    } else {
      packetLog = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'rx',
        raw: originalLine,
        decoded: `Pacote J1850 Bruto: ${cleanHex.toUpperCase()}`,
        tag: 'OTHER',
      };
    }

    return { telemetry, packetLog };
  }

  private updateVin(telemetry: TelemetryData) {
    const raw = this.vinChars.join('').trim();
    if (raw.length === 17 && !raw.includes('-')) {
      telemetry.vin = raw;
    }
  }

  private updateEcmPn(telemetry: TelemetryData) {
    const raw = this.ecmPnChars.join('').replace(/-/g, '').trim();
    if (raw.length >= 4) {
      telemetry.ecuPartNumber = raw;
    }
  }

  private updateCalId(telemetry: TelemetryData) {
    const raw = this.ecmCalIdChars.join('').replace(/-/g, '').trim();
    if (raw.length >= 4) {
      telemetry.ecuCalId = raw;
    }
  }

  /**
   * Estimativa de marcha baseada em relações de transmissão Harley-Davidson (Fallback)
   */
  private calculateGear(rpm: number, speedKmH: number, isNeutral?: boolean): number | 'N' {
    if (isNeutral || speedKmH < 3 || rpm < 700) {
      return 'N';
    }

    const ratio = rpm / speedKmH;
    if (ratio > 68) return 1;
    if (ratio > 47) return 2;
    if (ratio > 34) return 3;
    if (ratio > 26) return 4;
    if (ratio > 21) return 5;
    if (ratio > 14) return 6;

    return 6;
  }
}

/**
 * Converte bytes hexadecimais para string ASCII
 */
export function hexToAscii(hex: string): string {
  let str = '';
  for (let i = 0; i < hex.length; i += 2) {
    const charCode = parseInt(hex.substr(i, 2), 16);
    if (!isNaN(charCode) && charCode >= 32 && charCode <= 126) {
      str += String.fromCharCode(charCode);
    }
  }
  return str.trim();
}

/**
 * Converte a resposta do Modo OBD2 03 em códigos DTC (Fallback OBD2 genérico)
 */
export function parseMode03DTCs(bytesHex: string): string[] {
  const dtcs: string[] = [];
  const clean = bytesHex.replace(/[\s:]+/g, '').toUpperCase();

  for (let i = 0; i < clean.length; i += 4) {
    const piece = clean.substr(i, 4);
    if (piece.length < 4 || piece === '0000') continue;

    const firstChar = piece.charAt(0);
    let system = 'P';
    let digit1 = '0';

    switch (firstChar) {
      case '0': system = 'P'; digit1 = '0'; break;
      case '1': system = 'P'; digit1 = '1'; break;
      case '2': system = 'P'; digit1 = '2'; break;
      case '3': system = 'P'; digit1 = '3'; break;
      case '4': system = 'C'; digit1 = '0'; break;
      case '5': system = 'C'; digit1 = '1'; break;
      case '6': system = 'C'; digit1 = '2'; break;
      case '7': system = 'C'; digit1 = '3'; break;
      case '8': system = 'B'; digit1 = '0'; break;
      case '9': system = 'B'; digit1 = '1'; break;
      case 'A': system = 'B'; digit1 = '2'; break;
      case 'B': system = 'B'; digit1 = '3'; break;
      case 'C': system = 'U'; digit1 = '0'; break;
      case 'D': system = 'U'; digit1 = '1'; break;
      case 'E': system = 'U'; digit1 = '2'; break;
      case 'F': system = 'U'; digit1 = '3'; break;
      default: system = 'P'; digit1 = '0'; break;
    }

    const codigoCompleto = `${system}${digit1}${piece.substring(1, 4)}`;
    if (!dtcs.includes(codigoCompleto)) {
      dtcs.push(codigoCompleto);
    }
  }
  return dtcs;
}

/**
 * Mapeamento estático de erros conhecidos J1850 da Harley-Davidson
 */
export const BANCO_ERROS_HARLEY: Record<string, { desc: string; category: string; tip: string }> = {
  P0107: {
    desc: 'Sensor MAP - Circuito Aberto/Baixo',
    category: 'Injeção / Mistura',
    tip: 'Verifique o chicote e o conector do sensor de pressão absoluta no coletor de admissão.',
  },
  P0108: {
    desc: 'Sensor MAP - Circuito Alto',
    category: 'Injeção / Mistura',
    tip: 'Tensão alta no sensor MAP. Possível curto no chicote positivo de 5V.',
  },
  P0113: {
    desc: 'Sensor IAT (Ar de Admissão) - Aberto/Alto',
    category: 'Admissão',
    tip: 'Sensor de temperatura do ar desconectado ou defeituoso na caixa de ar.',
  },
  P0118: {
    desc: 'Sensor ET (Temperatura do Motor) - Aberto/Alto',
    category: 'Térmico',
    tip: 'Sensor de temperatura do cabeçote desconectado ou resistência infinita.',
  },
  P0122: {
    desc: 'Sensor TPS 1 (Posição da Borboleta) - Tensão Baixa',
    category: 'Acelerador',
    tip: 'Verifique conectores do corpo de borboletas ou fiação na coluna de direção.',
  },
  P0131: {
    desc: 'Sensor de O2 Dianteiro - Mistura Pobre / Sinal Baixo',
    category: 'Sonda Lambda',
    tip: 'Verifique vazamento no coletor de escape dianteiro ou fiação da sonda lambda.',
  },
  P0152: {
    desc: 'Sensor de O2 Traseiro - Mistura Rica / Sinal Alto',
    category: 'Sonda Lambda',
    tip: 'Verifique vazamento no injetor traseiro ou curto na alimentação da sonda lambda.',
  },
  P0261: {
    desc: 'Injetor Frontal - Aberto/Baixo',
    category: 'Injeção',
    tip: 'Bico injetor dianteiro sem sinal ou circuito interrompido.',
  },
  P0263: {
    desc: 'Injetor Traseiro - Aberto/Baixo',
    category: 'Injeção',
    tip: 'Bico injetor traseiro sem sinal ou chicote interrompido.',
  },
  P0505: {
    desc: 'Controle de Marcha Lenta (IAC) com Perda de Passo',
    category: 'Marcha Lenta',
    tip: 'Atuador de marcha lenta sujo com carbonização. Limpeza recomendada com descarbonizante.',
  },
  P0562: {
    desc: 'Tensão do Sistema Baixa (Bateria/Carga)',
    category: 'Elétrica',
    tip: 'Tensão abaixo de 11.5V. Verifique bornes da bateria, estator ou regulador de voltagem.',
  },
  P0563: {
    desc: 'Tensão do Sistema Alta (Regulador de Voltagem)',
    category: 'Elétrica',
    tip: 'Tensão acima de 15.5V. Regulador em curto danificando a ECU.',
  },
  P1353: {
    desc: 'Sem Combustão Detectada no Cilindro Dianteiro (Misfire)',
    category: 'Ignição',
    tip: 'Verifique cabo de vela, vela dianteira ou bobina de ignição.',
  },
  P1356: {
    desc: 'Sem Combustão Detectada no Cilindro Traseiro (Misfire)',
    category: 'Ignição',
    tip: 'Verifique cabo de vela, vela traseira ou bobina de ignição.',
  },
  U1016: {
    desc: 'Perda de Comunicação com a ECU (ECM)',
    category: 'Rede J1850',
    tip: 'Falha de comunicação entre o velocímetro/módulos e o módulo principal de injeção.',
  },
  U1064: {
    desc: 'Perda de Comunicação com TSM/HFSM (Módulo de Alarme/Setas)',
    category: 'Rede J1850',
    tip: 'Chicote do módulo de piscas/alarme com mau contato no barramento J1850.',
  },
  U1300: {
    desc: 'Barramento J1850 com Tensão Baixa',
    category: 'Rede J1850',
    tip: 'Curto-circuito do fio de dados serial (geralmente cinza/roxo) com o chassi/terra.',
  },
  U1301: {
    desc: 'Barramento J1850 com Tensão Alta',
    category: 'Rede J1850',
    tip: 'Curto-circuito do fio de dados serial com o positivo da bateria (12V).',
  },
};
