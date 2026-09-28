import React, { useEffect, useState } from 'react';
import {
  Activity,
  Flame,
  CheckCircle2,
  AlertCircle,
  Gauge,
  Sliders,
  Sparkles,
  Info,
} from 'lucide-react';
import { TelemetryData } from '../types';

interface OxygenSensorsPanelProps {
  telemetry: TelemetryData;
}

interface WaveformPoint {
  time: number;
  frontO2: number;
  rearO2: number;
}

export const OxygenSensorsPanel: React.FC<OxygenSensorsPanelProps> = ({ telemetry }) => {
  const [history, setHistory] = useState<WaveformPoint[]>([]);

  const frontV = telemetry.frontO2Voltage ?? 0.45;
  const rearV = telemetry.rearO2Voltage ?? 0.45;
  const frontMv = Math.round(frontV * 1000);
  const rearMv = Math.round(rearV * 1000);

  const frontTrim = telemetry.frontShortTermFuelTrim ?? 0;
  const rearTrim = telemetry.rearShortTermFuelTrim ?? 0;

  const frontAfr = telemetry.frontAFR ?? 14.7;
  const rearAfr = telemetry.rearAFR ?? 14.7;

  const fuelStatus = telemetry.fuelSystemStatus ?? 'Closed-Loop';
  const tps = telemetry.throttlePosition ?? 0;
  const mapKpa = telemetry.manifoldPressureKpa ?? 40;

  // Track history for live oscilloscope
  useEffect(() => {
    setHistory((prev) => {
      const next = [...prev, { time: Date.now(), frontO2: frontV, rearO2: rearV }];
      if (next.length > 50) return next.slice(-50);
      return next;
    });
  }, [frontV, rearV, telemetry.lastUpdated]);

  // Generate SVG path for waveform
  const generatePath = (key: 'frontO2' | 'rearO2', height: number, width: number) => {
    if (history.length < 2) return '';
    const step = width / Math.max(1, history.length - 1);
    return history
      .map((pt, i) => {
        const x = i * step;
        // O2 is 0.0V to 1.0V -> invert Y (1.0V at top, 0.0V at bottom)
        const y = height - pt[key] * height;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-neutral-900 via-neutral-900 to-neutral-950 p-5 rounded-2xl border border-neutral-800 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-600/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                <Activity className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-black tracking-wide text-white uppercase">
                Sondas Lambda & Malha Fechada (Closed-Loop / AFR)
              </h2>
            </div>
            <p className="mt-1 text-xs text-neutral-400 max-w-2xl">
              Análise em tempo real das tensões dos sensores de O₂ dos cilindros dianteiro e traseiro, correção instantânea de combustível (Fuel Trim STFT) e relação ar-combustível.
            </p>
          </div>

          {/* Loop Status Pill */}
          <div className="flex items-center gap-2">
            <span
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold border ${
                fuelStatus === 'Closed-Loop'
                  ? 'bg-emerald-950/60 border-emerald-700/70 text-emerald-300'
                  : fuelStatus.includes('WOT')
                  ? 'bg-amber-950/60 border-amber-700/70 text-amber-300'
                  : 'bg-blue-950/60 border-blue-700/70 text-blue-300'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-current animate-pulse" />
              <span>Status: {fuelStatus}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Main Dual Cylinders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Front Cylinder O2 Card */}
        <div className="bg-neutral-900/90 rounded-2xl border border-neutral-800 p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-600/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-1 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs font-black uppercase">
                Cilindro Dianteiro (Front)
              </span>
              <span className="text-[11px] text-neutral-500 font-mono">Bank 1 Sensor 1</span>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-neutral-400">AFR Estimado: </span>
              <span className="text-sm font-black font-mono text-orange-400">{frontAfr}:1</span>
            </div>
          </div>

          {/* Tension Readout */}
          <div className="mt-4 flex items-baseline justify-between">
            <div>
              <span className="text-3xl font-black font-mono tracking-tight text-white">{frontMv}</span>
              <span className="ml-1 text-sm font-semibold text-neutral-400">mV</span>
              <span className="ml-2 text-xs font-mono text-neutral-500">({frontV.toFixed(3)} V)</span>
            </div>
            <div className="text-right">
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded ${
                  frontMv > 500
                    ? 'bg-amber-950/70 text-amber-400 border border-amber-800'
                    : frontMv < 400
                    ? 'bg-cyan-950/70 text-cyan-400 border border-cyan-800'
                    : 'bg-emerald-950/70 text-emerald-400 border border-emerald-800'
                }`}
              >
                {frontMv > 500 ? 'Mistura Rica' : frontMv < 400 ? 'Mistura Pobre' : 'Estequiométrica'}
              </span>
            </div>
          </div>

          {/* Voltage Gauge Bar */}
          <div className="mt-3">
            <div className="flex justify-between text-[10px] text-neutral-500 mb-1 font-mono">
              <span>0 mV (Pobre)</span>
              <span>450 mV (Ideal)</span>
              <span>1000 mV (Rica)</span>
            </div>
            <div className="h-3 w-full bg-neutral-950 rounded-full overflow-hidden p-0.5 border border-neutral-800 relative">
              {/* Target 450mV Mark */}
              <div className="absolute top-0 bottom-0 left-[45%] w-0.5 bg-neutral-600 z-10" />
              <div
                className="h-full rounded-full transition-all duration-150 bg-gradient-to-r from-cyan-500 via-emerald-400 to-amber-500"
                style={{ width: `${Math.min(100, Math.max(0, frontV * 100))}%` }}
              />
            </div>
          </div>

          {/* Short Term Fuel Trim (STFT) */}
          <div className="mt-5 pt-4 border-t border-neutral-800/80">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-400 font-medium">Correção Instantânea (STFT):</span>
              <span
                className={`font-mono font-bold ${
                  frontTrim > 0
                    ? 'text-amber-400'
                    : frontTrim < 0
                    ? 'text-cyan-400'
                    : 'text-neutral-300'
                }`}
              >
                {frontTrim > 0 ? `+${frontTrim}%` : `${frontTrim}%`}
              </span>
            </div>

            {/* STFT Bi-directional Bar */}
            <div className="mt-2 h-2.5 w-full bg-neutral-950 rounded-full flex relative border border-neutral-800">
              <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-neutral-600" />
              {frontTrim < 0 ? (
                <div
                  className="h-full bg-cyan-400 rounded-l-full ml-auto"
                  style={{
                    width: `${Math.min(50, Math.abs(frontTrim) * 2)}%`,
                    marginRight: '50%',
                  }}
                />
              ) : (
                <div
                  className="h-full bg-amber-400 rounded-r-full"
                  style={{
                    width: `${Math.min(50, frontTrim * 2)}%`,
                    marginLeft: '50%',
                  }}
                />
              )}
            </div>
            <div className="flex justify-between text-[10px] text-neutral-500 mt-1 font-mono">
              <span>-25% (Tirando comb.)</span>
              <span>0%</span>
              <span>+25% (Injetando mais)</span>
            </div>
          </div>
        </div>

        {/* Rear Cylinder O2 Card */}
        <div className="bg-neutral-900/90 rounded-2xl border border-neutral-800 p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-black uppercase">
                Cilindro Traseiro (Rear)
              </span>
              <span className="text-[11px] text-neutral-500 font-mono">Bank 1 Sensor 2</span>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-neutral-400">AFR Estimado: </span>
              <span className="text-sm font-black font-mono text-blue-400">{rearAfr}:1</span>
            </div>
          </div>

          {/* Tension Readout */}
          <div className="mt-4 flex items-baseline justify-between">
            <div>
              <span className="text-3xl font-black font-mono tracking-tight text-white">{rearMv}</span>
              <span className="ml-1 text-sm font-semibold text-neutral-400">mV</span>
              <span className="ml-2 text-xs font-mono text-neutral-500">({rearV.toFixed(3)} V)</span>
            </div>
            <div className="text-right">
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded ${
                  rearMv > 500
                    ? 'bg-amber-950/70 text-amber-400 border border-amber-800'
                    : rearMv < 400
                    ? 'bg-cyan-950/70 text-cyan-400 border border-cyan-800'
                    : 'bg-emerald-950/70 text-emerald-400 border border-emerald-800'
                }`}
              >
                {rearMv > 500 ? 'Mistura Rica' : rearMv < 400 ? 'Mistura Pobre' : 'Estequiométrica'}
              </span>
            </div>
          </div>

          {/* Voltage Gauge Bar */}
          <div className="mt-3">
            <div className="flex justify-between text-[10px] text-neutral-500 mb-1 font-mono">
              <span>0 mV (Pobre)</span>
              <span>450 mV (Ideal)</span>
              <span>1000 mV (Rica)</span>
            </div>
            <div className="h-3 w-full bg-neutral-950 rounded-full overflow-hidden p-0.5 border border-neutral-800 relative">
              {/* Target 450mV Mark */}
              <div className="absolute top-0 bottom-0 left-[45%] w-0.5 bg-neutral-600 z-10" />
              <div
                className="h-full rounded-full transition-all duration-150 bg-gradient-to-r from-cyan-500 via-emerald-400 to-amber-500"
                style={{ width: `${Math.min(100, Math.max(0, rearV * 100))}%` }}
              />
            </div>
          </div>

          {/* Short Term Fuel Trim (STFT) */}
          <div className="mt-5 pt-4 border-t border-neutral-800/80">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-400 font-medium">Correção Instantânea (STFT):</span>
              <span
                className={`font-mono font-bold ${
                  rearTrim > 0
                    ? 'text-amber-400'
                    : rearTrim < 0
                    ? 'text-cyan-400'
                    : 'text-neutral-300'
                }`}
              >
                {rearTrim > 0 ? `+${rearTrim}%` : `${rearTrim}%`}
              </span>
            </div>

            {/* STFT Bi-directional Bar */}
            <div className="mt-2 h-2.5 w-full bg-neutral-950 rounded-full flex relative border border-neutral-800">
              <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-neutral-600" />
              {rearTrim < 0 ? (
                <div
                  className="h-full bg-cyan-400 rounded-l-full ml-auto"
                  style={{
                    width: `${Math.min(50, Math.abs(rearTrim) * 2)}%`,
                    marginRight: '50%',
                  }}
                />
              ) : (
                <div
                  className="h-full bg-amber-400 rounded-r-full"
                  style={{
                    width: `${Math.min(50, rearTrim * 2)}%`,
                    marginLeft: '50%',
                  }}
                />
              )}
            </div>
            <div className="flex justify-between text-[10px] text-neutral-500 mt-1 font-mono">
              <span>-25% (Tirando comb.)</span>
              <span>0%</span>
              <span>+25% (Injetando mais)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Live Switching Oscilloscope */}
      <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              Osciloscópio de Comutação das Sondas Lambda (Closed-Loop Waveform)
            </h3>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-orange-400">
              <span className="w-3 h-0.5 bg-orange-500 inline-block" /> Front O₂
            </span>
            <span className="flex items-center gap-1.5 text-blue-400">
              <span className="w-3 h-0.5 bg-blue-500 inline-block" /> Rear O₂
            </span>
          </div>
        </div>

        {/* SVG Oscilloscope Display */}
        <div className="w-full h-44 bg-[#0a0a0c] rounded-xl border border-neutral-800 relative overflow-hidden p-2">
          {/* Grid lines */}
          <div className="absolute inset-0 grid grid-rows-4 grid-cols-6 pointer-events-none opacity-20">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="border-b border-r border-neutral-700" />
            ))}
          </div>

          {/* 450mV Reference Line */}
          <div className="absolute left-0 right-0 top-1/2 border-b border-dashed border-emerald-500/50 z-0">
            <span className="absolute right-2 -top-4 text-[9px] font-mono text-emerald-400">450mV (Lambda = 1.0)</span>
          </div>

          <svg className="w-full h-full overflow-visible relative z-10" preserveAspectRatio="none" viewBox="0 0 500 150">
            {/* Front O2 path */}
            <path
              d={generatePath('frontO2', 150, 500)}
              fill="none"
              stroke="#ff6600"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            {/* Rear O2 path */}
            <path
              d={generatePath('rearO2', 150, 500)}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>

      {/* Auxiliary Engine Load Readings (TPS & MAP) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-neutral-900/80 p-4 rounded-xl border border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-neutral-950 rounded-lg border border-neutral-800 text-orange-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs text-neutral-400 font-medium">Abertura de Borboleta (TPS)</span>
              <p className="text-base font-black font-mono text-white">{tps}%</p>
            </div>
          </div>
          <div className="w-32 h-2 bg-neutral-950 rounded-full overflow-hidden border border-neutral-800">
            <div className="h-full bg-orange-500 rounded-full" style={{ width: `${tps}%` }} />
          </div>
        </div>

        <div className="bg-neutral-900/80 p-4 rounded-xl border border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-neutral-950 rounded-lg border border-neutral-800 text-cyan-400">
              <Gauge className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs text-neutral-400 font-medium">Pressão do Coletor (MAP)</span>
              <p className="text-base font-black font-mono text-white">{mapKpa} kPa</p>
            </div>
          </div>
          <div className="w-32 h-2 bg-neutral-950 rounded-full overflow-hidden border border-neutral-800">
            <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${Math.min(100, (mapKpa / 105) * 100)}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
};
