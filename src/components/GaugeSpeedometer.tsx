import React from 'react';

interface GaugeSpeedometerProps {
  speedKmH: number;
  speedMph: number;
  unit: 'kmh' | 'mph';
  gear: number | 'N';
  odometerKm?: number;
  onToggleUnit?: () => void;
}

export const GaugeSpeedometer: React.FC<GaugeSpeedometerProps> = ({
  speedKmH,
  speedMph,
  unit,
  gear,
  odometerKm = 34218,
  onToggleUnit,
}) => {
  const isKmh = unit === 'kmh';
  const displaySpeed = isKmh ? speedKmH : speedMph;
  const maxSpeed = isKmh ? 220 : 140;
  const clampedSpeed = Math.min(maxSpeed, Math.max(0, displaySpeed));

  const startAngle = 135;
  const totalSweep = 270;
  const progressRatio = clampedSpeed / maxSpeed;
  // In SVG coordinates, the needle line is drawn pointing straight UP to 12 o'clock (-90° from positive X axis).
  // The ticks are computed with standard polar angle where 0° = 3 o'clock (+X axis).
  // Therefore, for a given angle θ on the dial: needleAngle = θ + 90°.
  const dialAngle = startAngle + progressRatio * totalSweep;
  const needleAngle = dialAngle + 90;

  // Generate tick marks
  const ticks = [];
  const majorStep = isKmh ? 20 : 10;
  const totalSteps = maxSpeed / majorStep;

  for (let i = 0; i <= totalSteps; i++) {
    const val = i * majorStep;
    const angle = startAngle + (val / maxSpeed) * totalSweep;
    const rad = (angle * Math.PI) / 180;

    const rOuter = 135;
    const rInner = 118;
    const x1 = 150 + rOuter * Math.cos(rad);
    const y1 = 150 + rOuter * Math.sin(rad);
    const x2 = 150 + rInner * Math.cos(rad);
    const y2 = 150 + rInner * Math.sin(rad);

    const rText = 98;
    const tx = 150 + rText * Math.cos(rad);
    const ty = 150 + rText * Math.sin(rad);

    ticks.push(
      <g key={`speed-tick-${i}`}>
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="#f1f5f9"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <text
          x={tx}
          y={ty}
          fill="#cbd5e1"
          fontSize="12"
          fontWeight="bold"
          fontFamily="ui-monospace, monospace"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {val}
        </text>
      </g>
    );

    // Minor half-step ticks
    if (i < totalSteps) {
      const halfVal = val + majorStep / 2;
      const hAngle = startAngle + (halfVal / maxSpeed) * totalSweep;
      const hRad = (hAngle * Math.PI) / 180;
      const hrInner = 124;
      const hx1 = 150 + rOuter * Math.cos(hRad);
      const hy1 = 150 + rOuter * Math.sin(hRad);
      const hx2 = 150 + hrInner * Math.cos(hRad);
      const hy2 = 150 + hrInner * Math.sin(hRad);
      ticks.push(
        <line
          key={`speed-minor-${i}`}
          x1={hx1}
          y1={hy1}
          x2={hx2}
          y2={hy2}
          stroke="#64748b"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      );
    }
  }

  return (
    <div className="relative flex flex-col items-center justify-center p-4 bg-[#14151b] border border-neutral-800 rounded-2xl shadow-2xl">
      {/* Header with Unit Toggle */}
      <div className="flex items-center justify-between w-full px-2 mb-1">
        <span className="text-[11px] font-mono tracking-widest text-neutral-400 uppercase">
          Velocímetro
        </span>
        <button
          onClick={onToggleUnit}
          className="text-[10px] font-bold uppercase tracking-wider text-orange-400 hover:text-orange-300 px-2 py-0.5 bg-neutral-900 border border-neutral-700 rounded transition-colors"
          title="Alternar entre km/h e mph"
        >
          {isKmh ? 'km/h ⇄ mph' : 'mph ⇄ km/h'}
        </button>
      </div>

      <div className="relative w-64 h-64 sm:w-72 sm:h-72">
        <svg viewBox="0 0 300 300" className="w-full h-full select-none">
          <defs>
            <radialGradient id="speedBezel" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#1e2029" />
              <stop offset="85%" stopColor="#0f1015" />
              <stop offset="100%" stopColor="#2b2d38" />
            </radialGradient>
            <filter id="speedNeedleShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="2" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.8" />
            </filter>
          </defs>

          {/* Bezel */}
          <circle cx="150" cy="150" r="147" fill="none" stroke="#2c2e3a" strokeWidth="4" />
          <circle cx="150" cy="150" r="144" fill="url(#speedBezel)" />

          {/* Ticks */}
          {ticks}

          {/* Speed Unit text */}
          <text
            x="150"
            y="95"
            fill="#ff6600"
            fontSize="12"
            fontWeight="bold"
            letterSpacing="2"
            textAnchor="middle"
            fontFamily="sans-serif"
          >
            {isKmh ? 'KM/H' : 'MPH'}
          </text>

          {/* Gear display in top center */}
          <g>
            <rect
              x="133"
              y="160"
              width="34"
              height="30"
              rx="4"
              fill="#090a0f"
              stroke={gear === 'N' ? '#22c55e' : '#ff6600'}
              strokeWidth="1.5"
            />
            <text
              x="150"
              y="180"
              fill={gear === 'N' ? '#22c55e' : '#f8fafc'}
              fontSize="16"
              fontWeight="900"
              fontFamily="monospace"
              textAnchor="middle"
              dominantBaseline="central"
            >
              {gear}
            </text>
          </g>

          {/* Needle */}
          <g
            style={{
              transform: `rotate(${needleAngle}deg)`,
              transformOrigin: '150px 150px',
              transition: 'transform 80ms ease-out',
            }}
            filter="url(#speedNeedleShadow)"
          >
            <line x1="150" y1="150" x2="150" y2="178" stroke="#1f2937" strokeWidth="5" strokeLinecap="round" />
            <line x1="150" y1="150" x2="150" y2="28" stroke="#ff6600" strokeWidth="3.5" strokeLinecap="round" />
            <polygon points="148,32 152,32 150,22" fill="#ff6600" />
          </g>

          {/* Center Hub */}
          <circle cx="150" cy="150" r="14" fill="#0f1015" stroke="#374151" strokeWidth="2.5" />
          <circle cx="150" cy="150" r="6" fill="#ff6600" />
        </svg>

        {/* Digital Speedometer & Odometer Display */}
        <div className="absolute inset-x-0 bottom-4 flex flex-col items-center justify-center pointer-events-none">
          <div className="flex items-baseline gap-1 bg-black/60 px-3 py-1 rounded-md border border-neutral-800">
            <span className="font-mono text-3xl font-extrabold text-neutral-100 tracking-tight">
              {displaySpeed}
            </span>
            <span className="text-[11px] font-mono text-neutral-400">
              {isKmh ? 'km/h' : 'mph'}
            </span>
          </div>

          <div className="mt-1 text-[10px] font-mono text-neutral-400">
            ODO: {odometerKm.toLocaleString()} km
          </div>
        </div>
      </div>
    </div>
  );
};
