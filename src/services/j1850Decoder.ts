import { J1850_DTC_DESCRIPTIONS } from './j1850DtcCatalog';
import { TelemetryData, PacketLog } from '../types';
import { decodeReferenceJ1850Dpid } from './j1850ReferenceDecoder';
import { getReferenceDpidPayloadSize, getReferenceStreamsForDpid } from './j1850ReferenceCatalog';

/**
 * Cálculo e validação do CRC VPW Harley (polinômio 0x1D, valor inicial 0xFF)
 * Baseado fielmente na implementação do referência técnica (J1850.java)
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

  // Buffers persistentes para montagem progressiva dos blocos Harley (referência técnica)
  private vinChars: string[] = Array(17).fill('-');
  private ecmPnChars: string[] = Array(12).fill('-');
  private ecmCalIdChars: string[] = Array(12).fill('-');

  // Acumuladores de DTCs
  private activeDtcSet: Set<string> = new Set();
  private historicDtcSet: Set<string> = new Set();

  // Rastreamento de Odômetro (referência técnica odoaccum / odolast)
  // Referência referência técnica: contador incremental de 16 bits (current trip odometer), 1 tick = 0,4m
  private odolast: number = -1;
  private odoaccum: number = 0;

  // Timestamp da última leitura de marcha real (para não ser sobrescrita pelo fallback de cálculo)
  private lastRealGearTimestamp: number = 0;

  /** Reseta somente o buffer usado para montar o VIN. */
  public resetVehicleIdentity(): void {
    this.vinChars = Array(17).fill('-');
  }

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

      // ATRV mede a tensão de alimentação vista pelo ELM327 (pino 16 OBD).
      // Não é um PID de tensão da ECM e, portanto, não deve alimentar batteryVoltage.
      if (line.endsWith('V') && !isNaN(parseFloat(line))) {
        const voltage = parseFloat(line);
        updatedTelemetry.elmSupplyVoltage = voltage;
        onPacket({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: line,
          decoded: `[SOURCE:ELM-ATRV] Alimentação ELM327: ${voltage.toFixed(1)}V`,
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

    const storeActiveDpid = (
      dpid: string,
      rawBytes: number[],
      values: Record<string, string | number>,
      note?: string,
      meta?: { catalogSource?: 'catálogo técnico de referência' | 'Real-bike validation' | 'Unknown'; validation?: 'REFERENCE_MAPPED' | 'REAL_VALIDATED' | 'DETECTED_UNMAPPED' | 'UNSUPPORTED' | 'UNKNOWN'; dataStreams?: string[] },
    ) => {
      telemetry.activeDpidData = {
        ...(telemetry.activeDpidData || {}),
        [dpid]: {
          dpid,
          status: 'ok',
          raw: rawBytes.map(v => v.toString(16).padStart(2, '0')).join(' ').toUpperCase(),
          updatedAt: Date.now(),
          values,
          note,
          catalogSource: getReferenceDpidPayloadSize(dpid) > 0 ? 'catálogo técnico de referência' : 'Unknown',
          validation: getReferenceDpidPayloadSize(dpid) > 0 ? 'REFERENCE_MAPPED' : 'UNKNOWN',
          dataStreams: getReferenceStreamsForDpid(dpid).map(s=>s.name),
          ...meta,
        },
      };
    };


    const bytes = this.hexStringToBytes(cleanHex);

    // =========================================================================
    // 1. HARLEY RPM (Frame 28 1B 10 02 XX XX -> RPM = valor / 4)
    // =========================================================================
    if (cleanHex.startsWith('281b1002')) {
      const idx = 0;
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
            decoded: `[SOURCE:BROADCAST] Harley RPM: ${telemetry.rpm} RPM [hex:${hexBytes}]`,
            tag: 'RPM',
          };
        }
      }
    }

    // =========================================================================
    // 2. HARLEY VELOCIDADE (Frame 48 29 10 02 XX XX -> km/h = valor / 128)
    // =========================================================================
    else if (cleanHex.startsWith('48291002')) {
      const idx = 0;
      if (cleanHex.length >= idx + 12) {
        const hexBytes = cleanHex.substr(idx + 8, 4);
        const valorDecimal = parseInt(hexBytes, 16);
        if (!isNaN(valorDecimal)) {
          const speedFinal = Math.round(valorDecimal / 128);
          telemetry.speedKmH = Math.min(260, Math.max(0, speedFinal));
          telemetry.speedMph = Math.round(telemetry.speedKmH * 0.621371);

          // Marcha: prioridade absoluta para frame real A8 3B 10 03 XX.
          // Na ECM real testada, os logs não mostraram esse broadcast e DPID 0x1E respondeu NEG.
          // Portanto, quando a moto ESTÁ EM MOVIMENTO e não houve marcha real recente,
          // usamos somente o fallback RPM/velocidade. Parada não fabrica 1ª/2ª/N.
          const hasRecentRealGear = this.lastRealGearTimestamp > 0 && (Date.now() - this.lastRealGearTimestamp) < 2000;
          if (!hasRecentRealGear && telemetry.speedKmH >= 3 && telemetry.rpm >= 700 && telemetry.neutral !== true) {
            const inferredGear = this.calculateGear(telemetry.rpm, telemetry.speedKmH, false);
            if (inferredGear !== 'N') {
              telemetry.gear = inferredGear;
            }
          }

          packetLog = {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            type: 'rx',
            raw: originalLine,
            decoded: `[SOURCE:BROADCAST] Harley Velocidade: ${telemetry.speedKmH} km/h (${telemetry.speedMph} mph) [hex:${hexBytes}]`,
            tag: 'SPEED',
          };
        }
      }
    }

    // =========================================================================
    // 3. HARLEY TEMPERATURA MOTOR (Frame A8 49 10 10 XX -> °C = RAW - 40)
    //    Validado em moto real contra DPID 0x12 em múltiplos pontos térmicos.
    // =========================================================================
    else if (cleanHex.startsWith('a8491010')) {
      const idx = 0;
      if (cleanHex.length >= idx + 10) {
        const hexByte = cleanHex.substr(idx + 8, 2);
        const rawTemp = parseInt(hexByte, 16);
        if (!isNaN(rawTemp)) {
          telemetry.engineTempC = rawTemp - 40;
          telemetry.engineTempF = Math.round((telemetry.engineTempC * 9) / 5 + 32);
          packetLog = {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            type: 'rx',
            raw: originalLine,
            decoded: `[SOURCE:BROADCAST] Harley Temp Motor: ${telemetry.engineTempC}°C / ${telemetry.engineTempF}°F [hex:${hexByte}]`,
            tag: 'TEMP',
          };
        }
      }
    }

    // =========================================================================
    // 4. HARLEY MARCHA REAL (Frame A8 3B 10 03 XX)
    // 01 = 1ª, 03 = 2ª, 07 = 3ª, 0F = 4ª, 1F = 5ª, 3F = 6ª
    // =========================================================================
    else if (cleanHex.startsWith('a83b1003')) {
      const idx = 0;
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
            // Fora dos valores observados/documentados para 1ª–6ª: não fabricar marcha.
            // O byte bruto continua registrado para investigação em moto real.
            packetLog = {
              id: Math.random().toString(36).substring(2, 9),
              timestamp: new Date().toLocaleTimeString(),
              type: 'rx',
              raw: originalLine,
              decoded: `[SOURCE:BROADCAST] Marcha: byte não reconhecido 0x${hexVal.toString(16).padStart(2, '0').toUpperCase()} — estado anterior preservado`,
              tag: 'STATUS',
            };
            return { telemetry, packetLog };
          }

          // 0x00 significa ausência de marcha no frame; o neutro é confirmado pelo frame 48 3B 40 XX.
          // Não força N aqui para evitar conflito entre fontes.
          if (hexVal !== 0) {
            telemetry.gear = gear;
            telemetry.neutral = false;
            this.lastRealGearTimestamp = Date.now();
          }

          packetLog = {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            type: 'rx',
            raw: originalLine,
            decoded: `[SOURCE:BROADCAST] Harley Marcha: ${hexVal === 0 ? 'SEM MARCHA (aguardando estado de neutro)' : `${gear}ª Marcha`} [hex:0x${hexVal.toString(16).padStart(2, '0')}]`,
            tag: 'STATUS',
          };
        }
      }
    }

    // =========================================================================
    // 5. HARLEY NEUTRO E EMBREAGEM (Frame 48 3B 40 XX)
    // Semântica do parser original referência técnica:
    //   XX = 0x20 -> fora do neutro
    //   XX = 0xA0 -> neutro
    //   bit 0x80  -> embreagem acionada
    // Não reduzir a regra de neutro a (XX & 0x20) != 0: isso inverteria 0x20.
    // =========================================================================
    else if (cleanHex.startsWith('483b40')) {
      const idx = 0;
      if (cleanHex.length >= idx + 8) {
        const xx = parseInt(cleanHex.substr(idx + 6, 2), 16);
        if (!isNaN(xx)) {
          let neutralState: boolean | undefined;
          if (xx === 0x20) neutralState = false;
          else if (xx === 0xa0) neutralState = true;

          const isClutch = (xx & 0x80) !== 0;
          if (neutralState !== undefined) {
            telemetry.neutral = neutralState;
            if (neutralState) telemetry.gear = 'N';
          }
          telemetry.clutchEngaged = isClutch;

          packetLog = {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            type: 'rx',
            raw: originalLine,
            decoded: `[SOURCE:BROADCAST] Harley: Neutro=${neutralState === undefined ? 'SEM ALTERAÇÃO' : neutralState ? 'SIM' : 'NÃO'} | Embreagem=${isClutch ? 'ACIONADA' : 'LIVRE'} [hex:0x${xx.toString(16).padStart(2, '0')}]`,
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
            decoded: `Harley Setas: Esq=${telemetry.turnLeft ? 'ON' : 'OFF'} | Dir=${telemetry.turnRight ? 'ON' : 'OFF'}`,
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
              decoded: `Harley Odômetro: ${kmTotal.toLocaleString()} km (Ticks: ${this.odoaccum})`,
              tag: 'STATUS',
            };
          }
        }
      }
    }

    // =========================================================================
    // 8. HARLEY NÍVEL DE COMBUSTÍVEL / FUEL GAUGE (Frame A8 83 61 12 dX ou A8 83 61 92 dX)
    // referência técnica (J1850.java): (x & 0xffffff7f) == 0xa8836112
    // in[4] & 0x0f: fuelLevelRaw (escala bruta Harley 0–15)
    // (in[3] & 0x80) != 0: fuelLow (indicador de combustível baixo/reserva)
    // O último byte (ex: F0 em A8 83 61 12 EF F0) é CRC J1850 e NÃO é interpretado como dado.
    // =========================================================================
    else if (
      cleanHex.includes('a8836112') ||
      cleanHex.includes('a8836192') ||
      (bytes.length >= 5 && bytes[0] === 0xa8 && bytes[1] === 0x83 && bytes[2] === 0x61 && (bytes[3] & 0x7f) === 0x12)
    ) {
      const idx12 = cleanHex.indexOf('a8836112');
      const idx92 = cleanHex.indexOf('a8836192');
      const idx = idx12 !== -1 ? idx12 : idx92;
      const byteOffset = idx !== -1 ? Math.floor(idx / 2) : 0;

      if (bytes.length >= byteOffset + 5) {
        const fourthByte = bytes[byteOffset + 3];
        const dataByte = bytes[byteOffset + 4];
        const fuelLevelRaw = dataByte & 0x0f;
        const fuelLow = (fourthByte & 0x80) !== 0;

        telemetry.fuelLevelRaw = fuelLevelRaw;
        telemetry.fuelLow = fuelLow;

        packetLog = {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: originalLine,
          decoded: `Harley Combustível: nível bruto ${fuelLevelRaw}/15 | Reserva/Baixo: ${fuelLow ? 'SIM' : 'NÃO'}`,
          tag: 'STATUS',
        };
      }
    }

    // =========================================================================
    // 9. HARLEY CHECK ENGINE / MIL LAMP (Frame 68 88 10 83 = ON, 68 88 10 03 = OFF)
    // =========================================================================
    else if (cleanHex.includes('68881083')) {
      telemetry.checkEngine = true;
      packetLog = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'rx',
        raw: originalLine,
        decoded: 'Harley: Lâmpada de Injeção Eletrônica (MIL) ATIVADA [Falha Ativa]',
        tag: 'DTC',
      };
    } else if (cleanHex.includes('68881003')) {
      telemetry.checkEngine = false;
      packetLog = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'rx',
        raw: originalLine,
        decoded: 'Harley: Lâmpada de Injeção Eletrônica (MIL) DESLIGADA [OK]',
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
              decoded: `Harley: ECM P/N Bloco 1 recebido`,
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
              decoded: `Harley: ECM P/N Bloco 2 recebido -> P/N: ${telemetry.ecuPartNumber || 'Incompleto'}`,
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
              decoded: `Harley: Cal ID Bloco 1 recebido`,
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
              decoded: `Harley: Cal ID Bloco 2 recebido -> CalID: ${telemetry.ecuCalId || 'Incompleto'}`,
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
                decoded: `Harley: ECM Software Level = ${swLevel}`,
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
              decoded: `Harley: VIN Bloco 1 recebido`,
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
              decoded: `Harley: VIN Bloco 2 recebido`,
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
              decoded: `Harley: VIN Bloco 3 recebido -> VIN: ${telemetry.vin || 'Incompleto'}`,
              tag: 'STATUS',
            };
            break;
          }
        }
      }
    }

    // =========================================================================
    // 10. HARLEY ACTIVE DATA - dados ativos DPID 0x11
    // Request: 6C 10 F1 2A 01 11
    // Response: 6C F1 10 6A 11 [RPM_H] [RPM_L] [DesiredIdle] [Battery] [MAP] [TPS] [CRC]
    // dados ativos configuração de datastreams: DPID 0x11 -> $2001,$2002,$2003,$2004,$2005.
    // =========================================================================
    else if (cleanHex.startsWith('6cf1106a11')) {
      const frameBytes = bytes;
      // Header(3) + service(1) + DPID(1) + 6 data bytes = 11 bytes,
      // with an optional/visible CRC as the 12th byte depending on the ELM path.
      if (frameBytes.length >= 11) {
        const rpmRaw = (frameBytes[5] << 8) | frameBytes[6];
        const desiredIdleRaw = frameBytes[7];
        const batteryRaw = frameBytes[8];
        const mapRaw = frameBytes[9];
        const tpsRaw = frameBytes[10];

        // Do not replace the proven passive RPM broadcast yet; log the dados ativos RPM as a cross-check.
        const activeRpm = rpmRaw;
        const desiredIdleRpm = desiredIdleRaw * 8;
        telemetry.batteryVoltage = Math.round((batteryRaw * 0.1) * 10) / 10;
        telemetry.manifoldPressureKpa = Math.round((mapRaw * 0.368999988 + 10.35400009) * 10) / 10;
        telemetry.throttlePosition = Math.round((tpsRaw * 0.45449999) * 10) / 10;
        storeActiveDpid('11', frameBytes.slice(5, 11), { RPM: activeRpm, 'Desired Idle': desiredIdleRpm, 'Bateria (V)': telemetry.batteryVoltage, 'MAP (kPa)': telemetry.manifoldPressureKpa, 'TPS (%)': telemetry.throttlePosition }, 'catálogo técnico de referência + comportamento validado em moto real.', { catalogSource:'Real-bike validation', validation:'REAL_VALIDATED' });

        packetLog = {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: originalLine,
          decoded: `[SOURCE:ECM-ACTIVE][DPID:0x11] Battery=${telemetry.batteryVoltage.toFixed(1)}V | MAP=${telemetry.manifoldPressureKpa.toFixed(1)}kPa | TPS=${telemetry.throttlePosition.toFixed(1)}% | Active-RPM=${activeRpm} | DesiredIdle=${desiredIdleRpm} RPM`,
          tag: 'STATUS',
        };
      }
    }


    // =========================================================================
    // 10B. HARLEY ACTIVE DATA - dados ativos DPID 0x12 (Rev11 experimental/log-only)
    // catálogo técnico mapping: Engine Temp raw-16 C; IAT raw-16 C; four sensor voltages raw*0.01953125 V.
    // Deliberadamente NÃO substitui a temperatura passiva do painel nesta revisão.
    // =========================================================================
    else if (cleanHex.startsWith('6cf1106a12')) {
      const frameBytes = bytes;
      if (frameBytes.length >= 11) {
        const engineTempCActive = frameBytes[5] - 16;
        const intakeTempCActive = frameBytes[6] - 16;
        const etVolts = frameBytes[7] * 0.01953125;
        const iatVolts = frameBytes[8] * 0.01953125;
        const mapVolts = frameBytes[9] * 0.01953125;
        const tpsVolts = frameBytes[10] * 0.01953125;
        storeActiveDpid('12', frameBytes.slice(5, 11), { 'Temp. motor (°C)': engineTempCActive, 'IAT (°C)': intakeTempCActive, 'ET sensor (V)': Number(etVolts.toFixed(3)), 'IAT sensor (V)': Number(iatVolts.toFixed(3)), 'MAP sensor (V)': Number(mapVolts.toFixed(3)), 'TPS sensor (V)': Number(tpsVolts.toFixed(3)) }, 'catálogo técnico de referência + comportamento validado em moto real; temperatura ativa RAW − 16.', { catalogSource:'Real-bike validation', validation:'REAL_VALIDATED' });
        packetLog = {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: originalLine,
          decoded: `[RESEARCH-TEST][DPID:0x12] EngineTemp=${engineTempCActive}°C | IAT=${intakeTempCActive}°C | ET=${etVolts.toFixed(3)}V | IAT=${iatVolts.toFixed(3)}V | MAP=${mapVolts.toFixed(3)}V | TPS=${tpsVolts.toFixed(3)}V | RAW=${frameBytes.slice(5, 11).map(v => v.toString(16).padStart(2, '0')).join(' ').toUpperCase()}`,
          tag: 'STATUS',
        };
      }
    }

    // =========================================================================
    // 10C. RESEARCH J1850 - DPIDs experimentais catalogados (log-only)
    // Nenhum destes campos altera o painel nesta revisão. O objetivo é validar
    // na moto o catálogo extraído do catálogo técnico antes de promover qualquer fonte.
    // =========================================================================
    else if (cleanHex.startsWith('6cf1106a13') && bytes.length >= 11) {
      const d = bytes.slice(5, 11);
      storeActiveDpid('13', d, { 'Spark Front (°)': Number((d[0]*0.5).toFixed(1)), 'Spark Rear (°)': Number((d[1]*0.5).toFixed(1)), 'Knock Fast F (°)': Number((d[2]*0.5).toFixed(1)), 'Knock Fast R (°)': Number((d[3]*0.5).toFixed(1)), IAC: d[4], 'Engine Flag': `0x${d[5].toString(16).padStart(2,'0').toUpperCase()}` });
      packetLog = { id: Math.random().toString(36).substring(2, 9), timestamp: new Date().toLocaleTimeString(), type: 'rx', raw: originalLine,
        decoded: `[RESEARCH-TEST][DPID:0x13] SparkF=${(d[0]*0.5).toFixed(1)}° | SparkR=${(d[1]*0.5).toFixed(1)}° | KnockFastF=${(d[2]*0.5).toFixed(1)}° | KnockFastR=${(d[3]*0.5).toFixed(1)}° | IAC=${d[4]} | EngineFlag=0x${d[5].toString(16).padStart(2,'0').toUpperCase()} | RAW=${d.map(v=>v.toString(16).padStart(2,'0')).join(' ').toUpperCase()}`, tag: 'STATUS' };
    }
    else if (cleanHex.startsWith('6cf1106a16') && bytes.length >= 11) {
      const d = bytes.slice(5, 11);
      const u16=(i:number)=>((d[i]<<8)|d[i+1]);
      storeActiveDpid('16', d, { 'Accel Enrich (ms)': Number((u16(0)*0.004).toFixed(3)), 'Injector BPW F (ms)': Number((u16(2)*0.004).toFixed(3)), 'Injector BPW R (ms)': Number((u16(4)*0.004).toFixed(3)) });
      packetLog = { id: Math.random().toString(36).substring(2, 9), timestamp: new Date().toLocaleTimeString(), type: 'rx', raw: originalLine,
        decoded: `[RESEARCH-TEST][DPID:0x16] AccelEnrich=${(u16(0)*0.004).toFixed(3)}ms | InjectorBPW-F=${(u16(2)*0.004).toFixed(3)}ms | InjectorBPW-R=${(u16(4)*0.004).toFixed(3)}ms | RAW=${d.map(v=>v.toString(16).padStart(2,'0')).join(' ').toUpperCase()}`, tag: 'STATUS' };
    }
    else if (cleanHex.startsWith('6cf1106a17') && bytes.length >= 11) {
      const d = bytes.slice(5, 11);
      const u16=(i:number)=>((d[i]<<8)|d[i+1]);
      storeActiveDpid('17', d, { 'Decel Enlean (ms)': Number((u16(0)*0.004).toFixed(3)), 'Spark F hi-res (°)': Number((u16(2)*0.25).toFixed(2)), 'Spark R hi-res (°)': Number((u16(4)*0.25).toFixed(2)) });
      packetLog = { id: Math.random().toString(36).substring(2, 9), timestamp: new Date().toLocaleTimeString(), type: 'rx', raw: originalLine,
        decoded: `[RESEARCH-TEST][DPID:0x17] DecelEnlean=${(u16(0)*0.004).toFixed(3)}ms | SparkF-hi=${(u16(2)*0.25).toFixed(2)}° | SparkR-hi=${(u16(4)*0.25).toFixed(2)}° | RAW=${d.map(v=>v.toString(16).padStart(2,'0')).join(' ').toUpperCase()}`, tag: 'STATUS' };
    }
    else if (cleanHex.startsWith('6cf1106a18') && bytes.length >= 11) {
      const d = bytes.slice(5, 11);
      storeActiveDpid('18', d, { 'VE Front': Number((d[0]*0.5).toFixed(1)), 'VE Rear': Number((d[1]*0.5).toFixed(1)), 'VE New Front': Number((d[2]*0.5).toFixed(1)), 'VE New Rear': Number((d[3]*0.5).toFixed(1)), 'Warm Up AFR': Number((d[4]*0.1).toFixed(1)), IAC: d[5] }, 'Fórmulas catálogo técnico de referência.', { catalogSource:'catálogo técnico de referência', validation:'REFERENCE_MAPPED', dataStreams:['Generic Data','Generic O2 Data','DBW Data','Tuning Data'] });
      packetLog = { id: Math.random().toString(36).substring(2, 9), timestamp: new Date().toLocaleTimeString(), type: 'rx', raw: originalLine,
        decoded: `[REFERENCE][DPID:0x18] VE-F=${(d[0]*0.5).toFixed(1)}% | VE-R=${(d[1]*0.5).toFixed(1)}% | VE-New-F=${(d[2]*0.5).toFixed(1)}% | VE-New-R=${(d[3]*0.5).toFixed(1)}% | WarmUpAFR=${(d[4]*0.1).toFixed(1)} | IAC=${d[5]} | RAW=${d.map(v=>v.toString(16).padStart(2,'0')).join(' ').toUpperCase()}`, tag: 'STATUS' };
    }
    else if (cleanHex.startsWith('6cf1106a1a') && bytes.length >= 11) {
      const d = bytes.slice(5, 11);
      const u16=(i:number)=>((d[i]<<8)|d[i+1]);
      storeActiveDpid('1A', d, { 'O2 Raw Front (mV)': Number((u16(0)*0.0763126).toFixed(3)), 'O2 Raw Rear (mV)': Number((u16(2)*0.0763126).toFixed(3)), 'Knock Front (°)': Number((d[4]*0.25).toFixed(2)), 'Knock Rear (°)': Number((d[5]*0.25).toFixed(2)) });
      packetLog = { id: Math.random().toString(36).substring(2, 9), timestamp: new Date().toLocaleTimeString(), type: 'rx', raw: originalLine,
        decoded: `[RESEARCH-TEST][DPID:0x1A] O2RawF=${(u16(0)*0.0763126).toFixed(3)}mV | O2RawR=${(u16(2)*0.0763126).toFixed(3)}mV | KnockF=${(d[4]*0.25).toFixed(2)}° | KnockR=${(d[5]*0.25).toFixed(2)}° | RAW=${d.map(v=>v.toString(16).padStart(2,'0')).join(' ').toUpperCase()}`, tag: 'STATUS' };
    }
    else if (cleanHex.startsWith('6cf1106a1d') && bytes.length >= 11) {
      const d = bytes.slice(5, 11);
      const o2FrontMv = d[0] * 20;
      const o2RearMv = d[1] * 20;
      const integratorF = Number((d[2] * 0.78125).toFixed(2));
      const integratorR = Number((d[3] * 0.78125).toFixed(2));
      const longTermF = Number((d[4] * 0.78125).toFixed(2));
      const longTermR = Number((d[5] * 0.78125).toFixed(2));
      storeActiveDpid('1D', d, { 'O2 Front (mV)': o2FrontMv, 'O2 Rear (mV)': o2RearMv, 'Integrator F (%)': integratorF, 'Integrator R (%)': integratorR, 'Long Term F (%)': longTermF, 'Long Term R (%)': longTermR }, 'Mapeamento catálogo técnico de referência + comportamento validado em moto real; RAW preservado.', { catalogSource:'Real-bike validation', validation:'REAL_VALIDATED' });
      // Espelha somente grandezas sustentadas pelo DPID 0x1D. Não deriva AFR narrowband.
      telemetry.frontO2Voltage = o2FrontMv / 1000;
      telemetry.rearO2Voltage = o2RearMv / 1000;
      telemetry.frontShortTermFuelTrim = Number((integratorF - 100).toFixed(2));
      telemetry.rearShortTermFuelTrim = Number((integratorR - 100).toFixed(2));
      telemetry.frontAFR = undefined;
      telemetry.rearAFR = undefined;
      packetLog = { id: Math.random().toString(36).substring(2, 9), timestamp: new Date().toLocaleTimeString(), type: 'rx', raw: originalLine,
        decoded: `[RESEARCH-TEST][DPID:0x1D][GENERIC-O2] O2F=${d[0]*20}mV | O2R=${d[1]*20}mV | IntegratorF=${(d[2]*0.78125).toFixed(2)}% | IntegratorR=${(d[3]*0.78125).toFixed(2)}% | LongTermF=${(d[4]*0.78125).toFixed(2)}% | LongTermR=${(d[5]*0.78125).toFixed(2)}% | RAW=${d.map(v=>v.toString(16).padStart(2,'0')).join(' ').toUpperCase()}`, tag: 'STATUS' };
    }
    else if (cleanHex.startsWith('6cf1106a19') && bytes.length >= 11) {
      const d = bytes.slice(5, 11);
      const airTempC = d[0] - 16;
      const chargeTempC = d[1] - 16;
      const engineTempC = d[2] - 16;
      const headTempC = d[3] - 16;
      const tpsPct = d[4] * 0.45449999;
      const tpsVolts = d[5] * 0.01953125;
      storeActiveDpid('19', d, { 'Air Temp (°C)': airTempC, 'Charge Temp (°C)': chargeTempC, 'Engine Temp (°C)': engineTempC, 'Head Temp (°C)': headTempC, 'TPS (%)': Number(tpsPct.toFixed(1)), 'TPS (V)': Number(tpsVolts.toFixed(3)) });
      packetLog = { id: Math.random().toString(36).substring(2, 9), timestamp: new Date().toLocaleTimeString(), type: 'rx', raw: originalLine,
        decoded: `[RESEARCH-STRONG][DPID:0x19] AirTemp=${airTempC}°C | ChargeTemp=${chargeTempC}°C | EngineTemp=${engineTempC}°C | HeadTemp=${headTempC}°C | TPS=${tpsPct.toFixed(1)}% | TPSVolts=${tpsVolts.toFixed(3)}V | RAW=${d.map(v=>v.toString(16).padStart(2,'0')).join(' ').toUpperCase()}`, tag: 'STATUS' };
    }
    else if (cleanHex.startsWith('6cf1106a1b') && bytes.length >= 11) {
      const d = bytes.slice(5, 11);
      const rpm = (d[0] << 8) | d[1];
      const runTimeRaw = d[2];
      const baroKpa = d[3] * 0.368999988 + 10.35400009;
      const syncRaw = d[4];
      const vehicleSpeedRaw = d[5];
      storeActiveDpid('1B', d, { RPM: rpm, 'Run Time raw': runTimeRaw, 'Barometer (kPa)': Number(baroKpa.toFixed(1)), 'Sync raw': `0x${syncRaw.toString(16).padStart(2,'0').toUpperCase()}`, 'Vehicle Speed raw': vehicleSpeedRaw });
      packetLog = { id: Math.random().toString(36).substring(2, 9), timestamp: new Date().toLocaleTimeString(), type: 'rx', raw: originalLine,
        decoded: `[RESEARCH-STRONG][DPID:0x1B] RPM=${rpm} | RunTimeRaw=${runTimeRaw} | Barometer=${baroKpa.toFixed(1)}kPa | SyncRaw=0x${syncRaw.toString(16).padStart(2,'0').toUpperCase()} | VehicleSpeedRaw=${vehicleSpeedRaw} | RAW=${d.map(v=>v.toString(16).padStart(2,'0')).join(' ').toUpperCase()}`, tag: 'STATUS' };
    }

    // Demais DPIDs ativos: decodificação dirigida pelo catálogo técnico de referência.
    // A fórmula só é aplicada após resposta positiva da ECM; DPID não suportado continua
    // sendo classificado pela camada de transporte como negative/unsupported.
    else if (/^6cf1106a(14|15|1c|1e|1f|20|21)/.test(cleanHex)) {
      const dpid = cleanHex.substring(8,10).toUpperCase();
      const payloadSize = getReferenceDpidPayloadSize(dpid);
      const d = payloadSize > 0 ? bytes.slice(5, 5 + payloadSize) : [];
      const decodedReference = decodeReferenceJ1850Dpid(dpid, d);
      if (decodedReference && d.length === payloadSize) {
        storeActiveDpid(dpid, d, decodedReference.values, decodedReference.note, {
          catalogSource: 'catálogo técnico de referência', validation: decodedReference.validation, dataStreams: decodedReference.streams,
        });
        packetLog = { id: Math.random().toString(36).substring(2, 9), timestamp: new Date().toLocaleTimeString(), type: 'rx', raw: originalLine,
          decoded: `[REFERENCE][DPID:0x${dpid}][REFERENCE_MAPPED] ${Object.entries(decodedReference.values).map(([k,v])=>`${k}=${v}`).join(' | ')} | RAW=${decodedReference.raw}`, tag: 'STATUS' };
      } else {
        storeActiveDpid(dpid, d, {}, 'Resposta positiva, mas payload não corresponde à definição catálogo técnico de referência carregada.', {
          catalogSource: 'Unknown', validation: 'DETECTED_UNMAPPED',
        });
      }
    }

    // =========================================================================
    // 11. HARLEY DTCs — status real J1850 legacy
    // Frame positivo observado: 6C F1 <NODE> 59 <DTC_HI> <DTC_LO> <STATUS> <CRC>
    // IMPORTANTE: 0x10/0x40/0x60 identificam o nó de origem, NÃO o estado do DTC.
    // Mapeamento final adotado a partir dos frames reais observados nesta ECM:
    //   0x11 = HISTÓRICO; 0x13 = CORRENTE.
    // Não inferir estado pelo nó 0x10/0x40/0x60 e não exibir 0x13 como Current+Historic.
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

      let hasValidCrc = false;
      if (frameBytes.length >= 5) {
        hasValidCrc = validateJ1850Crc(frameBytes) ||
          computeJ1850Crc(frameBytes.slice(0, -1)) === frameBytes[frameBytes.length - 1];
      }

      const dataBytes = hasValidCrc
        ? frameBytes.slice(4, frameBytes.length - 1)
        : frameBytes.slice(4);

      const parsedEntries: string[] = [];

      // Cada registro J1850 é DTC (2 bytes) + status (1 byte).
      for (let i = 0; i + 2 < dataBytes.length; i += 3) {
        const b0 = dataBytes[i];
        const b1 = dataBytes[i + 1];
        const status = dataBytes[i + 2];

        // 0000 é terminador/ausência de DTC; o status ainda pode existir no frame.
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
        if (!fullCode || fullCode === 'P0000') continue;

        // Status validado na motocicleta testada. Estados não observados ficam não classificados
        // em vez de serem promovidos por inferência de bits.
        const isHistoric = status === 0x11;
        const isCurrent = status === 0x13;

        if (isCurrent) this.activeDtcSet.add(fullCode);
        if (isHistoric) this.historicDtcSet.add(fullCode);

        const state = isCurrent ? 'CORRENTE' : isHistoric ? 'HISTÓRICO' : 'STATUS-NÃO-CLASSIFICADO';
        parsedEntries.push(`${fullCode} [${state}; status=0x${status.toString(16).padStart(2, '0').toUpperCase()}]`);
      }

      telemetry.activeDtcList = Array.from(this.activeDtcSet);
      telemetry.historicDtcList = Array.from(this.historicDtcSet);
      telemetry.checkEngine = this.activeDtcSet.size > 0;

      packetLog = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'rx',
        raw: originalLine,
        decoded: `Harley DTCs (Nó 0x${node}${hasValidCrc ? ' [CRC Válido]' : ''}): ${
          parsedEntries.length > 0 ? parsedEntries.join(', ') : 'Nenhuma falha gravada [OK]'
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
        decoded: `Harley: Confirmação de Memória de DTC Limpa [Resposta 54 OK]`,
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
      }
    } else if (cleanHex.startsWith('4115') && cleanHex.length >= 8) {
      const voltByte = parseInt(cleanHex.substring(4, 6), 16);
      const trimByte = parseInt(cleanHex.substring(6, 8), 16);
      if (!isNaN(voltByte)) {
        telemetry.rearO2Voltage = Number((voltByte / 200).toFixed(3));
        if (!isNaN(trimByte) && trimByte !== 0xff) {
          telemetry.rearShortTermFuelTrim = Number((((trimByte - 128) * 100) / 128).toFixed(1));
        }
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
        decoded: `Pacote Bruto: ${cleanHex.toUpperCase()}`,
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
 * Mapeamento estático de erros conhecidos diagnóstico da Harley-Davidson
 */
const BANCO_ERROS_HARLEY_CURADO: Record<string, { desc: string; category: string; tip: string }> = {
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
    category: 'Rede de Diagnóstico',
    tip: 'Falha de comunicação entre o velocímetro/módulos e o módulo principal de injeção.',
  },
  U1064: {
    desc: 'Perda de Comunicação com TSM/HFSM (Módulo de Alarme/Setas)',
    category: 'Rede de Diagnóstico',
    tip: 'Chicote do módulo de piscas/alarme com mau contato no barramento de diagnóstico.',
  },
  U1300: {
    desc: 'Barramento de diagnóstico com Tensão Baixa',
    category: 'Rede de Diagnóstico',
    tip: 'Curto-circuito do fio de dados serial (geralmente cinza/roxo) com o chassi/terra.',
  },
  U1301: {
    desc: 'Barramento de diagnóstico com Tensão Alta',
    category: 'Rede de Diagnóstico',
    tip: 'Curto-circuito do fio de dados serial com o positivo da bateria (12V).',
  },
};

export const BANCO_ERROS_HARLEY: Record<string, { desc: string; category: string; tip: string }> = {
  ...Object.fromEntries(Object.entries(J1850_DTC_DESCRIPTIONS).map(([code, desc]) => [code, {
    desc,
    category: 'DTC Harley / referência técnica',
    tip: 'Descrição rápida catálogo técnico de referência. A aplicabilidade varia por ano/modelo; para diagnóstico do circuito, consultar o manual de serviço da motocicleta.',
  }])),
  ...BANCO_ERROS_HARLEY_CURADO,
};
