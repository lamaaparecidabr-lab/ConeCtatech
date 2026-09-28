import React, { useState } from 'react';
import {
  Wrench,
  Fuel,
  Zap,
  Gauge,
  ArrowLeft,
  ArrowRight,
  Flame,
  Wind,
  AlertTriangle,
  Play,
  CheckCircle,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { ActuatorTestItem, TelemetryData } from '../types';

interface ActuatorsPanelProps {
  telemetry: TelemetryData;
  isConnected: boolean;
  onRunTest: (testId: string) => Promise<{ success: boolean; message: string }>;
}

const TESTS_CONFIG: Omit<ActuatorTestItem, 'status'>[] = [
  {
    id: 'fuel_pump',
    name: 'Bomba de Combustível',
    target: 'ECU',
    description: 'Aciona o relé da bomba por 3 segundos para testar pressurização da linha (4.1 bar / 60 PSI).',
    commandHex: '30 01 01',
    durationMs: 3000,
    requiresEngineOff: true,
  },
  {
    id: 'needle_sweep',
    name: 'Varredura de Ponteiros',
    target: 'SPEEDO',
    description: 'Envia comando de calibração ao painel. Velocímetro e tacômetro varrem de 0 a 100% e retornam.',
    commandHex: '48 29 10 02 FF FF',
    durationMs: 2500,
    requiresEngineOff: false,
  },
  {
    id: 'spark_front',
    name: 'Centelha Cilindro Dianteiro',
    target: 'ECU',
    description: 'Dispara 5 pulsos de alta tensão na bobina da vela frontal para checagem de faísca.',
    commandHex: '30 02 01',
    durationMs: 2500,
    requiresEngineOff: true,
  },
  {
    id: 'spark_rear',
    name: 'Centelha Cilindro Traseiro',
    target: 'ECU',
    description: 'Dispara 5 pulsos de alta tensão na bobina da vela traseira para checagem de faísca.',
    commandHex: '30 03 01',
    durationMs: 2500,
    requiresEngineOff: true,
  },
  {
    id: 'turn_left',
    name: 'Pisca Esquerdo (TSSM/BCM)',
    target: 'TSSM/BCM',
    description: 'Aciona os piscas dianteiro e traseiro do lado esquerdo por 4 segundos.',
    commandHex: '68 88 10 01',
    durationMs: 4000,
    requiresEngineOff: false,
  },
  {
    id: 'turn_right',
    name: 'Pisca Direito (TSSM/BCM)',
    target: 'TSSM/BCM',
    description: 'Aciona os piscas dianteiro e traseiro do lado direito por 4 segundos.',
    commandHex: '68 88 10 02',
    durationMs: 4000,
    requiresEngineOff: false,
  },
  {
    id: 'exhaust_valve',
    name: 'Válvula de Escape Ativa (P1475)',
    target: 'ECU',
    description: 'Movimenta o servomotor da borboleta do escapamento (teste de rotação 0° a 90°).',
    commandHex: '30 05 01',
    durationMs: 3000,
    requiresEngineOff: true,
  },
  {
    id: 'intake_solenoid',
    name: 'Solenoide do Filtro de Ar (P0661)',
    target: 'ECU',
    description: 'Comuta a solenoide eletromagnética da tampa do filtro de ar ativo para teste acústico.',
    commandHex: '30 06 01',
    durationMs: 3000,
    requiresEngineOff: true,
  },
];

export const ActuatorsPanel: React.FC<ActuatorsPanelProps> = ({
  telemetry,
  isConnected,
  onRunTest,
}) => {
  const [runningTestId, setRunningTestId] = useState<string | null>(null);
  const [lastResults, setLastResults] = useState<Record<string, { success: boolean; message: string; timestamp: string }>>({});

  const isEngineRunning = telemetry.rpm > 350;

  const handleStartTest = async (item: Omit<ActuatorTestItem, 'status'>) => {
    if (!isConnected) return;
    if (item.requiresEngineOff && isEngineRunning) {
      alert('Segurança da ECM: Este teste de atuador só pode ser executado com o motor desligado (ignição ligada e 0 RPM).');
      return;
    }

    setRunningTestId(item.id);
    try {
      const res = await onRunTest(item.id);
      setLastResults((prev) => ({
        ...prev,
        [item.id]: {
          ...res,
          timestamp: new Date().toLocaleTimeString(),
        },
      }));
    } finally {
      setTimeout(() => {
        setRunningTestId(null);
      }, item.durationMs);
    }
  };

  const getTestIcon = (id: string) => {
    switch (id) {
      case 'fuel_pump':
        return <Fuel className="w-5 h-5 text-amber-500" />;
      case 'needle_sweep':
        return <Gauge className="w-5 h-5 text-orange-400" />;
      case 'spark_front':
      case 'spark_rear':
        return <Zap className="w-5 h-5 text-blue-400" />;
      case 'turn_left':
        return <ArrowLeft className="w-5 h-5 text-emerald-400" />;
      case 'turn_right':
        return <ArrowRight className="w-5 h-5 text-emerald-400" />;
      case 'exhaust_valve':
        return <Flame className="w-5 h-5 text-red-400" />;
      case 'intake_solenoid':
        return <Wind className="w-5 h-5 text-cyan-400" />;
      default:
        return <Wrench className="w-5 h-5 text-neutral-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-neutral-900 via-neutral-900 to-neutral-950 p-5 rounded-2xl border border-neutral-800 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-orange-600/20 text-orange-400 rounded-xl border border-orange-500/30">
                <Wrench className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-black tracking-wide text-white uppercase">
                Teste de Atuadores Bidirecional (Controle Ativo)
              </h2>
            </div>
            <p className="mt-1 text-xs text-neutral-400 max-w-2xl">
              Envio de rotinas de controle ativas (Modo 30 / J1850) para a injeção eletrônica Delphi, módulo de segurança TSSM e instrumentos físicos da motocicleta.
            </p>
          </div>

          {/* Engine State Safety Pill */}
          <div className="flex items-center gap-3">
            {isEngineRunning ? (
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-950/70 border border-amber-700/60 text-amber-300 text-xs font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Motor Funcionando ({telemetry.rpm} RPM) — Testes de ignição bloqueados</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-950/50 border border-emerald-800/60 text-emerald-400 text-xs font-bold">
                <ShieldAlert className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Pronto para Atuação (Ignição Ligada / Motor 0 RPM)</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Grid of Actuators */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {TESTS_CONFIG.map((item) => {
          const isRunning = runningTestId === item.id;
          const isBlockedByEngine = item.requiresEngineOff && isEngineRunning;
          const result = lastResults[item.id];

          return (
            <div
              key={item.id}
              className={`p-5 rounded-2xl border transition-all ${
                isRunning
                  ? 'bg-neutral-900 border-orange-500/80 shadow-lg shadow-orange-500/20'
                  : 'bg-neutral-900/80 hover:bg-neutral-900 border-neutral-800'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-neutral-950 rounded-xl border border-neutral-800 shrink-0">
                    {getTestIcon(item.id)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white tracking-wide">
                        {item.name}
                      </h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-neutral-800 text-neutral-400 border border-neutral-700">
                        {item.target}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-400 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
              </div>

              {/* Hex Command and Duration Info */}
              <div className="mt-4 pt-3 border-t border-neutral-800/80 flex items-center justify-between text-[11px] text-neutral-400">
                <div className="flex items-center gap-2 font-mono">
                  <span className="text-neutral-500">Cmd:</span>
                  <span className="text-orange-400 bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800">
                    {item.commandHex}
                  </span>
                </div>
                <span className="text-neutral-500 font-medium">Duração: {item.durationMs / 1000}s</span>
              </div>

              {/* Status / Last Result Feedback */}
              {result && (
                <div
                  className={`mt-3 p-2.5 rounded-xl text-xs flex items-center justify-between border ${
                    result.success
                      ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                      : 'bg-red-950/40 border-red-800/60 text-red-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                    <span className="line-clamp-1">{result.message}</span>
                  </div>
                  <span className="text-[10px] opacity-75 shrink-0 ml-2">{result.timestamp}</span>
                </div>
              )}

              {/* Action Button */}
              <div className="mt-4">
                <button
                  onClick={() => handleStartTest(item)}
                  disabled={!isConnected || isRunning || isBlockedByEngine}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    isRunning
                      ? 'bg-orange-600 text-white animate-pulse'
                      : isBlockedByEngine
                      ? 'bg-neutral-800/50 text-neutral-500 border border-neutral-800 cursor-not-allowed'
                      : !isConnected
                      ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white shadow-md shadow-orange-950/40 active:scale-[0.99]'
                  }`}
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Executando Teste ({item.durationMs / 1000}s)...</span>
                    </>
                  ) : isBlockedByEngine ? (
                    <span>Bloqueado (Desligue o motor)</span>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Executar Teste Ativo</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
