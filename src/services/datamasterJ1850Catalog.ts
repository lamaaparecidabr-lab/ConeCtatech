// Generated from the user-provided TTS/DataMaster HD datastream configuration.
// Do not hand-edit formulas here; regenerate from the source catalog when updating TTS data.
import catalogJson from '../data/datamaster-j1850-catalog.json';

export type DataMasterValidation = 'TTS_MAPPED' | 'TTS_REAL_VALIDATED' | 'DETECTED_UNMAPPED' | 'UNSUPPORTED' | 'UNKNOWN';

export interface DataMasterPidDefinition {
  dpid: string; pid: string; order: number; name: string; size: number; endian: number;
  metricGain: number | null; metricOffset: number | null; metricUnits: string | null;
  englishGain: number | null; englishOffset: number | null; englishUnits: string | null;
  comments: string;
}
export interface DataMasterJ1850Stream {
  number: number; name: string; protocol: string; factoryOnly: boolean; dpids: string[];
}

const catalog = catalogJson as {
  source: string;
  counts: Record<string, number>;
  j1850Streams: DataMasterJ1850Stream[];
  dpidPids: DataMasterPidDefinition[];
};

export const DATAMASTER_J1850_SOURCE = catalog.source;
export const DATAMASTER_CATALOG_COUNTS = catalog.counts;
export const DATAMASTER_J1850_STREAMS = catalog.j1850Streams;
export const DATAMASTER_J1850_PIDS = catalog.dpidPids;

export function getDataMasterDpidDefinition(dpid: string): DataMasterPidDefinition[] {
  const id = dpid.replace(/^0x/i, '').toUpperCase().padStart(2, '0');
  return DATAMASTER_J1850_PIDS.filter(p => p.dpid === id).sort((a,b) => a.order-b.order);
}

export function getDataMasterStreamsForDpid(dpid: string): DataMasterJ1850Stream[] {
  const id = dpid.replace(/^0x/i, '').toUpperCase().padStart(2, '0');
  return DATAMASTER_J1850_STREAMS.filter(s => s.dpids.includes(id));
}

export function getDataMasterDpidPayloadSize(dpid: string): number {
  return getDataMasterDpidDefinition(dpid).reduce((sum,p)=>sum+p.size,0);
}

export interface DataMasterOsMapping { osLevel: number; osTypeId: number; }
export interface DataMasterDatastreamRemap { dsNumber: number; osTypeId: number; dsNumberAssign: number; }

export function getDataMasterOsTypeIds(osLevel?: number): number[] {
  if (osLevel === undefined) return [];
  const c = catalog as typeof catalog & { osMappings?: DataMasterOsMapping[] };
  return (c.osMappings || []).filter(x=>x.osLevel===osLevel).map(x=>x.osTypeId);
}
