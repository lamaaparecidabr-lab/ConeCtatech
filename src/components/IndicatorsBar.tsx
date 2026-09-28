import React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Zap,
  Droplets,
  AlertTriangle,
  Sun,
  ShieldCheck,
} from 'lucide-react';

interface IndicatorsBarProps {
  turnLeft: boolean;
  turnRight: boolean;
  neutral: boolean;
  batteryWarning: boolean;
  oilWarning: boolean;
  checkEngine: boolean;
  highBeam: boolean;
}

export const IndicatorsBar: React.FC<IndicatorsBarProps> = ({
  turnLeft,
  turnRight,
  neutral,
  batteryWarning,
  oilWarning,
  checkEngine,
  highBeam,
}) => {
  return (
    <div className="w-full max-w-4xl mx-auto bg-[#101116] border border-neutral-800 rounded-xl px-4 py-2.5 shadow-xl flex items-center justify-around flex-wrap gap-2">
      {/* Left Turn Indicator */}
      <div
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all duration-150 ${
          turnLeft
            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.5)] animate-pulse'
            : 'bg-neutral-900/60 border-neutral-800/80 text-neutral-600'
        }`}
        title="Seta Esquerda"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-[10px] font-mono font-bold tracking-wider">ESQ</span>
      </div>

      {/* Neutral (N) Indicator */}
      <div
        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border transition-all duration-200 ${
          neutral
            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-[0_0_14px_rgba(34,197,94,0.6)] font-black'
            : 'bg-neutral-900/60 border-neutral-800/80 text-neutral-600'
        }`}
        title="Ponto Morto (Neutral)"
      >
        <span className="w-2 h-2 rounded-full bg-current"></span>
        <span className="text-xs font-mono font-black tracking-widest">N</span>
      </div>

      {/* Check Engine MIL */}
      <div
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all duration-200 ${
          checkEngine
            ? 'bg-amber-500/20 border-amber-500 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.5)] animate-pulse'
            : 'bg-neutral-900/60 border-neutral-800/80 text-neutral-600'
        }`}
        title="Check Engine / MIL"
      >
        <AlertTriangle className="w-4 h-4" />
        <span className="text-[10px] font-mono font-bold tracking-wider">CHECK</span>
      </div>

      {/* Oil Pressure */}
      <div
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all duration-200 ${
          oilWarning
            ? 'bg-red-500/20 border-red-500 text-red-400 shadow-[0_0_12px_rgba(239,68,68,0.5)] animate-pulse'
            : 'bg-neutral-900/60 border-neutral-800/80 text-neutral-600'
        }`}
        title="Pressão do Óleo"
      >
        <Droplets className="w-4 h-4" />
        <span className="text-[10px] font-mono font-bold tracking-wider">ÓLEO</span>
      </div>

      {/* Battery / Alternator */}
      <div
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all duration-200 ${
          batteryWarning
            ? 'bg-red-500/20 border-red-500 text-red-400 shadow-[0_0_12px_rgba(239,68,68,0.5)]'
            : 'bg-neutral-900/60 border-neutral-800/80 text-neutral-600'
        }`}
        title="Sistema de Carga / Bateria"
      >
        <Zap className="w-4 h-4" />
        <span className="text-[10px] font-mono font-bold tracking-wider">BATT</span>
      </div>

      {/* High Beam */}
      <div
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all duration-200 ${
          highBeam
            ? 'bg-blue-500/20 border-blue-500 text-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.6)]'
            : 'bg-neutral-900/60 border-neutral-800/80 text-neutral-600'
        }`}
        title="Farol Alto"
      >
        <Sun className="w-4 h-4" />
        <span className="text-[10px] font-mono font-bold tracking-wider">ALTO</span>
      </div>

      {/* Right Turn Indicator */}
      <div
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all duration-150 ${
          turnRight
            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.5)] animate-pulse'
            : 'bg-neutral-900/60 border-neutral-800/80 text-neutral-600'
        }`}
        title="Seta Direita"
      >
        <span className="text-[10px] font-mono font-bold tracking-wider">DIR</span>
        <ArrowRight className="w-4 h-4" />
      </div>
    </div>
  );
};
