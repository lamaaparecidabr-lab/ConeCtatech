import { getReferenceDpidDefinition, getReferenceStreamsForDpid, ReferenceValidation } from './j1850ReferenceCatalog';

export interface DecodedReferenceDpid {
  dpid: string;
  values: Record<string, string | number>;
  raw: string;
  validation: ReferenceValidation;
  source: 'catálogo técnico de referência';
  streams: string[];
  note: string;
}

function readUnsigned(bytes: number[], offset: number, size: number, endian: number): number | null {
  if (size <= 0 || offset < 0 || offset + size > bytes.length) return null;
  let value = 0;
  if (endian === 1) for (let i=0;i<size;i++) value = value * 256 + bytes[offset+i];
  else for (let i=size-1;i>=0;i--) value = value * 256 + bytes[offset+i];
  return value;
}

function cleanNumber(n: number): number { return Number(n.toFixed(6)); }

/** Generic active J1850 decoder driven by catálogo técnico de referência definitions. */
export function decodeReferenceJ1850Dpid(dpid: string, bytes: number[]): DecodedReferenceDpid | null {
  const id = dpid.replace(/^0x/i,'').toUpperCase().padStart(2,'0');
  const defs = getReferenceDpidDefinition(id);
  if (!defs.length) return null;
  const values: Record<string, string | number> = {};
  let offset = 0;
  for (const def of defs) {
    const raw = readUnsigned(bytes, offset, def.size, def.endian);
    offset += def.size;
    if (raw === null) continue;
    if (def.metricGain === null || def.metricOffset === null) {
      values[def.name] = `0x${raw.toString(16).toUpperCase().padStart(def.size*2,'0')}`;
    } else {
      values[def.name] = cleanNumber(raw * def.metricGain + def.metricOffset);
    }
  }
  const streams = getReferenceStreamsForDpid(id).map(s=>s.name);
  return {
    dpid:id, values,
    raw:bytes.map(v=>v.toString(16).padStart(2,'0')).join(' ').toUpperCase(),
    validation:'REFERENCE_MAPPED', source:'catálogo técnico de referência', streams,
    note: streams.length
      ? `Mapeamento catálogo técnico de referência (${streams.join(', ')}). Disponibilidade confirmada pela resposta positiva da ECM.`
      : 'DPID definido no catálogo técnico de referência, sem associação a DataStream J1850 público no catálogo.'
  };
}
