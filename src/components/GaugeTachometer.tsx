import React from 'react';

interface GaugeTachometerProps {
  rpm: number;
  maxRpm?: number;
}

export const GaugeTachometer: React.FC<GaugeTachometerProps> = ({ rpm, maxRpm = 7000 }) => {
  const clampedRpm = Math.min(maxRpm, Math.max(0, rpm));
  const isRedline = clampedRpm >= 5500;
  const isHighRpm = clampedRpm >= 4800;

  // Arc angles: start at 135 deg (7:30 o'clock), sweep 270 deg to 405 deg (4:30 o'clock)
  const startAngle = 135;
  const totalSweep = 270;
  const progressRatio = clampedRpm / maxRpm;
  // In SVG coordinates, the needle line is drawn pointing straight UP to 12 o'clock (-90° from positive X axis).
  // The ticks are computed with standard polar angle where 0° = 3 o'clock (+X axis).
  // Therefore, for a given angle θ on the dial: needleAngle = θ + 90°.
  const dialAngle = startAngle + progressRatio * totalSweep;
  const needleAngle = dialAngle + 90;

  // Generate tick marks
  const ticks = [];
  const majorTicksCount = 8; // 0 to 7 (x1000 RPM)
  for (let i = 0; i <= majorTicksCount; i++) {
    const tickRpm = i * 1000;
    const angle = startAngle + (tickRpm / maxRpm) * totalSweep;
    const rad = (angle * Math.PI) / 180;
    const isRedZone = tickRpm >= 5500;
    const isYellowZone = tickRpm >= 5000 && tickRpm < 5500;

    // Outer & inner tick points
    const rOuter = 135;
    const rInner = 118;
    const x1 = 150 + rOuter * Math.cos(rad);
    const y1 = 150 + rOuter * Math.sin(rad);
    const x2 = 150 + rInner * Math.cos(rad);
    const y2 = 150 + rInner * Math.sin(rad);

    // Number position
    const rText = 100;
    const tx = 150 + rText * Math.cos(rad);
    const ty = 150 + rText * Math.sin(rad);

    ticks.push(
      <g key={`major-${i}`}>
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={isRedZone ? '#ef4444' : isYellowZone ? '#eab308' : '#e2e8f0'}
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <text
          x={tx}
          y={ty}
          fill={isRedZone ? '#ef4444' : '#94a3b8'}
          fontSize="13"
          fontWeight="bold"
          fontFamily="ui-monospace, monospace"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {i}
        </text>
      </g>
    );

    // Minor ticks (every 500 rpm)
    if (i < majorTicksCount) {
      const halfRpm = tickRpm + 500;
      const hAngle = startAngle + (halfRpm / maxRpm) * totalSweep;
      const hRad = (hAngle * Math.PI) / 180;
      const hrInner = 124;
      const hx1 = 150 + rOuter * Math.cos(hRad);
      const hy1 = 150 + rOuter * Math.sin(hRad);
      const hx2 = 150 + hrInner * Math.cos(hRad);
      const hy2 = 150 + hrInner * Math.sin(hRad);
      ticks.push(
        <line
          key={`minor-${i}`}
          x1={hx1}
          y1={hy1}
          x2={hx2}
          y2={hy2}
          stroke={halfRpm >= 5500 ? '#ef4444' : '#64748b'}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      );
    }
  }

  return (
    <div className="relative flex flex-col items-center justify-center p-4 bg-[#14151b] border border-neutral-800 rounded-2xl shadow-2xl">
      {/* Top Header Label */}
      <div className="flex items-center justify-between w-full px-2 mb-1">
        <span className="text-[11px] font-mono tracking-widest text-neutral-400 uppercase">
          Tacômetro · J1850
        </span>
        {isRedline && (
          <span className="text-[10px] font-black uppercase text-red-500 animate-pulse px-2 py-0.5 bg-red-950/80 rounded border border-red-800">
            Redline!
          </span>
        )}
      </div>

      <div className="relative w-64 h-64 sm:w-72 sm:h-72">
        <svg viewBox="0 0 300 300" className="w-full h-full select-none">
          <defs>
            {/* Bezel gradient */}
            <radialGradient id="tachBezel" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#1e2029" />
              <stop offset="85%" stopColor="#0f1015" />
              <stop offset="100%" stopColor="#2b2d38" />
            </radialGradient>
            {/* Orange glowing track */}
            <linearGradient id="orangeGlow" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ff6600" />
              <stop offset="70%" stopColor="#ff4500" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
            {/* Filter for needle drop shadow */}
            <filter id="needleShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="2" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.8" />
            </filter>
          </defs>

          {/* Outer Chrome / Gunmetal Ring */}
          <circle cx="150" cy="150" r="147" fill="none" stroke="#2c2e3a" strokeWidth="4" />
          <circle cx="150" cy="150" r="144" fill="url(#tachBezel)" />

          {/* Redline zone arc (from 5500 to 7000 RPM) */}
          <path
            d="M 235 208 A 128 128 0 0 0 256 150"
            fill="none"
            stroke="#ef4444"
            strokeWidth="8"
            strokeLinecap="round"
            opacity="0.35"
          />

          {/* Render All Ticks & Numbers */}
          {ticks}

          {/* Center Brand/Gauge Identity */}
          <text
            x="150"
            y="95"
            fill="#ea580c"
            fontSize="10"
            fontWeight="bold"
            letterSpacing="2"
            textAnchor="middle"
            fontFamily="sans-serif"
          >
            RPM × 1000
          </text>
          <text
            x="150"
            y="175"
            fill="#64748b"
            fontSize="9"
            letterSpacing="1"
            textAnchor="middle"
            fontFamily="sans-serif"
          >
            HARLEY-DAVIDSON
          </text>

          {/* Needle */}
          <g
            style={{
              transform: `rotate(${needleAngle}deg)`,
              transformOrigin: '150px 150px',
              transition: 'transform 80ms ease-out',
            }}
            filter="url(#needleShadow)"
          >
            {/* Back counterweight */}
            <line x1="150" y1="150" x2="150" y2="178" stroke="#1f2937" strokeWidth="5" strokeLinecap="round" />
            {/* Main sharp needle */}
            <line
              x1="150"
              y1="150"
              x2="150"
              y2="28"
              stroke={isRedline ? '#ef4444' : '#ff6600'}
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            {/* Needle center tip */}
            <polygon
              points="148,32 152,32 150,22"
              fill={isRedline ? '#ef4444' : '#ff6600'}
            />
          </g>

          {/* Center Hub Nut */}
          <circle cx="150" cy="150" r="14" fill="#0f1015" stroke="#374151" strokeWidth="2.5" />
          <circle cx="150" cy="150" r="6" fill="#ff6600" />
        </svg>

        {/* Digital Readout Center/Bottom */}
        <div className="absolute inset-x-0 bottom-4 flex flex-col items-center justify-center pointer-events-none">
          <div className="flex items-baseline gap-1 bg-black/60 px-3 py-1 rounded-md border border-neutral-800">
            <span
              className={`font-mono text-3xl font-extrabold tracking-tight ${
                isRedline ? 'text-red-500' : isHighRpm ? 'text-amber-400' : 'text-neutral-100'
              }`}
            >
              {clampedRpm}
            </span>
            <span className="text-[11px] font-mono text-neutral-400">RPM</span>
          </div>
        </div>
      </div>
    </div>
  );
};
