import React from 'react';
import { Thermometer, BatteryCharging, Gauge, Activity } from 'lucide-react';

interface EngineMetricsProps {
  engineTempC: number;
  engineTempF: number;
  batteryVoltage: number;
  gear: number | 'N';
  tempUnit: 'celsius' | 'fahrenheit';
  onToggleTempUnit: () => void;
  packetRate?: number;
}

export const EngineMetrics: React.FC<EngineMetricsProps> = ({
  engineTempC,
  engineTempF,
  batteryVoltage,
  gear,
  tempUnit,
  onToggleTempUnit,
  packetRate = 12,
}) => {
  // Temperature evaluation for air-cooled Harley V-Twin
  // Cold: < 150°F (65°C), Normal: 160-230°F (70-110°C), Hot: > 240°F (115°C)
  const isCold = engineTempF < 150;
  const isOverheating = engineTempF >= 240;
  const displayTemp = tempUnit === 'celsius' ? `${engineTempC}°C` : `${engineTempF}°F`;
  const subTemp = tempUnit === 'celsius' ? `${engineTempF}°F` : `${engineTempC}°C`;

  // Battery status
  const isCharging = batteryVoltage >= 13.4;
  const isLowBattery = batteryVoltage < 12.2 && batteryVoltage > 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-4xl mx-auto">
      {/* 1. Engine Temperature Card */}
      <div className="bg-[#14151b] border border-neutral-800 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Thermometer
              className={`w-5 h-5 ${
                isOverheating
                  ? 'text-red-500 animate-bounce'
                  : isCold
                  ? 'text-cyan-400'
                  : 'text-amber-500'
              }`}
            />
            <span className="text-xs font-mono font-medium tracking-wider text-neutral-400 uppercase">
              Temp. Motor (J1850)
            </span>
          </div>
          <button
            onClick={onToggleTempUnit}
            className="text-[10px] font-bold text-orange-400 hover:text-orange-300 px-2 py-0.5 bg-neutral-900 border border-neutral-700 rounded transition-colors"
          >
            {tempUnit === 'celsius' ? '°C ⇄ °F' : '°F ⇄ °C'}
          </button>
        </div>

        <div className="my-3 flex items-baseline justify-between">
          <div>
            <span
              className={`font-mono text-3xl font-extrabold ${
                isOverheating ? 'text-red-500' : isCold ? 'text-cyan-400' : 'text-neutral-100'
              }`}
            >
              {displayTemp}
            </span>
            <span className="text-xs font-mono text-neutral-400 ml-2">({subTemp})</span>
          </div>

          <span
            className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
              isOverheating
                ? 'bg-red-950 text-red-400 border border-red-800'
                : isCold
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
            }`}
          >
            {isOverheating ? 'ALTA TEMP' : isCold ? 'AQUECENDO' : 'NORMAL'}
          </span>
        </div>

        {/* Temperature bar */}
        <div>
          <div className="h-1.5 w-full bg-neutral-800 rounded-full overflow-hidden flex">
            <div
              className={`h-full transition-all duration-300 ${
                isOverheating ? 'bg-red-500' : isCold ? 'bg-cyan-500' : 'bg-amber-500'
              }`}
              style={{
                width: `${Math.min(100, Math.max(5, ((engineTempF - 50) / (280 - 50)) * 100))}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-[9px] font-mono text-neutral-400 mt-1">
            <span>50°F</span>
            <span>180°F (Ideal)</span>
            <span>280°F</span>
          </div>
        </div>
      </div>

      {/* 2. Battery Voltage Card */}
      <div className="bg-[#14151b] border border-neutral-800 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BatteryCharging
              className={`w-5 h-5 ${
                isCharging ? 'text-emerald-400' : isLowBattery ? 'text-red-500' : 'text-neutral-400'
              }`}
            />
            <span className="text-xs font-mono font-medium tracking-wider text-neutral-400 uppercase">
              Tensão da Bateria
            </span>
          </div>
          <span className="text-[10px] font-mono text-neutral-400">Pino 16 OBD</span>
        </div>

        <div className="my-3 flex items-baseline justify-between">
          <div>
            <span
              className={`font-mono text-3xl font-extrabold ${
                isLowBattery ? 'text-red-500' : 'text-neutral-100'
              }`}
            >
              {batteryVoltage.toFixed(1)}
            </span>
            <span className="text-xs font-mono text-neutral-400 ml-1">V DC</span>
          </div>

          <span
            className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
              isCharging
                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                : isLowBattery
                ? 'bg-red-950 text-red-400 border border-red-800'
                : 'bg-neutral-900 text-neutral-300 border border-neutral-700'
            }`}
          >
            {isCharging ? 'Alternador Ativo' : isLowBattery ? 'Bateria Fraca' : 'Em Repouso'}
          </span>
        </div>

        {/* Battery range visualizer */}
        <div>
          <div className="h-1.5 w-full bg-neutral-800 rounded-full overflow-hidden flex">
            <div
              className={`h-full transition-all duration-300 ${
                isCharging ? 'bg-emerald-500' : isLowBattery ? 'bg-red-500' : 'bg-blue-500'
              }`}
              style={{
                width: `${Math.min(100, Math.max(5, ((batteryVoltage - 11) / (15 - 11)) * 100))}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-[9px] font-mono text-neutral-400 mt-1">
            <span>11.0V</span>
            <span>12.6V (100%)</span>
            <span>14.4V (Carga)</span>
          </div>
        </div>
      </div>

      {/* 3. Transmission & Bus Link Card */}
      <div className="bg-[#14151b] border border-neutral-800 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-orange-500" />
            <span className="text-xs font-mono font-medium tracking-wider text-neutral-400 uppercase">
              Câmbio & Barramento
            </span>
          </div>
          <div className="flex items-center gap-1 text-[10px] font-mono text-neutral-400">
            <Activity className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
            <span>{packetRate} msg/s</span>
          </div>
        </div>

        <div className="my-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-neutral-400">Marcha Engatada</div>
            <div className="text-2xl font-mono font-black text-orange-500">
              {gear === 'N' ? 'Neutro (N)' : `${gear}ª Marcha`}
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-neutral-400">Protocolo Ativo</div>
            <div className="text-xs font-mono font-bold text-neutral-200">
              J1850 VPW 10.4K
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between text-[10px] font-mono text-neutral-400">
          <span>Harley Delphi ECM</span>
          <span className="text-emerald-400">Stream Contínuo</span>
        </div>
      </div>
    </div>
  );
};
