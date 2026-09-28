import React from 'react';
import { Sliders, Flame, Power, PlayCircle } from 'lucide-react';

interface SimulatorControlsProps {
  currentRpm: number;
  currentSpeed: number;
  gear: number | 'N';
  onUpdateValues: (rpm: number, speed: number, gear: number | 'N') => void;
}

export const SimulatorControls: React.FC<SimulatorControlsProps> = ({
  currentRpm,
  currentSpeed,
  gear,
  onUpdateValues,
}) => {
  const gears: (number | 'N')[] = ['N', 1, 2, 3, 4, 5, 6];

  const applyPreset = (presetRpm: number, presetSpeed: number, presetGear: number | 'N') => {
    onUpdateValues(presetRpm, presetSpeed, presetGear);
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-[#14151b] border border-orange-500/40 rounded-2xl p-5 shadow-2xl">
      <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-orange-500" />
          <h3 className="text-sm font-bold text-neutral-100 uppercase tracking-wider">
            Controles do Simulador Harley J1850
          </h3>
        </div>
        <span className="text-[11px] font-mono text-orange-400 bg-orange-950/60 border border-orange-800/80 px-2 py-0.5 rounded">
          Transmissão de Pacotes Ativa
        </span>
      </div>

      {/* Quick Presets */}
      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-neutral-400 font-mono">Cenários Rápidos:</span>
        <button
          onClick={() => applyPreset(980, 0, 'N')}
          className="px-2.5 py-1 text-xs bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded border border-neutral-700 transition-colors"
        >
          Marcha Lenta (980 RPM)
        </button>
        <button
          onClick={() => applyPreset(2600, 45, 2)}
          className="px-2.5 py-1 text-xs bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded border border-neutral-700 transition-colors"
        >
          Cidade (2ª Marcha · 45 km/h)
        </button>
        <button
          onClick={() => applyPreset(3100, 80, 4)}
          className="px-2.5 py-1 text-xs bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded border border-neutral-700 transition-colors"
        >
          Estrada (4ª Marcha · 80 km/h)
        </button>
        <button
          onClick={() => applyPreset(2800, 120, 6)}
          className="px-2.5 py-1 text-xs bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded border border-neutral-700 transition-colors"
        >
          Rodovia Cruising (6ª Marcha · 120 km/h)
        </button>
        <button
          onClick={() => applyPreset(5800, 110, 3)}
          className="px-2.5 py-1 text-xs bg-red-950 hover:bg-red-900 text-red-300 rounded border border-red-800 transition-colors font-bold"
        >
          Corte de Giro (5800 RPM)
        </button>
      </div>

      {/* Sliders Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-5">
        {/* RPM Slider */}
        <div className="bg-[#0f1015] p-3.5 rounded-xl border border-neutral-800">
          <div className="flex justify-between items-center mb-1 text-xs">
            <span className="text-neutral-300 font-bold uppercase font-mono">Acelerador (RPM)</span>
            <span className="text-orange-400 font-mono font-black text-sm">{currentRpm} RPM</span>
          </div>
          <input
            type="range"
            min="0"
            max="6500"
            step="50"
            value={currentRpm}
            onChange={(e) => onUpdateValues(Number(e.target.value), currentSpeed, gear)}
            className="w-full accent-orange-500 cursor-pointer h-2 bg-neutral-800 rounded-lg"
          />
          <div className="flex justify-between text-[10px] font-mono text-neutral-400 mt-1">
            <span>0</span>
            <span>1000 (Idle)</span>
            <span>3500</span>
            <span className="text-red-400">5500+</span>
          </div>
        </div>

        {/* Speed Slider */}
        <div className="bg-[#0f1015] p-3.5 rounded-xl border border-neutral-800">
          <div className="flex justify-between items-center mb-1 text-xs">
            <span className="text-neutral-300 font-bold uppercase font-mono">Velocidade</span>
            <span className="text-orange-400 font-mono font-black text-sm">{currentSpeed} km/h</span>
          </div>
          <input
            type="range"
            min="0"
            max="200"
            step="1"
            value={currentSpeed}
            onChange={(e) => onUpdateValues(currentRpm, Number(e.target.value), gear)}
            className="w-full accent-orange-500 cursor-pointer h-2 bg-neutral-800 rounded-lg"
          />
          <div className="flex justify-between text-[10px] font-mono text-neutral-400 mt-1">
            <span>0 km/h</span>
            <span>60 km/h</span>
            <span>120 km/h</span>
            <span>200 km/h</span>
          </div>
        </div>
      </div>

      {/* Gear Selector Buttons */}
      <div className="mt-5 flex items-center justify-between flex-wrap gap-2 pt-3 border-t border-neutral-800/80">
        <span className="text-xs font-mono text-neutral-400 uppercase">Marcha:</span>
        <div className="flex items-center gap-1.5">
          {gears.map((g) => (
            <button
              key={g}
              onClick={() => onUpdateValues(currentRpm, currentSpeed, g)}
              className={`w-9 h-9 rounded-lg font-mono font-black text-sm flex items-center justify-center transition-all ${
                gear === g
                  ? g === 'N'
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                    : 'bg-orange-600 text-white shadow-lg shadow-orange-600/30 scale-105'
                  : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-400 border border-neutral-800'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
