import React, { useMemo, useState } from 'react';
import { Activity, Cpu, Gauge, Thermometer, Zap, Fuel, Radio, ChevronDown, ChevronRight } from 'lucide-react';
import { ActiveDpidSnapshot } from '../types';

interface Props {
  data?: Record<string, ActiveDpidSnapshot>;
  isConnected: boolean;
}

type ParameterDefinition = {
  key: string;
  label: string;
  unit?: string;
  decimals?: number;
};

type GroupDefinition = {
  group: string;
  icon: React.ComponentType<{ className?: string }>;
  dpids: string[];
  parameters: ParameterDefinition[];
};

const groups: GroupDefinition[] = [
  {
    group: 'MOTOR',
    icon: Cpu,
    dpids: ['11', '12', '19', '1B'],
    parameters: [
      { key: 'RPM', label: 'RPM ECM', unit: 'rpm', decimals: 0 },
      { key: 'Desired Idle', label: 'Marcha lenta desejada', unit: 'rpm', decimals: 0 },
      { key: 'Temp. motor (°C)', label: 'Temperatura do motor', unit: '°C', decimals: 0 },
      { key: 'Head Temp (°C)', label: 'Temperatura do cabeçote', unit: '°C', decimals: 0 },
      { key: 'Barometer (kPa)', label: 'Pressão barométrica', unit: 'kPa', decimals: 1 },
    ],
  },
  {
    group: 'IGNIÇÃO',
    icon: Zap,
    dpids: ['13', '17', '1A'],
    parameters: [
      { key: 'Spark Front (°)', label: 'Avanço dianteiro (rápido)', unit: '°', decimals: 2 },
      { key: 'Spark Rear (°)', label: 'Avanço traseiro (rápido)', unit: '°', decimals: 2 },
      { key: 'Spark F hi-res (°)', label: 'Avanço dianteiro', unit: '°', decimals: 2 },
      { key: 'Spark R hi-res (°)', label: 'Avanço traseiro', unit: '°', decimals: 2 },
      { key: 'Knock Front (°)', label: 'Knock dianteiro', unit: '°', decimals: 2 },
      { key: 'Knock Rear (°)', label: 'Knock traseiro', unit: '°', decimals: 2 },
      { key: 'Knock Fast F (°)', label: 'Knock rápido dianteiro', unit: '°', decimals: 2 },
      { key: 'Knock Fast R (°)', label: 'Knock rápido traseiro', unit: '°', decimals: 2 },
    ],
  },
  {
    group: 'COMBUSTÍVEL',
    icon: Fuel,
    dpids: ['16', '18'],
    parameters: [
      { key: 'Injector BPW F (ms)', label: 'Pulso injetor dianteiro', unit: 'ms', decimals: 3 },
      { key: 'Injector BPW R (ms)', label: 'Pulso injetor traseiro', unit: 'ms', decimals: 3 },
      { key: 'Accel Enrich (ms)', label: 'Enriquecimento aceleração', unit: 'ms', decimals: 3 },
      { key: 'Decel Enlean (ms)', label: 'Empobrecimento desaceleração', unit: 'ms', decimals: 3 },
      { key: 'VE Front', label: 'VE dianteiro', decimals: 0 },
      { key: 'VE Rear', label: 'VE traseiro', decimals: 0 },
      { key: 'VE New Front', label: 'VE novo dianteiro', decimals: 0 },
      { key: 'VE New Rear', label: 'VE novo traseiro', decimals: 0 },
      { key: 'IAC', label: 'IAC', decimals: 0 },
    ],
  },
  {
    group: 'ADMISSÃO / SENSORES',
    icon: Gauge,
    dpids: ['11', '12', '19'],
    parameters: [
      { key: 'MAP (kPa)', label: 'MAP', unit: 'kPa', decimals: 1 },
      { key: 'TPS (%)', label: 'TPS', unit: '%', decimals: 1 },
      { key: 'IAT (°C)', label: 'IAT', unit: '°C', decimals: 0 },
      { key: 'Air Temp (°C)', label: 'Temperatura do ar', unit: '°C', decimals: 0 },
      { key: 'Charge Temp (°C)', label: 'Temperatura da carga', unit: '°C', decimals: 0 },
      { key: 'TPS sensor (V)', label: 'TPS Sensor', unit: 'V', decimals: 3 },
      { key: 'TPS (V)', label: 'TPS Sensor', unit: 'V', decimals: 3 },
      { key: 'MAP sensor (V)', label: 'MAP Sensor', unit: 'V', decimals: 3 },
      { key: 'ET sensor (V)', label: 'ET Sensor', unit: 'V', decimals: 3 },
      { key: 'IAT sensor (V)', label: 'IAT Sensor', unit: 'V', decimals: 3 },
    ],
  },
  {
    group: 'ELÉTRICO',
    icon: Activity,
    dpids: ['11', '13'],
    parameters: [
      { key: 'Bateria (V)', label: 'Bateria', unit: 'V', decimals: 1 },
      { key: 'Engine Flag', label: 'Engine Flag' },
    ],
  },
];

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

const findParameter = (
  data: Record<string, ActiveDpidSnapshot>,
  dpids: string[],
  def: ParameterDefinition,
) => {
  for (const dpid of dpids) {
    const snap = data[dpid];
    if (!snap || snap.status !== 'ok') continue;
    for (const [key, value] of Object.entries(snap.values || {})) {
      if (normalize(key) === normalize(def.key)) return { snap, dpid, value };
    }
  }
  return null;
};

const formatValue = (value: unknown, def: ParameterDefinition) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number' && Number.isFinite(value)) {
    const n = def.decimals === undefined ? String(value) : value.toFixed(def.decimals);
    return def.unit ? `${n} ${def.unit}` : n;
  }
  return def.unit ? `${String(value)} ${def.unit}` : String(value);
};

const statusLabel = (status?: ActiveDpidSnapshot['status']) => {
  if (status === 'ok') return 'ECM';
  if (status === 'negative') return 'NÃO DISP.';
  if (status === 'timeout') return 'TIMEOUT';
  if (status === 'pending') return 'LENDO';
  return '—';
};

const TechnicalDetails: React.FC<{ snap: ActiveDpidSnapshot; dpid: string }> = ({ snap, dpid }) => (
  <div className="mt-2 rounded-lg border border-neutral-800 bg-black/20 px-3 py-2 text-[10px]">
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      <span className="text-neutral-600">Fonte</span><span className="text-neutral-400">ECM · consulta ativa</span>
      <span className="text-neutral-600">DPID</span><span className="font-mono text-neutral-300">0x{dpid}</span>
      <span className="text-neutral-600">Serviço</span><span className="font-mono text-neutral-300">0x2A</span>
      <span className="text-neutral-600">Status</span><span className="text-neutral-300">{statusLabel(snap.status)}</span>
      <span className="text-neutral-600">RAW</span><span className="font-mono text-neutral-300 break-all">{snap.raw || '—'}</span>
      <span className="text-neutral-600">Atualização</span><span className="text-neutral-300">{snap.updatedAt ? new Date(snap.updatedAt).toLocaleTimeString() : '—'}</span>
    </div>
    {snap.note && <div className="mt-2 border-t border-neutral-800 pt-2 text-neutral-600">{snap.note}</div>}
  </div>
);

export const DpidScannerPanel: React.FC<Props> = ({ data = {}, isConnected }) => {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [technicalOpen, setTechnicalOpen] = useState(false);

  const technicalOnly = useMemo(
    () => ['14', '15', '1C', '1E', '1F', '20', '21'].filter(id => data[id]),
    [data],
  );

  return (
    <section id="sec-dpids" className="bg-[#14151b] border border-neutral-800 rounded-2xl p-5 shadow-xl space-y-5">
      <div className="border-b border-neutral-800 pb-3">
        <div className="text-sm font-black uppercase tracking-wider text-neutral-100 flex items-center gap-2">
          <Activity className="w-4 h-4 text-orange-400" />
          Diagnóstico do motor
        </div>
        <p className="text-[11px] text-neutral-500 mt-1">
          Parâmetros da ECM organizados por sistema. Toque em um valor para ver DPID, RAW e origem da leitura.
        </p>
      </div>

      {!isConnected && (
        <div className="text-sm text-neutral-500 text-center py-4">
          Conecte a moto ou inicie o simulador para executar a leitura.
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {groups.map(({ group, icon: Icon, dpids, parameters }) => (
          <div key={group} className="rounded-xl border border-neutral-800 bg-[#0f1015] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Icon className="w-4 h-4 text-orange-400" />
              <strong className="text-xs tracking-wider text-neutral-300">{group}</strong>
            </div>

            <div className="divide-y divide-neutral-800/80">
              {parameters.map(def => {
                const found = findParameter(data, dpids, def);
                const rowKey = `${group}:${def.key}:${found?.dpid || 'none'}`;
                const isOpen = openKey === rowKey;

                return (
                  <div key={def.key} className="py-2">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between gap-3 text-left"
                      onClick={() => found && setOpenKey(isOpen ? null : rowKey)}
                      disabled={!found}
                    >
                      <span className={`text-[11px] ${found ? 'text-neutral-400' : 'text-neutral-600'}`}>{def.label}</span>
                      <span className="flex items-center gap-2">
                        <strong className={`text-[12px] font-mono ${found ? 'text-neutral-100' : 'text-neutral-600'}`}>
                          {found ? formatValue(found.value, def) : '—'}
                        </strong>
                        {found ? (isOpen ? <ChevronDown className="w-3 h-3 text-neutral-500" /> : <ChevronRight className="w-3 h-3 text-neutral-600" />) : null}
                      </span>
                    </button>
                    {found && isOpen && <TechnicalDetails snap={found.snap} dpid={found.dpid} />}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {technicalOnly.length > 0 && (
        <div className="rounded-xl border border-neutral-800 bg-[#0f1015]">
          <button
            type="button"
            onClick={() => setTechnicalOpen(v => !v)}
            className="w-full flex items-center justify-between p-4 text-left"
          >
            <span className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-neutral-500" />
              <span>
                <strong className="block text-xs text-neutral-400">Dados técnicos / compatibilidade</strong>
                <span className="text-[10px] text-neutral-600">RAW sem fórmula validada ou resposta negativa</span>
              </span>
            </span>
            {technicalOpen ? <ChevronDown className="w-4 h-4 text-neutral-500" /> : <ChevronRight className="w-4 h-4 text-neutral-500" />}
          </button>

          {technicalOpen && (
            <div className="border-t border-neutral-800 p-3 grid grid-cols-1 lg:grid-cols-2 gap-2">
              {technicalOnly.map(id => {
                const snap = data[id];
                return (
                  <div key={id} className="rounded-lg border border-neutral-800 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] text-neutral-400">DPID 0x{id}</span>
                      <span className={`text-[9px] font-bold ${snap.status === 'negative' ? 'text-amber-400' : 'text-neutral-500'}`}>
                        {statusLabel(snap.status)}
                      </span>
                    </div>
                    <div className="mt-2 font-mono text-[9px] text-neutral-600 break-all">RAW {snap.raw || '—'}</div>
                    {snap.note && <div className="mt-1 text-[9px] text-neutral-600">{snap.note}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
