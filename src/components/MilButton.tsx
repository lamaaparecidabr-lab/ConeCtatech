import React from 'react';

interface MilButtonProps {
  isActive: boolean;
  activeScreen: 'dashboard' | 'diagnostics' | 'actuators' | 'oxygen' | 'datalogger' | 'terminal';
  onClick: () => void;
}

export const MilButton: React.FC<MilButtonProps> = ({
  isActive,
  activeScreen,
  onClick,
}) => {
  const isDiag = activeScreen === 'diagnostics';

  return (
    <button
      id="btn-injeçao"
      onClick={onClick}
      className={`relative p-2 rounded-xl border transition-all cursor-pointer group flex items-center gap-2 ${
        isActive
          ? 'bg-orange-950/80 border-orange-500 shadow-[0_0_15px_rgba(255,102,0,0.6)] animate-pulse'
          : isDiag
          ? 'bg-neutral-900 border-orange-500/80 text-orange-400'
          : 'bg-neutral-950/70 border-neutral-800 text-neutral-500 hover:text-orange-400 hover:border-neutral-700'
      }`}
      title={
        isDiag
          ? 'Voltar ao Painel de Instrumentos'
          : 'Alternar para Scanner de Diagnóstico Harley (DTC / VIN)'
      }
    >
      {/* Authentic Check Engine / MIL SVG Icon */}
      <svg
        className={`w-7 h-5 transition-transform group-hover:scale-110 ${
          isActive
            ? 'text-orange-500 drop-shadow-[0_0_8px_#ff6600]'
            : isDiag
            ? 'text-orange-400'
            : 'text-neutral-500 group-hover:text-orange-400'
        }`}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 512 512"
        fill="currentColor"
      >
        <path d="M496 176h-44.5c-15.1-41-47.5-73.4-88.5-88.5V43c0-13.3-10.7-24-24-24h-32c-13.3 0-24 10.7-24 24v40h-64V43c0-13.3-10.7-24-24-24h-32c-13.3 0-24 10.7-24 24v44.5c-41 15.1-73.4 47.5-88.5 88.5H16c-8.8 0-16 7.2-16 16v48c0 8.8 7.2 16 16 16h32.5c8.3 22.7 21.8 43.1 39 60.3L49.1 364.1c-6.2 6.2-6.2 16.4 0 22.6l22.6 22.6c6.2 6.2 16.4 6.2 22.6 0L129 374.5c17.2 17.2 37.6 30.7 60.3 39V446c0 13.3 10.7 24 24 24h32c13.3 0 24-10.7 24-24v-40h64v40c0 13.3 10.7 24 24 24h32c13.3 0 24-10.7 24-24v-44.5c41-15.1 73.4-47.5 88.5-88.5H496c8.8 0 16-7.2 16-16v-48c0-8.8-7.2-16-16-16zm-240 192c-61.9 0-112-50.1-112-112s50.1-112 112-112 112 50.1 112 112-50.1 112-112 112z" />
      </svg>

      <span className="hidden sm:inline text-xs font-mono font-bold tracking-tight">
        {isActive ? 'MIL ATIVA' : isDiag ? 'DIAG' : 'SCAN'}
      </span>
    </button>
  );
};
