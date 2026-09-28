import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-500/90 backdrop-blur-md px-3.5 py-2 text-xs font-bold text-neutral-950 shadow-xl border border-amber-300">
      <WifiOff className="w-4 h-4 animate-pulse text-neutral-950" />
      <span>Modo Offline Ativo — Scanner J1850 e Bluetooth operando localmente sem internet.</span>
    </div>
  );
};
