import { TelemetryData, PacketLog } from '../types';

export class J1850Decoder {
  private buffer: string = '';
  // HarleyDroid persistent block buffers for assembling VIN, ECM Part Number and CalID
  private vinChars: string[] = Array(17).fill('-');
  private ecmPnChars: string[] = Array(12).fill('-');
  private ecmCalIdChars: string[] = Array(12).fill('-');

  public resetCounters() {
    this.vinChars = Array(17).fill('-');
    this.ecmPnChars = Array(12).fill('-');
    this.ecmCalIdChars = Array(12).fill('-');
  }

  /**
   * Cleans raw incoming serial chunk and parses complete frames/lines
   */
  public parseChunk(
    chunk: string,
    currentTelemetry: TelemetryData,
    onPacket: (packet: PacketLog) => void
  ): TelemetryData {
    this.buffer += chunk;

    // Check for standard line breaks or prompt '>'
    const lines = this.buffer.split(/[\r\n>]+/);
    // Keep the last incomplete fragment in buffer
    this.buffer = lines.pop() || '';

    let updatedTelemetry = { ...currentTelemetry };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Check for ELM327 system messages or ATRV voltage
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

      // Check for ELM327 standard responses (OK, ELM327 v1.5, SEARCHING..., NO DATA, etc.)
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

      // Standardize hex text: strip spaces and lowercase
      const cleanHex = line.replace(/[\s:]+/g, '').toLowerCase();

      // Decode Harley J1850 broadcast frames or OBD2 queries
      const { telemetry, packetLog } = this.decodeHex(cleanHex, line, updatedTelemetry);
      updatedTelemetry = telemetry;
      if (packetLog) {
        onPacket(packetLog);
      }
    }

    return updatedTelemetry;
  }

  /**
   * Decodes a cleaned hex string according to Harley-Davidson J1850 spec & OBD2
   */
  public decodeHex(
    cleanHex: string,
    originalLine: string,
    state: TelemetryData
  ): { telemetry: TelemetryData; packetLog?: PacketLog } {
    let telemetry = { ...state, lastUpdated: Date.now() };
    let packetLog: PacketLog | undefined;

    // 1. HARLEY RPM (Alvo: 281b1002xxxx)
    if (cleanHex.includes('281b1002')) {
      const idx = cleanHex.indexOf('281b1002');
      if (cleanHex.length >= idx + 12) {
        const hexBytes = cleanHex.substr(idx + 8, 4);
        const valorDecimal = parseInt(hexBytes, 16);
        if (!isNaN(valorDecimal)) {
          const rpmFinal = Math.round(valorDecimal / 4);
          telemetry.rpm = Math.min(8000, Math.max(0, rpmFinal));
          telemetry.neutral = telemetry.speedKmH < 2 && telemetry.rpm > 0 && telemetry.gear === 'N';
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

    // 2. HARLEY VELOCIDADE (Alvo: 48291002xxxx)
    else if (cleanHex.includes('48291002')) {
      const idx = cleanHex.indexOf('48291002');
      if (cleanHex.length >= idx + 12) {
        const hexBytes = cleanHex.substr(idx + 8, 4);
        const valorDecimal = parseInt(hexBytes, 16);
        if (!isNaN(valorDecimal)) {
          const speedFinal = Math.round(valorDecimal / 128);
          telemetry.speedKmH = Math.min(260, Math.max(0, speedFinal));
          telemetry.speedMph = Math.round(telemetry.speedKmH * 0.621371);
          telemetry.gear = this.calculateGear(telemetry.rpm, telemetry.speedKmH, telemetry.neutral);
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

    // 3. HARLEY TEMPERATURA MOTOR (Alvo: a8491010xx)
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

    // 4. HARLEY CHECK ENGINE / MIL LAMP (Alvo: 68881083 = LIGADA, 68881003 = DESLIGADA)
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

    // 5. HARLEY DIAGNÓSTICO: CHASSI / VIN (Modo 09 PID 02 -> 49 02 ... ou com header 48 6B 10 49 02...)
    else if (cleanHex.includes('4902')) {
      const idx = cleanHex.indexOf('4902');
      let hexData = cleanHex.substring(idx + 4);
      // Strip line index if present (e.g. 01, 02, 03 in multi-line responses)
      if (hexData.length > 4 && (hexData.startsWith('01') || hexData.startsWith('02') || hexData.startsWith('03'))) {
        hexData = hexData.substring(2);
      }
      const asciiVin = hexToAscii(hexData).replace(/[^A-HJ-NPR-Z0-9]/gi, '').toUpperCase();
      if (asciiVin && asciiVin.length >= 7) {
        telemetry.vin = asciiVin.substring(0, 17);
        packetLog = {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: originalLine,
          decoded: `Chassi Identificado (VIN): ${telemetry.vin}`,
          tag: 'STATUS',
        };
      }
    }

    // 6. HARLEY DIAGNÓSTICO: ECU PART NUMBER (Modo 09 PID 04 -> 49 04 ... ou com header 48 6B 10 49 04...)
    else if (cleanHex.includes('4904')) {
      const idx = cleanHex.indexOf('4904');
      let hexData = cleanHex.substring(idx + 4);
      if (hexData.length > 4 && (hexData.startsWith('01') || hexData.startsWith('02'))) {
        hexData = hexData.substring(2);
      }
      const asciiEcu = hexToAscii(hexData).replace(/[^A-Z0-9-]/gi, '').toUpperCase();
      if (asciiEcu && asciiEcu.length >= 3) {
        telemetry.ecuPartNumber = asciiEcu;
        packetLog = {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: originalLine,
          decoded: `P/N da ECU: ${asciiEcu}`,
          tag: 'STATUS',
        };
      }
    }

    // 7. HARLEY DIAGNÓSTICO: CÓDIGOS DE FALHA MODO 03 (Resposta 43xxxx... ou 48 6B 10 43...)
    else if (cleanHex.includes('43') && (cleanHex.startsWith('43') || cleanHex.includes('1043') || cleanHex.includes('f143') || cleanHex.includes('6b43'))) {
      let dtcPayload = '';
      if (cleanHex.startsWith('43')) {
        dtcPayload = cleanHex.substring(2);
      } else {
        const idx = cleanHex.indexOf('43');
        if (idx >= 0) {
          dtcPayload = cleanHex.substring(idx + 2);
        }
      }

      if (dtcPayload && dtcPayload.length >= 4) {
        const parsedDtcs = parseMode03DTCs(dtcPayload);
        telemetry.activeDtcList = parsedDtcs;
        if (parsedDtcs.length > 0) {
          telemetry.checkEngine = true;
        }
        packetLog = {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: originalLine,
          decoded: `DTCs da ECM Harley: ${parsedDtcs.length > 0 ? parsedDtcs.join(', ') : 'Nenhuma falha ativa registrada (43 00 00) [OK]'}`,
          tag: 'DTC',
        };
      }
    }

    // 8. HARLEY VELOCÍMETRO (0x60): ODÔMETRO TOTAL (Broadcast 486010... ou Mode 22 PID 0201 / Mode 01 PID A6)
    else if (cleanHex.includes('620201') || cleanHex.includes('41a6') || cleanHex.includes('486010') || cleanHex.includes('a86010')) {
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

      if (odoKm > 0 && odoKm < 1000000) {
        telemetry.odometerKm = odoKm;
        packetLog = {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: originalLine,
          decoded: `Odômetro do Velocímetro (Nó 0x60): ${odoKm.toLocaleString()} KM`,
          tag: 'STATUS',
        };
      }
    }

    // 9. HARLEY ECM (0x10): HORÍMETRO & CICLOS DE IGNIÇÃO DA ECU (Mode 22 PID 010A ou 011F)
    else if (cleanHex.includes('62010a') || cleanHex.includes('411f') || cleanHex.includes('2810600a')) {
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
              decoded: `Auditoria ECM Delphi: ${hours}h ${minutes}min de motor | ${starts} partidas`,
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
          packetLog = {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            type: 'rx',
            raw: originalLine,
            decoded: `Tempo de Operação do Motor (011F): ${telemetry.engineHoursTotal}h ${telemetry.engineMinutesTotal}m`,
            tag: 'STATUS',
          };
        }
      }
    }
  }

    // 8. HARLEY INDICADORES & SWITCHES (288329xx / 483b10xx)
    else if (cleanHex.includes('483b10') || cleanHex.includes('288329')) {
      // Decode turn signals, neutral switch, high beam
      const isTurnLeft = cleanHex.includes('01') || cleanHex.includes('10');
      const isTurnRight = cleanHex.includes('02') || cleanHex.includes('20');
      const isNeutral = cleanHex.includes('40') || cleanHex.includes('04');
      if (isNeutral) {
        telemetry.neutral = true;
        telemetry.gear = 'N';
      }
      packetLog = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'rx',
        raw: originalLine,
        decoded: `Harley J1850 Estado Elétrico / Chaves`,
        tag: 'STATUS',
      };
    }

    // 9. STANDARD OBD2 PID FALLBACK (Quando a moto é consultada por PIDs padrão)
    // 410cxxxx: OBD2 Mode 01 PID 0C (RPM)
    else if (cleanHex.startsWith('410c') && cleanHex.length >= 8) {
      const a = parseInt(cleanHex.substring(4, 6), 16);
      const b = parseInt(cleanHex.substring(6, 8), 16);
      if (!isNaN(a) && !isNaN(b)) {
        telemetry.rpm = Math.round((a * 256 + b) / 4);
        packetLog = {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: originalLine,
          decoded: `OBD2 PID 0C RPM: ${telemetry.rpm} RPM`,
          tag: 'RPM',
        };
      }
    }
    // 410dxx: OBD2 Mode 01 PID 0D (Speed km/h)
    else if (cleanHex.startsWith('410d') && cleanHex.length >= 6) {
      const speed = parseInt(cleanHex.substring(4, 6), 16);
      if (!isNaN(speed)) {
        telemetry.speedKmH = speed;
        telemetry.speedMph = Math.round(speed * 0.621371);
        telemetry.gear = this.calculateGear(telemetry.rpm, telemetry.speedKmH, telemetry.neutral);
        packetLog = {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: originalLine,
          decoded: `OBD2 PID 0D Velocidade: ${speed} km/h`,
          tag: 'SPEED',
        };
      }
    }
    // 4105xx: OBD2 Mode 01 PID 05 (Engine Coolant/Head Temp)
    else if (cleanHex.startsWith('4105') && cleanHex.length >= 6) {
      const rawC = parseInt(cleanHex.substring(4, 6), 16) - 40;
      if (!isNaN(rawC)) {
        telemetry.engineTempC = rawC;
        telemetry.engineTempF = Math.round((rawC * 9) / 5 + 32);
        packetLog = {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: originalLine,
          decoded: `OBD2 PID 05 Temp: ${rawC}°C (${telemetry.engineTempF}°F)`,
          tag: 'TEMP',
        };
      }
    }
    // 4142xxxx: Control Module Voltage
    else if (cleanHex.startsWith('4142') && cleanHex.length >= 8) {
      const a = parseInt(cleanHex.substring(4, 6), 16);
      const b = parseInt(cleanHex.substring(6, 8), 16);
      if (!isNaN(a) && !isNaN(b)) {
        telemetry.batteryVoltage = (a * 256 + b) / 1000;
        packetLog = {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: originalLine,
          decoded: `OBD2 PID 42 Tensão: ${telemetry.batteryVoltage.toFixed(1)}V`,
          tag: 'STATUS',
        };
      }
    }
    // 4114xxyy: OBD2 Mode 01 PID 14 (O2 Sensor 1 Bank 1 - Front Cylinder)
    else if (cleanHex.startsWith('4114') && cleanHex.length >= 8) {
      const voltByte = parseInt(cleanHex.substring(4, 6), 16);
      const trimByte = parseInt(cleanHex.substring(6, 8), 16);
      if (!isNaN(voltByte)) {
        telemetry.frontO2Voltage = Number((voltByte / 200).toFixed(3));
        if (!isNaN(trimByte) && trimByte !== 0xFF) {
          telemetry.frontShortTermFuelTrim = Number((((trimByte - 128) * 100) / 128).toFixed(1));
        }
        // Calculate estimated AFR (Stoichiometric 14.7:1 baseline)
        telemetry.frontAFR = Number((14.7 - (telemetry.frontO2Voltage - 0.45) * 3).toFixed(2));
        packetLog = {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: originalLine,
          decoded: `Sonda O2 Dianteira: ${telemetry.frontO2Voltage}V | Trim: ${telemetry.frontShortTermFuelTrim || 0}% | AFR: ${telemetry.frontAFR}`,
          tag: 'O2',
        };
      }
    }
    // 4115xxyy: OBD2 Mode 01 PID 15 (O2 Sensor 2 Bank 1 / Sensor 1 Bank 2 - Rear Cylinder)
    else if (cleanHex.startsWith('4115') && cleanHex.length >= 8) {
      const voltByte = parseInt(cleanHex.substring(4, 6), 16);
      const trimByte = parseInt(cleanHex.substring(6, 8), 16);
      if (!isNaN(voltByte)) {
        telemetry.rearO2Voltage = Number((voltByte / 200).toFixed(3));
        if (!isNaN(trimByte) && trimByte !== 0xFF) {
          telemetry.rearShortTermFuelTrim = Number((((trimByte - 128) * 100) / 128).toFixed(1));
        }
        telemetry.rearAFR = Number((14.7 - (telemetry.rearO2Voltage - 0.45) * 3).toFixed(2));
        packetLog = {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: originalLine,
          decoded: `Sonda O2 Traseira: ${telemetry.rearO2Voltage}V | Trim: ${telemetry.rearShortTermFuelTrim || 0}% | AFR: ${telemetry.rearAFR}`,
          tag: 'O2',
        };
      }
    }
    // 4111xx: OBD2 Mode 01 PID 11 (Throttle Position TPS %)
    else if (cleanHex.startsWith('4111') && cleanHex.length >= 6) {
      const tpsVal = parseInt(cleanHex.substring(4, 6), 16);
      if (!isNaN(tpsVal)) {
        telemetry.throttlePosition = Math.round((tpsVal * 100) / 255);
        packetLog = {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: originalLine,
          decoded: `Abertura Borboleta (TPS): ${telemetry.throttlePosition}%`,
          tag: 'STATUS',
        };
      }
    }
    // 410bxx: OBD2 Mode 01 PID 0B (MAP - Manifold Absolute Pressure)
    else if (cleanHex.startsWith('410b') && cleanHex.length >= 6) {
      const mapVal = parseInt(cleanHex.substring(4, 6), 16);
      if (!isNaN(mapVal)) {
        telemetry.manifoldPressureKpa = mapVal;
        packetLog = {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          type: 'rx',
          raw: originalLine,
          decoded: `Sensor MAP (Pressão Coletor): ${mapVal} kPa`,
          tag: 'STATUS',
        };
      }
    }
    // 4103xxxx: OBD2 Mode 01 PID 03 (Fuel System Status)
    else if (cleanHex.startsWith('4103') && cleanHex.length >= 6) {
      const statusByte = parseInt(cleanHex.substring(4, 6), 16);
      if (statusByte === 2) {
        telemetry.fuelSystemStatus = 'Closed-Loop';
      } else if (statusByte === 8) {
        telemetry.fuelSystemStatus = 'Open-Loop (WOT)';
      } else if (statusByte === 1) {
        telemetry.fuelSystemStatus = 'Open-Loop (Cold)';
      } else {
        telemetry.fuelSystemStatus = 'Open-Loop';
      }
      packetLog = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'rx',
        raw: originalLine,
        decoded: `Status de Injeção: ${telemetry.fuelSystemStatus}`,
        tag: 'O2',
      };
    }
    // 70xxxx / 71xxxx: Positive response to Mode 30/31 Actuator Test
    else if (cleanHex.startsWith('70') || cleanHex.startsWith('71')) {
      packetLog = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'rx',
        raw: originalLine,
        decoded: `[ECU DELPHI] Teste de Atuador Aceito e em Execução`,
        tag: 'ACTUATOR',
      };
    } else {
      // General raw hex
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

  /**
   * Gear estimation based on Harley Davidson Big Twin / Sportster transmission ratios
   */
  private calculateGear(rpm: number, speedKmH: number, isNeutral: boolean): number | 'N' {
    if (isNeutral || speedKmH < 3 || rpm < 700) {
      return 'N';
    }

    const ratio = rpm / speedKmH;
    // Ratios (RPM per km/h) for typical Harley Davidson 5-speed & 6-speed gearboxes:
    // 1st: ~70 - 95
    // 2nd: ~48 - 65
    // 3rd: ~35 - 47
    // 4th: ~27 - 34
    // 5th: ~22 - 26
    // 6th: ~17 - 21
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
 * Converte bytes hexadecimais para string ASCII (letras do chassi VIN ou Part Number da ECU)
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
 * Converte a resposta do Modo OBD2 03 em códigos DTC (ex: 43 01 07 -> P0107)
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
