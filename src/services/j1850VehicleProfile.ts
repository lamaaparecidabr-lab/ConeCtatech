import { ActiveDpidSnapshot, TelemetryData } from '../types';
import { identifyHarleyVehicle } from './harleyVehicleIdentifier';
import { J1850_REFERENCE_STREAMS, getReferenceOsTypeIds } from './j1850ReferenceCatalog';

export interface J1850CapabilityProfile {
  applicable: boolean;
  vinIdentified: boolean;
  vehicle: ReturnType<typeof identifyHarleyVehicle>;
  ecm: { partNumber?: string; calibrationId?: string; softwareLevel?: number; osTypeIds: number[] };
  supportedDpids: string[];
  unsupportedDpids: string[];
  unknownDpids: string[];
  supportedStreams: string[];
  candidateStreams: string[];
  source: 'VIN+ECM+catálogo técnico de referência';
}

/**
 * Resolves context before interpretation without pretending VIN selects a J1850 formula.
 * In the supplied referência técnica catalog, legacy J1850 DPID maps use OsTypeID 0; OS-specific
 * DataStream remaps are used by CAN variants. Therefore VIN/ECM identify and guard
 * the vehicle, while the actual positive/negative ECM responses establish J1850 capability.
 */
export function resolveJ1850CapabilityProfile(telemetry: TelemetryData): J1850CapabilityProfile {
  const vehicle = telemetry.vin ? identifyHarleyVehicle(telemetry.vin) : null;
  const active = telemetry.activeDpidData || {};
  const ids = Array.from(new Set(J1850_REFERENCE_STREAMS.flatMap(s=>s.dpids))).filter(id=>parseInt(id,16)>=0x11);
  const supportedDpids = ids.filter(id=>active[id]?.status==='ok');
  const unsupportedDpids = ids.filter(id=>active[id]?.status==='negative' || active[id]?.status==='unavailable');
  const unknownDpids = ids.filter(id=>!active[id] || active[id].status==='pending' || active[id].status==='timeout');
  const supportedStreams = J1850_REFERENCE_STREAMS
    .filter(s=>!s.factoryOnly && s.dpids.length>0 && s.dpids.every(id=>active[id]?.status==='ok'))
    .map(s=>s.name);
  const candidateStreams = J1850_REFERENCE_STREAMS.filter(s=>!s.factoryOnly).map(s=>s.name);
  return {
    applicable: telemetry.vehicleProtocol === 'J1850 VPW',
    vinIdentified: Boolean(vehicle?.confirmed), vehicle,
    ecm: { partNumber: telemetry.ecuPartNumber, calibrationId: telemetry.ecuCalId, softwareLevel: telemetry.ecuSoftwareLevel, osTypeIds: getReferenceOsTypeIds(telemetry.ecuSoftwareLevel) },
    supportedDpids, unsupportedDpids, unknownDpids, supportedStreams, candidateStreams,
    source:'VIN+ECM+catálogo técnico de referência',
  };
}
