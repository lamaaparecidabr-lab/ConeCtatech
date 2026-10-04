// Generated from the user-provided catálogo técnico de referência HD datastream configuration.
// Do not hand-edit formulas here; regenerate from the source catalog when updating reference data.
import catalogJson from '../data/j1850-reference-catalog.json';

export type ReferenceValidation = 'REFERENCE_MAPPED' | 'REAL_VALIDATED' | 'DETECTED_UNMAPPED' | 'UNSUPPORTED' | 'UNKNOWN';

export interface J1850PidDefinition {
  dpid: string; pid: string; order: number; name: string; size: number; endian: number;
  metricGain: number | null; metricOffset: number | null; metricUnits: string | null;
  englishGain: number | null; englishOffset: number | null; englishUnits: string | null;
  comments: string;
}
export interface J1850ReferenceStream {
  number: number; name: string; protocol: string; factoryOnly: boolean; dpids: string[];
}

const catalog = catalogJson as {
  source: string;
  counts: Record<string, number>;
  j1850Streams: J1850ReferenceStream[];
  dpidPids: J1850PidDefinition[];
};

export const J1850_REFERENCE_SOURCE = catalog.source;
export const J1850_REFERENCE_COUNTS = catalog.counts;
export const J1850_REFERENCE_STREAMS = catalog.j1850Streams;
export const J1850_REFERENCE_PIDS = catalog.dpidPids;

export function getReferenceDpidDefinition(dpid: string): J1850PidDefinition[] {
  const id = dpid.replace(/^0x/i, '').toUpperCase().padStart(2, '0');
  return J1850_REFERENCE_PIDS.filter(p => p.dpid === id).sort((a,b) => a.order-b.order);
}

export function getReferenceStreamsForDpid(dpid: string): J1850ReferenceStream[] {
  const id = dpid.replace(/^0x/i, '').toUpperCase().padStart(2, '0');
  return J1850_REFERENCE_STREAMS.filter(s => s.dpids.includes(id));
}

export function getReferenceDpidPayloadSize(dpid: string): number {
  return getReferenceDpidDefinition(dpid).reduce((sum,p)=>sum+p.size,0);
}

export interface J1850OsMapping { osLevel: number; osTypeId: number; }
export interface J1850DatastreamRemap { dsNumber: number; osTypeId: number; dsNumberAssign: number; }

export function getReferenceOsTypeIds(osLevel?: number): number[] {
  if (osLevel === undefined) return [];
  const c = catalog as typeof catalog & { osMappings?: J1850OsMapping[] };
  return (c.osMappings || []).filter(x=>x.osLevel===osLevel).map(x=>x.osTypeId);
}
