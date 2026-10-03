import { useCallback, useEffect, useRef, useState } from 'react';
import { ActiveDpidSnapshot, DatalogSample, TelemetryData } from '../types';

export interface SavedDatalogSession {
  id: string;
  name: string;
  savedAt: number;
  samples: DatalogSample[];
}

const BASE_KEY = 'conectaharley-datalog-base-v1';
const n = (s: ActiveDpidSnapshot | undefined, k: string) => {
  const v = s?.values?.[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
};

const loadBase = (): SavedDatalogSession | undefined => {
  try {
    const raw = localStorage.getItem(BASE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as SavedDatalogSession;
    return Array.isArray(parsed?.samples) ? parsed : undefined;
  } catch { return undefined; }
};

export function useDatalogSession(telemetry: TelemetryData) {
  const [recording, setRecording] = useState(false);
  const [samples, setSamples] = useState<DatalogSample[]>([]);
  const [base, setBase] = useState<SavedDatalogSession | undefined>(() => loadBase());
  const startedAt = useRef<number>();
  const lastDpid1DAt = useRef<number>();

  const startRecording = useCallback(() => {
    if (!startedAt.current) startedAt.current = Date.now();
    setRecording(true);
  }, []);
  const pauseRecording = useCallback(() => setRecording(false), []);
  const clearCurrent = useCallback(() => {
    setRecording(false);
    setSamples([]);
    startedAt.current = undefined;
    lastDpid1DAt.current = undefined;
  }, []);

  useEffect(() => {
    if (!recording) return;
    const d = telemetry.activeDpidData || {};
    const d11 = d['11'], d12 = d['12'], d1a = d['1A'], d1d = d['1D'];
    // Uma amostra de combustível só nasce quando 0x1D realmente recebeu leitura nova.
    // Evita contar o mesmo snapshot centenas de vezes por causa do refresh da UI.
    if (!d1d?.updatedAt || d1d.status !== 'ok' || d1d.updatedAt === lastDpid1DAt.current) return;
    lastDpid1DAt.current = d1d.updatedAt;
    const now = Date.now();
    if (!startedAt.current) startedAt.current = now;
    const sample: DatalogSample = {
      timestamp: now,
      timeFormatted: new Date(now).toLocaleTimeString(),
      elapsedSec: (now - startedAt.current) / 1000,
      rpm: telemetry.rpm,
      speedKmH: telemetry.speedKmH,
      engineTempC: telemetry.engineTempC,
      batteryVoltage: telemetry.batteryVoltage,
      throttlePosition: telemetry.throttlePosition,
      mapKpa: telemetry.manifoldPressureKpa,
      fuelSystemStatus: telemetry.fuelSystemStatus,
      frontO2Mv: n(d1d, 'O2 Front (mV)'), rearO2Mv: n(d1d, 'O2 Rear (mV)'),
      frontO2RawMv: n(d1a, 'O2 Raw Front (mV)'), rearO2RawMv: n(d1a, 'O2 Raw Rear (mV)'),
      integratorFrontPct: n(d1d, 'Integrator F (%)'), integratorRearPct: n(d1d, 'Integrator R (%)'),
      longTermFrontPct: n(d1d, 'Long Term F (%)'), longTermRearPct: n(d1d, 'Long Term R (%)'),
      knockFrontDeg: n(d1a, 'Knock Front (°)'), knockRearDeg: n(d1a, 'Knock Rear (°)'),
      gear: String(telemetry.gear),
      sourceDpid11At: d11?.updatedAt, sourceDpid12At: d12?.updatedAt,
      sourceDpid1AAt: d1a?.updatedAt, sourceDpid1DAt: d1d.updatedAt,
    };
    setSamples(prev => [...prev.slice(-19999), sample]);
  }, [recording, telemetry]);

  const saveAsBase = useCallback((name?: string) => {
    if (!samples.length) return;
    const saved: SavedDatalogSession = {
      id: `base-${Date.now()}`,
      name: name?.trim() || `BASE ${new Date().toLocaleString()}`,
      savedAt: Date.now(),
      samples: [...samples],
    };
    setBase(saved);
    try { localStorage.setItem(BASE_KEY, JSON.stringify(saved)); } catch { /* UI ainda mantém a base nesta sessão */ }
  }, [samples]);

  const clearBase = useCallback(() => {
    setBase(undefined);
    try { localStorage.removeItem(BASE_KEY); } catch { /* noop */ }
  }, []);

  return { recording, samples, base, startRecording, pauseRecording, clearCurrent, saveAsBase, clearBase };
}
