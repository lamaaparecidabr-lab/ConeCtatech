import React, { useEffect, useMemo, useState } from 'react';
import { Activity, RefreshCw, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { ActiveDpidSnapshot, TelemetryData } from '../types';

interface OxygenSensorsPanelProps {
  telemetry: TelemetryData;
  isConnected?: boolean;
  onRefresh?: () => Promise<void> | void;
}

type WavePoint = { front: number; rear: number };

const n = (snap: ActiveDpidSnapshot | undefined, key: string): number | undefined => {
  const value = snap?.values?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

const fmt = (value: number | undefined, digits = 1) => value === undefined ? '—' : value.toFixed(digits);

const SensorCard: React.FC<{
  title: string;
  side: 'front' | 'rear';
  mv?: number;
  integrator?: number;
  longTerm?: number;
  rawMv?: number;
}> = ({ title, side, mv, integrator, longTerm, rawMv }) => {
  const trim = integrator === undefined ? undefined : integrator - 100;
  const ltTrim = longTerm === undefined ? undefined : longTerm - 100;
  const richLean = mv === undefined ? '—' : mv >= 450 ? 'Rica / acima do ponto de comutação' : 'Pobre / abaixo do ponto de comutação';
  const accent = side === 'front' ? 'text-orange-400 border-orange-500/30 bg-orange-500/10' : 'text-sky-400 border-sky-500/30 bg-sky-500/10';
  const width = mv === undefined ? 0 : Math.max(0, Math.min(100, mv / 10));

  return (
    <div className="bg-neutral-900/90 rounded-2xl border border-neutral-800 p-5 shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <span className={`px-2.5 py-1 rounded-lg border text-xs font-black uppercase ${accent}`}>{title}</span>
        <span className="text-[10px] text-neutral-500 font-mono">DPID 0x1D</span>
      </div>

      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <span className="text-3xl font-black font-mono text-white">{fmt(mv, 0)}</span>
          <span className="ml-1 text-sm text-neutral-400">mV</span>
        </div>
        <span className="text-[10px] text-neutral-500 text-right max-w-[190px]">{richLean}</span>
      </div>

      <div className="mt-3">
        <div className="flex justify-between text-[9px] text-neutral-600 mb-1 font-mono"><span>0 mV</span><span>450 mV</span><span>1000+ mV</span></div>
        <div className="h-2.5 bg-neutral-950 border border-neutral-800 rounded-full overflow-hidden relative">
          <div className="absolute inset-y-0 left-[45%] w-px bg-neutral-500 z-10" />
          <div className="h-full bg-neutral-500 transition-all duration-150" style={{ width: `${width}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-5">
        <div className="rounded-xl border border-neutral-800 bg-black/20 p-3">
          <div className="text-[9px] uppercase tracking-wider text-neutral-600">Integrator</div>
          <div className="mt-1 text-lg font-mono font-bold text-neutral-100">{fmt(integrator, 2)}{integrator === undefined ? '' : '%'}</div>
          <div className="text-[9px] text-neutral-600">correção: {trim === undefined ? '—' : `${trim >= 0 ? '+' : ''}${trim.toFixed(2)}%`}</div>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-black/20 p-3">
          <div className="text-[9px] uppercase tracking-wider text-neutral-600">Long Term</div>
          <div className="mt-1 text-lg font-mono font-bold text-neutral-100">{fmt(longTerm, 2)}{longTerm === undefined ? '' : '%'}</div>
          <div className="text-[9px] text-neutral-600">desvio: {ltTrim === undefined ? '—' : `${ltTrim >= 0 ? '+' : ''}${ltTrim.toFixed(2)}%`}</div>
        </div>
      </div>

      <div className="mt-3 text-[9px] text-neutral-600 font-mono">O₂ raw hi-res (0x1A): {rawMv === undefined ? '—' : `${rawMv.toFixed(3)} mV`}</div>
    </div>
  );
};

export const OxygenSensorsPanel: React.FC<OxygenSensorsPanelProps> = ({ telemetry, isConnected = false, onRefresh }) => {
  const [history, setHistory] = useState<WavePoint[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const d1d = telemetry.activeDpidData?.['1D'];
  const d1a = telemetry.activeDpidData?.['1A'];
  const d11 = telemetry.activeDpidData?.['11'];
  const d12 = telemetry.activeDpidData?.['12'];

  const frontMv = n(d1d, 'O2 Front (mV)');
  const rearMv = n(d1d, 'O2 Rear (mV)');
  const intF = n(d1d, 'Integrator F (%)');
  const intR = n(d1d, 'Integrator R (%)');
  const ltF = n(d1d, 'Long Term F (%)');
  const ltR = n(d1d, 'Long Term R (%)');
  const rawF = n(d1a, 'O2 Raw Front (mV)');
  const rawR = n(d1a, 'O2 Raw Rear (mV)');

  const hasO2 = d1d?.status === 'ok' && frontMv !== undefined && rearMv !== undefined;
  const sourceState = d1d?.status === 'pending' ? 'LENDO ECM' : d1d?.status === 'negative' ? 'NÃO SUPORTADO' : d1d?.status === 'timeout' ? 'SEM RESPOSTA' : hasO2 ? 'DADOS ECM' : 'SEM LEITURA';

  useEffect(() => {
    if (frontMv === undefined || rearMv === undefined) return;
    setHistory(prev => [...prev, { front: frontMv, rear: rearMv }].slice(-60));
  }, [frontMv, rearMv, d1d?.updatedAt]);

  const chart = useMemo(() => {
    const make = (key: keyof WavePoint) => history.map((pt, i) => {
      const x = history.length <= 1 ? 0 : (i / (history.length - 1)) * 100;
      const y = 100 - Math.max(0, Math.min(100, pt[key] / 10));
      return `${i ? 'L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(' ');
    return { front: make('front'), rear: make('rear') };
  }, [history]);

  const refresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };

  return (
    <div className="space-y-5">
      <div className="bg-[#14151b] border border-neutral-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-600/15 text-emerald-400 rounded-xl border border-emerald-500/25"><Activity className="w-5 h-5" /></div>
              <div>
                <h2 className="text-lg font-black tracking-wide text-white uppercase">Sondas O₂ & Malha Fechada</h2>
                <p className="text-[11px] text-neutral-500">Leitura ativa Harley J1850 baseada nos DPIDs 0x1D e 0x1A mapeados no catálogo DataMaster/TTS.</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1.5 rounded-xl border text-[10px] font-bold ${hasO2 ? 'border-emerald-700 text-emerald-300 bg-emerald-950/40' : 'border-neutral-700 text-neutral-400 bg-neutral-900'}`}>{sourceState}</span>
            <button onClick={refresh} disabled={!isConnected || refreshing} className="px-3 py-1.5 rounded-xl border border-orange-700/60 text-orange-300 bg-orange-950/30 disabled:opacity-40 text-[10px] font-bold flex items-center gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> LER SONDAS
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <SensorCard title="Cilindro dianteiro" side="front" mv={frontMv} integrator={intF} longTerm={ltF} rawMv={rawF} />
        <SensorCard title="Cilindro traseiro" side="rear" mv={rearMv} integrator={intR} longTerm={ltR} rawMv={rawR} />
      </div>

      <div className="bg-[#14151b] border border-neutral-800 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-neutral-200">Oscilação das sondas</div>
            <div className="text-[10px] text-neutral-600">Histórico desta sessão · valores recebidos, sem AFR artificial.</div>
          </div>
          <div className="flex gap-3 text-[9px]"><span className="text-orange-400">● Dianteiro</span><span className="text-sky-400">● Traseiro</span></div>
        </div>
        <div className="h-40 rounded-xl bg-black/30 border border-neutral-800 p-3">
          {history.length < 2 ? <div className="h-full flex items-center justify-center text-xs text-neutral-600">Aguardando leituras O₂...</div> : (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
              <line x1="0" y1="55" x2="100" y2="55" stroke="currentColor" className="text-neutral-800" strokeWidth="0.5" />
              <path d={chart.front} fill="none" stroke="currentColor" className="text-orange-400" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
              <path d={chart.rear} fill="none" stroke="currentColor" className="text-sky-400" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
            </svg>
          )}
        </div>
      </div>

      <div className="bg-[#101116] border border-neutral-800 rounded-2xl overflow-hidden">
        <button onClick={() => setDetailsOpen(v => !v)} className="w-full p-4 flex items-center justify-between text-left">
          <span className="flex items-center gap-2"><Info className="w-4 h-4 text-neutral-500" /><span className="text-xs font-bold text-neutral-400">Dados técnicos / rastreabilidade</span></span>
          {detailsOpen ? <ChevronDown className="w-4 h-4 text-neutral-500" /> : <ChevronRight className="w-4 h-4 text-neutral-500" />}
        </button>
        {detailsOpen && <div className="border-t border-neutral-800 p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-[10px]">
          <div className="space-y-1 text-neutral-500"><div><b className="text-neutral-300">DPID 0x1D</b> — O₂ F/R, Integrator F/R, Long Term F/R</div><div>Conversões: O₂ raw×20 mV; Integrator/Long Term raw×0,78125%.</div><div>RAW: <span className="font-mono text-neutral-400">{d1d?.raw || '—'}</span></div></div>
          <div className="space-y-1 text-neutral-500"><div><b className="text-neutral-300">DPID 0x1A</b> — O₂ raw hi-res F/R + Knock F/R</div><div>O₂ hi-res: u16×0,0763126 mV.</div><div>RAW: <span className="font-mono text-neutral-400">{d1a?.raw || '—'}</span></div></div>
          <div className="md:col-span-2 text-neutral-600">RPM: {fmt(n(d11, 'RPM'), 0)} rpm · TPS: {fmt(n(d11, 'TPS (%)'), 1)}% · Temp. motor: {fmt(n(d12, 'Temp. motor (°C)'), 0)} °C. AFR numérico não é inferido da tensão narrowband.</div>
        </div>}
      </div>
    </div>
  );
};
