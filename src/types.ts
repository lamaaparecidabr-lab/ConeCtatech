
export interface ActiveDpidSnapshot {
  dpid: string;
  status: 'ok' | 'negative' | 'timeout' | 'pending' | 'unavailable';
  raw?: string;
  updatedAt?: number;
  values?: Record<string, string | number>;
  note?: string;
}

export interface TelemetryData {
  rpm: number;
  speedKmH: number;
  speedMph: number;
  engineTempF: number;
  engineTempC: number;
  batteryVoltage: number;
  elmSupplyVoltage?: number;
  gear: number | 'N'; // 1 to 6 or N
  turnLeft: boolean;
  turnRight: boolean;
  neutral: boolean;
  checkEngine: boolean;
  oilWarning: boolean;
  highBeam: boolean;
  clutchEngaged: boolean;
  fuelLevelPercent?: number;
  fuelLevelRaw?: number;   // escala J1850 Harley 0–15
  fuelLow?: boolean;
  odometerKm?: number;
  engineHoursTotal?: number;
  engineMinutesTotal?: number;
  engineIgnitionCycles?: number;
  vin?: string;
  vehicleProtocol?: 'J1850 VPW' | 'CAN';
  ecuPartNumber?: string;
  ecuCalId?: string;
  ecuSoftwareLevel?: number;
  activeDtcList?: string[];
  historicDtcList?: string[];
  // O2 & Fuel Trim Data
  frontO2Voltage?: number; // 0.00V - 1.00V
  rearO2Voltage?: number;  // 0.00V - 1.00V
  frontShortTermFuelTrim?: number; // -25% to +25%
  rearShortTermFuelTrim?: number;  // -25% to +25%
  frontAFR?: number; // Air-Fuel Ratio (e.g. 14.6)
  rearAFR?: number;  // Air-Fuel Ratio
  fuelSystemStatus?: 'Closed-Loop' | 'Open-Loop' | 'Open-Loop (WOT)' | 'Open-Loop (Cold)';
  throttlePosition?: number; // 0% - 100%
  manifoldPressureKpa?: number; // MAP in kPa (e.g. 35 - 100)
  activeDpidData?: Record<string, ActiveDpidSnapshot>;
  lastUpdated: number;
}

export type ConnectionType = 'bluetooth' | 'serial' | 'simulator' | 'disconnected';

export interface PacketLog {
  id: string;
  timestamp: string;
  type: 'rx' | 'tx' | 'info' | 'error';
  raw: string;
  decoded?: string;
  tag?: 'RPM' | 'SPEED' | 'TEMP' | 'STATUS' | 'AT' | 'DTC' | 'O2' | 'ACTUATOR' | 'OTHER';
}

export interface DTCFault {
  code: string;
  description: string;
  category: 'ECU' | 'BCM' | 'SPEEDO' | 'ABS' | 'RADIO';
  severity: 'low' | 'medium' | 'high';
}

export interface ConnectionConfig {
  protocol: 'ATSP2' | 'ATSP1' | 'ATSP0'; // ATSP2 = J1850 VPW (standard Harley)
  speedUnit: 'kmh' | 'mph';
  tempUnit: 'celsius' | 'fahrenheit';
  monitorMode: boolean; // ATMA
  soundEnabled: boolean;
  baudRate?: number; // 38400 (default) or 9600, 115200
}

export interface ActuatorTestItem {
  id: string;
  name: string;
  target: 'ECU' | 'SPEEDO' | 'TSSM/BCM';
  description: string;
  commandHex: string;
  durationMs: number;
  requiresEngineOff: boolean;
  status: 'idle' | 'running' | 'success' | 'failed';
}

export interface DatalogSample {
  timestamp: number;
  timeFormatted: string;
  elapsedSec: number;
  rpm: number;
  speedKmH: number;
  engineTempC: number;
  batteryVoltage: number;
  throttlePosition?: number;
  mapKpa?: number;
  frontO2Mv?: number;
  rearO2Mv?: number;
  frontO2RawMv?: number;
  rearO2RawMv?: number;
  integratorFrontPct?: number;
  integratorRearPct?: number;
  longTermFrontPct?: number;
  longTermRearPct?: number;
  knockFrontDeg?: number;
  knockRearDeg?: number;
  gear?: string;
  sourceDpid11At?: number;
  sourceDpid12At?: number;
  sourceDpid1AAt?: number;
  sourceDpid1DAt?: number;
}
