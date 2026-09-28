export interface TelemetryData {
  rpm: number;
  speedKmH: number;
  speedMph: number;
  engineTempF: number;
  engineTempC: number;
  batteryVoltage: number;
  gear: number | 'N'; // 1 to 6 or N
  turnLeft: boolean;
  turnRight: boolean;
  neutral: boolean;
  checkEngine: boolean;
  oilWarning: boolean;
  highBeam: boolean;
  clutchEngaged: boolean;
  fuelLevelPercent?: number;
  odometerKm?: number;
  engineHoursTotal?: number;
  engineMinutesTotal?: number;
  engineIgnitionCycles?: number;
  vin?: string;
  ecuPartNumber?: string;
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
  throttlePosition: number;
  mapKpa: number;
  frontO2Voltage: number;
  rearO2Voltage: number;
  frontSTFT: number;
  rearSTFT: number;
  fuelSystemStatus: string;
  gear: string;
}
