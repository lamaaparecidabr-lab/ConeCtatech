import React from 'react';

interface ClassicGaugeClusterProps {
  rpm: number;
  speed: number;
  speedUnit: 'kmh' | 'mph';
  gear: number | 'N';
  odometerKm?: number;
  onToggleSpeedUnit: () => void;
}

export const ClassicGaugeCluster: React.FC<ClassicGaugeClusterProps> = ({
  rpm,
  speed,
  speedUnit,
  gear,
  odometerKm = 34226,
  onToggleSpeedUnit,
}) => {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-8 py-6">
      {/* Conta-Giros / RPM Card */}
      <div className="relative group">
        <div className="w-64 h-64 rounded-full bg-[#161616] border-2 border-neutral-800 border-t-4 border-t-orange-500 shadow-[0_10px_35px_rgba(0,0,0,0.8)] flex flex-col justify-center items-center transition-transform hover:scale-[1.02]">
          {/* Subtle Orange Glow Ring */}
          <div className="absolute inset-0 rounded-full border border-orange-500/10 pointer-events-none" />
          
          <div className="text-xs uppercase font-mono tracking-widest text-neutral-500 mb-1">
            Harley-Davidson
          </div>

          <div
            id="dash-rpm"
            className="text-6xl font-black font-mono tracking-tighter text-white drop-shadow-[0_2px_10px_rgba(255,102,0,0.3)]"
          >
            {rpm}
          </div>

          <div className="text-sm font-bold tracking-widest text-orange-500 uppercase mt-1">
            RPM
          </div>

          {/* Redline Alert at > 5500 */}
          {rpm >= 5500 && (
            <div className="absolute bottom-5 text-[10px] font-mono font-bold text-red-400 bg-red-950/80 px-2 py-0.5 rounded border border-red-800 animate-pulse">
              REDLINE
            </div>
          )}
        </div>
      </div>

      {/* Velocímetro / Speed Card */}
      <div className="relative group">
        <div className="w-56 h-56 rounded-full bg-[#161616] border-2 border-neutral-800 border-t-4 border-t-neutral-400 shadow-[0_10px_35px_rgba(0,0,0,0.8)] flex flex-col justify-center items-center transition-transform hover:scale-[1.02] p-2">
          <div
            id="dash-speed"
            className="text-5xl font-black font-mono tracking-tighter text-white"
          >
            {speed}
          </div>

          <button
            onClick={onToggleSpeedUnit}
            className="text-[11px] font-bold tracking-widest text-neutral-400 hover:text-orange-400 uppercase mt-0.5 transition-colors cursor-pointer bg-neutral-900/80 px-2.5 py-0.5 rounded-full border border-neutral-800"
            title="Clique para alternar km/h e mph"
          >
            {speedUnit}
          </button>

          {/* Odômetro do Velocímetro (Visor LCD estilo Harley) */}
          <div className="mt-1.5 px-2.5 py-0.5 bg-black/70 rounded border border-neutral-800 text-[10px] font-mono text-neutral-300">
            ODO: <span className="text-orange-400 font-bold">{odometerKm.toLocaleString()}</span> km
          </div>

          {/* Marcha Atual */}
          <div className="mt-1.5 flex items-center gap-1.5 text-xs font-mono text-neutral-400">
            <span>Marcha:</span>
            <span
              className={`font-black text-xs px-2 py-0.5 rounded ${
                gear === 'N'
                  ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                  : 'bg-orange-950/80 text-orange-400 border border-orange-800'
              }`}
            >
              {gear === 'N' ? 'N' : `${gear}ª`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
