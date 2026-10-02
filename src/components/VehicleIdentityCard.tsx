import React from 'react';
import { Check } from 'lucide-react';
import { identifyHarleyVehicle } from '../services/harleyVehicleIdentifier';

interface VehicleIdentityCardProps {
  vin?: string;
  protocol?: 'J1850 VPW' | 'CAN';
  isConnected: boolean;
}

export const VehicleIdentityCard: React.FC<VehicleIdentityCardProps> = ({ vin, protocol, isConnected }) => {
  const identity = identifyHarleyVehicle(vin);
  const resolved = Boolean(identity?.confirmed && identity.factoryModel && identity.commercialName && identity.modelYear);
  const partial = Boolean(vin && identity?.modelYear && !resolved);

  return (
    <div className="w-full rounded-xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
        {resolved && <Check className="w-4 h-4 shrink-0 text-emerald-500" aria-hidden="true" />}
        <span className="text-xs sm:text-sm font-black tracking-wide text-neutral-100">HARLEY-DAVIDSON</span>
        <span className="hidden sm:inline text-neutral-700">•</span>
        <span className="text-sm sm:text-base font-bold text-white truncate">
          {resolved
            ? `${identity!.factoryModel} ${identity!.commercialName} · ${identity!.modelYear}`
            : partial
              ? `Modelo não catalogado · ${identity!.modelYear}`
              : 'Identificando motocicleta...'}
        </span>
      </div>
      <div className="mt-1 pl-0 sm:pl-6 text-xs sm:text-sm text-neutral-400 truncate">
        {resolved
          ? [
              identity?.engine,
              identity?.displacementCc ? `${identity.displacementCc} cm³` : undefined,
              protocol,
            ].filter(Boolean).join(' · ')
          : protocol
            ? `Conectado via ${protocol}`
            : '......'}
      </div>
    </div>
  );
};
