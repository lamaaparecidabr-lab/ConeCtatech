import React from 'react';
import { Bluetooth, Usb, Cpu, X, ShieldAlert, Check, HelpCircle } from 'lucide-react';
import { ConnectionConfig, ConnectionType } from '../types';

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectBluetooth: () => void;
  onConnectSerial: () => void;
  onStartSimulator: () => void;
  config: ConnectionConfig;
  onChangeConfig: (newConfig: ConnectionConfig) => void;
  currentType: ConnectionType;
}

export const ConnectionModal: React.FC<ConnectionModalProps> = ({
  isOpen,
  onClose,
  onConnectBluetooth,
  onConnectSerial,
  onStartSimulator,
  config,
  onChangeConfig,
  currentType,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#14151b] border border-neutral-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-[#181a22]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-600/20 border border-orange-500/40 flex items-center justify-center text-orange-500 font-bold">
              CH
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-100">ConeCtaHarley · Conexão ELM327</h2>
              <p className="text-xs text-neutral-400">Comunicação J1850 VPW com a ECU Harley-Davidson</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Options Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* 1. Web Bluetooth */}
            <button
              onClick={() => {
                onConnectBluetooth();
                onClose();
              }}
              className="flex flex-col items-center text-center p-4 rounded-xl bg-neutral-900/80 hover:bg-neutral-800/90 border border-neutral-800 hover:border-orange-500/60 transition-all group"
            >
              <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-3 group-hover:scale-110 transition-transform">
                <Bluetooth className="w-6 h-6" />
              </div>
              <span className="text-sm font-bold text-neutral-200">Bluetooth OBD</span>
              <span className="text-[11px] text-neutral-400 mt-1">
                ELM327 BLE ou SPP (Android / PC / Mac)
              </span>
            </button>

            {/* 2. Web Serial (USB) */}
            <button
              onClick={() => {
                onConnectSerial();
                onClose();
              }}
              className="flex flex-col items-center text-center p-4 rounded-xl bg-neutral-900/80 hover:bg-neutral-800/90 border border-neutral-800 hover:border-orange-500/60 transition-all group"
            >
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3 group-hover:scale-110 transition-transform">
                <Usb className="w-6 h-6" />
              </div>
              <span className="text-sm font-bold text-neutral-200">Serial USB / COM</span>
              <span className="text-[11px] text-neutral-400 mt-1">
                Cabo OBD USB ou Porta Virtual COM
              </span>
            </button>

            {/* 3. Simulator */}
            <button
              onClick={() => {
                onStartSimulator();
                onClose();
              }}
              className="flex flex-col items-center text-center p-4 rounded-xl bg-orange-950/20 hover:bg-orange-950/40 border border-orange-800/40 hover:border-orange-500 transition-all group"
            >
              <div className="w-12 h-12 rounded-full bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 mb-3 group-hover:scale-110 transition-transform">
                <Cpu className="w-6 h-6" />
              </div>
              <span className="text-sm font-bold text-orange-400">Modo Simulador</span>
              <span className="text-[11px] text-neutral-400 mt-1">
                Testar sem moto / sem hardware
              </span>
            </button>
          </div>

          {/* Configuration options */}
          <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 space-y-3">
            <span className="text-xs font-mono font-bold text-neutral-300 uppercase tracking-wider block">
              Configurações de Comunicação
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-neutral-400 block mb-1">Protocolo ELM327:</label>
                <select
                  value={config.protocol}
                  onChange={(e) =>
                    onChangeConfig({ ...config, protocol: e.target.value as any })
                  }
                  className="w-full bg-black/60 border border-neutral-700 rounded-lg px-3 py-2 text-neutral-200 focus:outline-none focus:border-orange-500 font-mono"
                >
                  <option value="ATSP2">ATSP2 - SAE J1850 VPW (Padrão Harley)</option>
                  <option value="ATSP1">ATSP1 - SAE J1850 PWM</option>
                  <option value="ATSP0">ATSP0 - Automático (ELM Auto-detect)</option>
                </select>
              </div>

              <div>
                <label className="text-neutral-400 block mb-1">Modo Monitor Passivo (ATMA):</label>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    id="monitorModeCheck"
                    checked={config.monitorMode}
                    onChange={(e) =>
                      onChangeConfig({ ...config, monitorMode: e.target.checked })
                    }
                    className="w-4 h-4 accent-orange-500 cursor-pointer"
                  />
                  <label htmlFor="monitorModeCheck" className="text-neutral-300 cursor-pointer">
                    Escuta passiva J1850 (<code className="text-orange-400 font-mono">ATMA</code>)
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Harley-Davidson Pinout Help */}
          <div className="p-3.5 bg-neutral-900/30 border border-neutral-800 rounded-xl text-xs text-neutral-400 space-y-1.5">
            <div className="flex items-center gap-1.5 text-neutral-300 font-bold">
              <HelpCircle className="w-4 h-4 text-orange-400" />
              <span>Conector de Diagnóstico da Harley-Davidson:</span>
            </div>
            <p>
              • <strong>Modelos até 2013 (Sportster, Dyna, Softail, Touring)</strong>: Conector Deutsch de 4 pinos sob o banco ou lateral esquerda (Pino 1: Barramento J1850, Pino 2: Terra GND, Pino 3: +12V Bateria).
            </p>
            <p>
              • Use um cabo adaptador <span className="text-neutral-200">Deutsch 4 pinos para OBD2 16 pinos padrão</span> conectado ao dongle ELM327.
            </p>
            <div className="pt-2 border-t border-neutral-800 text-[11px] text-neutral-400">
              <span className="text-orange-400 font-bold">Dica para iPhone (iOS): </span>
              No iPhone, use o navegador gratuito <span className="text-neutral-200 font-bold">Bluefy</span> (disponível na App Store) com um adaptador ELM327 modelo <span className="text-neutral-200 font-bold">Bluetooth BLE 4.0</span> (ex: Vgate iCar Pro BLE) ou Wi-Fi.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#181a22] border-t border-neutral-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
