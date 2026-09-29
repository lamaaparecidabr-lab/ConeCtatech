import React, { useState } from 'react';
import {
  CheckCircle2,
  RefreshCw,
  Trash2,
  Wrench,
  Cpu,
  Fingerprint,
  Activity,
  Info,
  Clock,
  Gauge,
  ShieldCheck,
  AlertTriangle,
  KeyRound,
  FileText,
  Copy,
  Check,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { BANCO_ERROS_HARLEY } from '../services/j1850Decoder';

interface DiagnosticsPanelProps {
  rpm: number;
  vin?: string;
  ecuPartNumber?: string;
  ecuCalId?: string;
  ecuSoftwareLevel?: number;
  checkEngine: boolean;
  activeFaults: string[];
  historicFaults?: string[];
  odometerKm?: number;
  engineHoursTotal?: number;
  engineMinutesTotal?: number;
  engineIgnitionCycles?: number;
  onReadDTC: () => void;
  onClearDTC: () => void;
  isConnected: boolean;
}

export const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = ({
  rpm,
  vin,
  ecuPartNumber,
  ecuCalId,
  ecuSoftwareLevel,
  checkEngine,
  activeFaults = [],
  historicFaults = [],
  odometerKm,
  engineHoursTotal,
  engineMinutesTotal,
  engineIgnitionCycles,
  onReadDTC,
  onClearDTC,
  isConnected,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [justCleared, setJustCleared] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<'urban' | 'mixed' | 'highway'>('mixed');
  const [copiedReport, setCopiedReport] = useState(false);
  const [dtcFilter, setDtcFilter] = useState<'all' | 'critical'>('all');

  const handleDeepScan = () => {
    setIsScanning(true);
    onReadDTC();
    setTimeout(() => {
      setIsScanning(false);
    }, 1800);
  };

  const handleClear = () => {
    onClearDTC();
    setJustCleared(true);
    setTimeout(() => {
      setJustCleared(false);
    }, 3000);
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Calculations for quick sidebar and audit
  const totalHours = (engineHoursTotal || 0) + (engineMinutesTotal || 0) / 60;
  const avgSpeed = totalHours > 0 ? (odometerKm || 0) / totalHours : 0;
  const isKmAuditedValid = avgSpeed >= 22 && avgSpeed <= 65;

  const profileSpeeds = { urban: 26, mixed: 38, highway: 55 };
  const profileLabels = {
    urban: 'Urbano (~26 km/h)',
    mixed: 'Misto (~38 km/h)',
    highway: 'Rodoviário (~55 km/h)',
  };
  const speedUsed = profileSpeeds[selectedProfile];
  const estimatedKm = Math.round(totalHours * speedUsed);
  const minRangeKm = Math.round(estimatedKm * 0.88);
  const maxRangeKm = Math.round(estimatedKm * 1.12);
  const actualOdo = odometerKm || 0;
  const diffKm = actualOdo - estimatedKm;
  const diffPercent = estimatedKm > 0 ? (diffKm / estimatedKm) * 100 : 0;
  const diffSign = diffKm >= 0 ? '+' : '';
  const isWithinTolerance = actualOdo >= minRangeKm && actualOdo <= maxRangeKm;

  const handleCopyReport = () => {
    const now = new Date().toLocaleString('pt-BR');
    const activeText =
      activeFaults.length === 0
        ? '  • Nenhuma falha ativa registrada.'
        : activeFaults
            .map((c) => {
              const info = BANCO_ERROS_HARLEY[c];
              return `  • ${c}: ${info ? info.desc : 'Código gravado'} (Sistema: ${
                info ? info.category : 'BCM/ECM'
              })`;
            })
            .join('\n');

    const historicText =
      historicFaults.length === 0
        ? '  • Nenhuma falha histórica registrada.'
        : historicFaults
            .map((c) => {
              const info = BANCO_ERROS_HARLEY[c];
              return `  • ${c}: ${info ? info.desc : 'Código gravado'} (Sistema: ${
                info ? info.category : 'ECM'
              })`;
            })
            .join('\n');

    const report = `=====================================================
LAUDO DE DIAGNÓSTICO E AUDITORIA HARLEY-DAVIDSON (J1850)
Data/Hora: ${now}
=====================================================
IDENTIFICAÇÃO:
• Chassi (VIN): ${vin || 'N/D'}
• P/N ECM Delphi: ${ecuPartNumber || 'N/D'}
• Calibration ID: ${ecuCalId || 'N/D'}
• Software Level: ${ecuSoftwareLevel !== undefined ? `v${ecuSoftwareLevel}` : 'N/D'}
• Rotação no Momento: ${rpm} RPM

AUDITORIA DE HODÔMETRO vs HORÍMETRO DA ECM:
• Hodômetro do Painel Físico: ${actualOdo ? `${actualOdo.toLocaleString()} km` : 'N/D'}
• Horas de Motor Gravadas (ECM): ${engineHoursTotal !== undefined ? `${engineHoursTotal}h ${engineMinutesTotal || 0}m` : 'N/D'}
• Ciclos de Ignição (Partidas): ${engineIgnitionCycles !== undefined ? engineIgnitionCycles.toLocaleString() : 'N/D'}
• Média Histórica Geral: ${avgSpeed > 0 ? `${avgSpeed.toFixed(1)} km/h` : 'N/D'}
• Perfil de Uso Avaliado: ${profileLabels[selectedProfile]}
• Quilometragem Estimada pela ECU: ${estimatedKm > 0 ? `${estimatedKm.toLocaleString()} km` : 'N/D'}
• Variação Painel vs Motor: ${diffKm ? `${diffSign}${diffKm.toLocaleString()} km (${diffSign}${diffPercent.toFixed(1)}%)` : 'N/D'}

CÓDIGOS DE FALHA (DTCs):
• Luz de Injeção (MIL): ${checkEngine ? 'ACESO / ATIVO' : 'APAGADO / NORMAL'}
FALHAS ATUAIS (${activeFaults.length}):
${activeText}

FALHAS HISTÓRICAS (${historicFaults.length}):
${historicText}
=====================================================
Gerado via Harley J1850 VPW Diagnostic Tool
`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(report);
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2500);
    }
  };

  const displayedFaults =
    dtcFilter === 'all'
      ? activeFaults
      : activeFaults.filter((code) => {
          const info = BANCO_ERROS_HARLEY[code];
          return (
            info?.category?.toLowerCase().includes('igni') ||
            info?.category?.toLowerCase().includes('combust') ||
            info?.category?.toLowerCase().includes('injetor') ||
            code.startsWith('P02') ||
            code.startsWith('P03')
          );
        });

  return (
    <div className="w-full flex flex-col lg:flex-row items-start gap-6">
      {/* ========================================================
          BARRA LATERAL FIXA / STICKY (Painel de Controle e Navegação)
         ======================================================== */}
      <aside className="w-full lg:w-80 shrink-0 lg:sticky lg:top-24 space-y-4">
        {/* Card Principal da Barra Lateral */}
        <div className="bg-[#14151b] border border-neutral-800 rounded-2xl p-5 shadow-2xl space-y-4">
          {/* Header da Barra */}
          <div className="border-b border-neutral-800/80 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center shrink-0">
                <Wrench className="w-4 h-4 text-orange-500" />
              </div>
              <div>
                <h2 className="text-sm font-black text-neutral-100 uppercase tracking-wide">
                  Scanner Harley
                </h2>
                <div className="text-[11px] font-mono text-neutral-400">
                  J1850 VPW · Delphi EFI
                </div>
              </div>
            </div>

            <div className="mt-2.5 flex items-center justify-between bg-neutral-900/90 border border-neutral-800 px-2.5 py-1.5 rounded-lg text-[11px] font-mono">
              <span className="text-neutral-400">Barramento:</span>
              <span className="flex items-center gap-1.5 font-bold">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'
                  }`}
                />
                <span className={isConnected ? 'text-emerald-400' : 'text-neutral-400'}>
                  {isConnected ? 'Ativo (10.4 kbps)' : 'Desconectado'}
                </span>
              </span>
            </div>
          </div>

          {/* Botões de Ação Imediata */}
          <div className="space-y-2">
            <button
              onClick={handleDeepScan}
              disabled={!isConnected || isScanning}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white text-xs font-black rounded-xl transition-all shadow-lg shadow-orange-600/20 disabled:opacity-40 cursor-pointer"
              title="Executa identificação ECM Harley J1850 (3C), leitura de VIN/CalID/SW e consulta de DTCs dos módulos."
            >
              <RefreshCw
                className={`w-4 h-4 ${isScanning ? 'animate-spin text-white' : 'text-white'}`}
              />
              <span>{isScanning ? 'Lendo Central ECM...' : 'Ler Scanner Completo'}</span>
            </button>

            <button
              onClick={handleClear}
              disabled={!isConnected || (activeFaults.length === 0 && !justCleared)}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-all border shadow-md disabled:opacity-30 cursor-pointer ${
                justCleared
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600'
                  : 'bg-red-950/60 hover:bg-red-900/80 text-red-200 border-red-800/80'
              }`}
              title="Envia comando Harley J1850 14 aos módulos suportados e aguarda confirmação 54."
            >
              {justCleared ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <Trash2 className="w-4 h-4 text-red-400" />
              )}
              <span>
                {justCleared
                  ? 'Memória Apagada (14->54)!'
                  : `Limpar Falhas (${activeFaults.length.toString().padStart(2, '0')})`}
              </span>
            </button>

            <button
              onClick={handleCopyReport}
              className="w-full flex items-center justify-center gap-2 px-3.5 py-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 text-xs font-semibold rounded-xl border border-neutral-700/80 hover:border-neutral-600 transition-all cursor-pointer"
              title="Copia um relatório completo formatado para colar no WhatsApp, e-mail ou salvar"
            >
              {copiedReport ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-bold">Laudo Copiado!</span>
                </>
              ) : (
                <>
                  <FileText className="w-3.5 h-3.5 text-orange-400" />
                  <span>Copiar Laudo Técnico</span>
                </>
              )}
            </button>
          </div>

          {/* Mini-Cards de Resumo Vivo */}
          <div className="border-t border-neutral-800/80 pt-3 space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-bold">
              Resumo Instantâneo
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-[#0c0d12] border border-neutral-800/80 rounded-lg p-2">
                <span className="text-[10px] text-neutral-500 block">Giro ECM</span>
                <span className="text-sm font-bold text-orange-400 font-mono">
                  {rpm}{' '}
                  <span className="text-[10px] text-neutral-500 font-normal">rpm</span>
                </span>
              </div>

              <div className="bg-[#0c0d12] border border-neutral-800/80 rounded-lg p-2">
                <span className="text-[10px] text-neutral-500 block">Luz Injeção</span>
                <span
                  className={`text-xs font-bold ${
                    checkEngine ? 'text-red-400 animate-pulse' : 'text-emerald-400'
                  }`}
                >
                  {checkEngine ? 'ACESO (MIL)' : 'Normal'}
                </span>
              </div>

              <div className="bg-[#0c0d12] border border-neutral-800/80 rounded-lg p-2">
                <span className="text-[10px] text-neutral-500 block">Códigos DTC</span>
                <span
                  className={`text-sm font-bold ${
                    activeFaults.length > 0 ? 'text-red-400' : 'text-emerald-400'
                  }`}
                >
                  {activeFaults.length} {activeFaults.length === 1 ? 'erro' : 'erros'}
                </span>
              </div>

              <div className="bg-[#0c0d12] border border-neutral-800/80 rounded-lg p-2">
                <span className="text-[10px] text-neutral-500 block">Auditoria KM</span>
                <span
                  className={`text-xs font-bold ${
                    isKmAuditedValid ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {isKmAuditedValid ? 'Íntegro' : 'Atenção'}
                </span>
              </div>
            </div>
          </div>

          {/* Atalhos Rápidos de Navegação / Âncoras */}
          <div className="border-t border-neutral-800/80 pt-3 space-y-1">
            <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-bold mb-1.5">
              Navegar nas Seções
            </div>

            <button
              type="button"
              onClick={() => scrollToSection('sec-identificacao')}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-neutral-300 hover:text-white hover:bg-neutral-900 transition-all text-left cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Fingerprint className="w-3.5 h-3.5 text-emerald-400" />
                <span>Identificação (VIN / ECM)</span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-neutral-600" />
            </button>

            <button
              type="button"
              onClick={() => scrollToSection('sec-auditoria')}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-neutral-300 hover:text-white hover:bg-neutral-900 transition-all text-left cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-orange-400" />
                <span>Auditoria & KM por Perfil</span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-neutral-600" />
            </button>

            <button
              type="button"
              onClick={() => scrollToSection('sec-dtc')}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-neutral-300 hover:text-white hover:bg-neutral-900 transition-all text-left cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                <span>Códigos de Falha ({activeFaults.length})</span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-neutral-600" />
            </button>

            <button
              type="button"
              onClick={() => scrollToSection('sec-guia')}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-neutral-300 hover:text-white hover:bg-neutral-900 transition-all text-left cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Info className="w-3.5 h-3.5 text-blue-400" />
                <span>Guia Técnico J1850</span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-neutral-600" />
            </button>
          </div>
        </div>
      </aside>

      {/* ========================================================
          CONTEÚDO PRINCIPAL (Área de Leitura e Detalhes)
         ======================================================== */}
      <div className="flex-1 w-full space-y-6">
        {/* Banner Superior da Área Principal */}
        <div className="bg-[#14151b] border border-neutral-800 rounded-2xl p-5 shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-orange-500" />
              <h2 className="text-base font-bold text-neutral-100 uppercase tracking-wide">
                Scanner de Diagnóstico Harley-Davidson (J1850 / OBD2)
              </h2>
            </div>
            <p className="text-xs text-neutral-400 mt-1">
              Varredura de Chassi (VIN), P/N do Módulo de Injeção (ECM), Horas de Motor e Códigos Gravados
            </p>
          </div>
          <span className="text-[11px] font-mono text-neutral-400 bg-neutral-900/90 border border-neutral-800 px-3 py-1.5 rounded-xl shrink-0 self-start sm:self-auto">
            Nó 0x10 ECM Delphi · VPW
          </span>
        </div>

        {/* 1. SEÇÃO DE IDENTIFICAÇÃO (VIN / ECM / RPM) */}
        <div id="sec-identificacao" className="scroll-mt-24 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-400">
            <Fingerprint className="w-4 h-4 text-emerald-400" />
            <span>Identificação Eletrônica dos Módulos</span>
          </div>

          <div className="bg-[#161616] border border-neutral-800 rounded-2xl p-5 shadow-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Giro Atual */}
            <div className="bg-[#0f1015] border border-neutral-800/90 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-orange-500" />
                  <span>Giro Atual (RPM)</span>
                </div>
                <div className="font-mono text-2xl font-bold text-orange-500 mt-1">
                  {rpm} <span className="text-xs text-neutral-400 font-normal">RPM</span>
                </div>
              </div>
              <span className="text-xs font-mono text-neutral-500 bg-neutral-900/80 px-2 py-1 rounded border border-neutral-800">
                J1850
              </span>
            </div>

            {/* Chassi VIN */}
            <div className="bg-[#0f1015] border border-neutral-800/90 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Fingerprint className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Chassi (VIN)</span>
                </div>
                <div className="font-mono text-base font-bold text-emerald-400 mt-1 tracking-wider">
                  {vin || (isConnected ? 'N/D' : 'Desconectado')}
                </div>
              </div>
              <span className="text-xs font-mono text-neutral-500 bg-neutral-900/80 px-2 py-1 rounded border border-neutral-800">
                7C 0F-11
              </span>
            </div>

            {/* P/N da ECM */}
            <div className="bg-[#0f1015] border border-neutral-800/90 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-blue-400" />
                  <span>P/N da ECM</span>
                </div>
                <div className="font-mono text-base font-bold text-blue-400 mt-1 tracking-wider">
                  {ecuPartNumber || (isConnected ? 'N/D' : 'Desconectado')}
                </div>
              </div>
              <span className="text-xs font-mono text-neutral-500 bg-neutral-900/80 px-2 py-1 rounded border border-neutral-800">
                7C 01-02
              </span>
            </div>

            {/* Calibration ID & SW Level */}
            <div className="bg-[#0f1015] border border-neutral-800/90 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-purple-400" />
                  <span>Cal ID / SW</span>
                </div>
                <div className="font-mono text-sm font-bold text-purple-300 mt-1 tracking-wider">
                  {ecuCalId || (isConnected ? 'N/D' : 'Desconectado')}
                  {ecuSoftwareLevel !== undefined && (
                    <span className="text-xs font-normal text-neutral-400 ml-1.5">v{ecuSoftwareLevel}</span>
                  )}
                </div>
              </div>
              <span className="text-xs font-mono text-neutral-500 bg-neutral-900/80 px-2 py-1 rounded border border-neutral-800">
                7C 03-0B
              </span>
            </div>
          </div>
        </div>

        {/* 2. SEÇÃO DE AUDITORIA DE KM & HORAS (Análise Anti-Fraude J1850) */}
        <div id="sec-auditoria" className="scroll-mt-24">
          <div className="bg-[#14151b] border border-orange-500/30 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-neutral-800 gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-orange-500" />
                <h3 className="text-base font-bold text-neutral-100 uppercase tracking-wide">
                  Auditoria da ECM Delphi vs Velocímetro (Verificação de KM Real)
                </h3>
              </div>
              <span className="text-[11px] font-mono text-neutral-400 bg-neutral-900 border border-neutral-800 px-2.5 py-1 rounded">
                Nó 0x60 (Painel) · Nó 0x10 (ECU)
              </span>
            </div>

            {/* Audit Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Odômetro Total do Painel */}
              <div className="bg-[#0f1015] border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-neutral-400 text-xs font-mono mb-2">
                  <span className="flex items-center gap-1.5 uppercase">
                    <Gauge className="w-3.5 h-3.5 text-orange-400" />
                    Odômetro Total
                  </span>
                  <span className="text-[10px] text-neutral-400 bg-neutral-900 px-1.5 py-0.5 rounded">
                    Velocímetro
                  </span>
                </div>
                <div>
                  <div className="text-2xl font-black font-mono text-neutral-100">
                    {(odometerKm || 0).toLocaleString()} <span className="text-xs text-orange-400 font-normal">KM</span>
                  </div>
                  <div className="text-[11px] text-neutral-400 mt-1 font-mono">
                    ≈ {Math.round((odometerKm || 0) * 0.621371).toLocaleString()} Milhas
                  </div>
                </div>
              </div>

              {/* Card 2: Horímetro Gravado na ECU */}
              <div className="bg-[#0f1015] border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-neutral-400 text-xs font-mono mb-2">
                  <span className="flex items-center gap-1.5 uppercase">
                    <Clock className="w-3.5 h-3.5 text-blue-400" />
                    Horas de Motor
                  </span>
                  <span className="text-[10px] text-blue-400 bg-blue-950/60 border border-blue-900/60 px-1.5 py-0.5 rounded">
                    ECM Delphi
                  </span>
                </div>
                <div>
                  <div className="text-2xl font-black font-mono text-blue-400">
                    {engineHoursTotal}h <span className="text-sm font-semibold text-neutral-300">{engineMinutesTotal}m</span>
                  </div>
                  <div className="text-[11px] text-neutral-400 mt-1 font-mono">
                    Tempo total com RPM &gt; 0
                  </div>
                </div>
              </div>

              {/* Card 3: Partidas / Ciclos de Ignição */}
              <div className="bg-[#0f1015] border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-neutral-400 text-xs font-mono mb-2">
                  <span className="flex items-center gap-1.5 uppercase">
                    <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                    Partidas (Key-On)
                  </span>
                  <span className="text-[10px] text-neutral-400 bg-neutral-900 px-1.5 py-0.5 rounded">
                    Contador ECU
                  </span>
                </div>
                <div>
                  <div className="text-2xl font-black font-mono text-amber-400">
                    {engineIgnitionCycles ? engineIgnitionCycles.toLocaleString() : '---'}
                  </div>
                  <div className="text-[11px] text-neutral-400 mt-1 font-mono">
                    {engineIgnitionCycles && odometerKm
                      ? `Média de ${(odometerKm / engineIgnitionCycles).toFixed(1)} km/trajeto`
                      : 'Ciclos de ignição'}
                  </div>
                </div>
              </div>

              {/* Card 4: Média Histórica de Velocidade */}
              <div className="bg-[#0f1015] border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-neutral-400 text-xs font-mono mb-2">
                  <span className="flex items-center gap-1.5 uppercase">
                    <Activity className="w-3.5 h-3.5 text-emerald-400" />
                    Média Histórica
                  </span>
                  <span className="text-[10px] text-neutral-400 bg-neutral-900 px-1.5 py-0.5 rounded">
                    KM ÷ Horas
                  </span>
                </div>
                <div>
                  <div className="text-2xl font-black font-mono text-emerald-400">
                    {avgSpeed.toFixed(1)} <span className="text-xs text-neutral-400 font-normal">km/h</span>
                  </div>
                  <div className="text-[11px] text-neutral-400 mt-1 font-mono">
                    Padrão Harley: 30 a 55 km/h
                  </div>
                </div>
              </div>
            </div>

            {/* Estimativa de Quilometragem por Perfil de Uso da Moto (Interativo) */}
            <div className="bg-[#0c0d12] border border-neutral-800 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-800/80 pb-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-orange-400 flex items-center gap-2">
                    <span>⚡ Estimativa de KM Real da ECU por Perfil de Uso</span>
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Clique no perfil habitual desta motocicleta para calcular a quilometragem provável do motor:
                  </p>
                </div>
                <span className="text-[10px] font-mono text-neutral-400 bg-neutral-900 px-2.5 py-1 rounded border border-neutral-800 self-start sm:self-auto">
                  Base: {engineHoursTotal}h {engineMinutesTotal}m
                </span>
              </div>

              {/* 3 Botões de Perfil Selecionáveis */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 1. Urbano */}
                <button
                  type="button"
                  onClick={() => setSelectedProfile('urban')}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    selectedProfile === 'urban'
                      ? 'bg-orange-950/40 border-orange-500 shadow-md shadow-orange-500/10 ring-1 ring-orange-500/50'
                      : 'bg-[#12131a] border-neutral-800 hover:border-neutral-700 opacity-70 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xl">🏙️</span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                        selectedProfile === 'urban'
                          ? 'bg-orange-500 text-black font-bold'
                          : 'bg-neutral-900 text-neutral-400'
                      }`}
                    >
                      ~26 km/h
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="font-bold text-xs text-neutral-200">Urbano / Cidade</div>
                    <div className="text-[11px] text-neutral-400 mt-0.5 leading-snug">
                      Trânsito pesado, semáforos frequentes e pequenos trajetos
                    </div>
                  </div>
                </button>

                {/* 2. Misto (Padrão) */}
                <button
                  type="button"
                  onClick={() => setSelectedProfile('mixed')}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    selectedProfile === 'mixed'
                      ? 'bg-orange-950/40 border-orange-500 shadow-md shadow-orange-500/10 ring-1 ring-orange-500/50'
                      : 'bg-[#12131a] border-neutral-800 hover:border-neutral-700 opacity-70 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xl">⚖️</span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                        selectedProfile === 'mixed'
                          ? 'bg-orange-500 text-black font-bold'
                          : 'bg-neutral-900 text-orange-400'
                      }`}
                    >
                      ~38 km/h (Padrão HD)
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="font-bold text-xs text-neutral-200">Misto (Equilibrado)</div>
                    <div className="text-[11px] text-neutral-400 mt-0.5 leading-snug">
                      Uso padrão Harley: tráfego urbano + rodovias nos fins de semana
                    </div>
                  </div>
                </button>

                {/* 3. Rodoviário */}
                <button
                  type="button"
                  onClick={() => setSelectedProfile('highway')}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    selectedProfile === 'highway'
                      ? 'bg-orange-950/40 border-orange-500 shadow-md shadow-orange-500/10 ring-1 ring-orange-500/50'
                      : 'bg-[#12131a] border-neutral-800 hover:border-neutral-700 opacity-70 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xl">🛣️</span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                        selectedProfile === 'highway'
                          ? 'bg-orange-500 text-black font-bold'
                          : 'bg-neutral-900 text-neutral-400'
                      }`}
                    >
                      ~55 km/h
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="font-bold text-xs text-neutral-200">Rodoviário / Viagens</div>
                    <div className="text-[11px] text-neutral-400 mt-0.5 leading-snug">
                      Moto de passeio longo, viagens interestaduais e cruzeiro contínuo
                    </div>
                  </div>
                </button>
              </div>

              {/* Resultado do Cálculo da Estimativa da ECU */}
              <div className="bg-[#12131b] border border-neutral-800 rounded-xl p-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-neutral-800">
                  {/* Estimativa Central */}
                  <div className="sm:pr-4">
                    <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider block">
                      KM Estimada pela ECU ({profileLabels[selectedProfile]})
                    </span>
                    <div className="text-2xl font-black font-mono text-orange-400 mt-1">
                      {estimatedKm.toLocaleString()}{' '}
                      <span className="text-xs text-neutral-400 font-normal">KM</span>
                    </div>
                    <div className="text-[11px] text-neutral-400 mt-0.5 font-mono">
                      Faixa provável: {minRangeKm.toLocaleString()} ~ {maxRangeKm.toLocaleString()} km
                    </div>
                  </div>

                  {/* Odômetro Físico do Painel */}
                  <div className="pt-3 sm:pt-0 sm:px-4">
                    <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider block">
                      Hodômetro no Painel Físico
                    </span>
                    <div className="text-2xl font-black font-mono text-neutral-100 mt-1">
                      {actualOdo.toLocaleString()}{' '}
                      <span className="text-xs text-neutral-400 font-normal">KM</span>
                    </div>
                    <div className="text-[11px] text-neutral-400 mt-0.5 font-mono">
                      Lido do velocímetro (Nó 0x60)
                    </div>
                  </div>

                  {/* Comparativo / Diferença */}
                  <div className="pt-3 sm:pt-0 sm:pl-4">
                    <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider block">
                      Variação Painel vs Motor
                    </span>
                    <div
                      className={`text-2xl font-black font-mono mt-1 ${
                        isWithinTolerance
                          ? 'text-emerald-400'
                          : diffKm < 0
                          ? 'text-red-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {diffSign}
                      {diffKm.toLocaleString()}{' '}
                      <span className="text-xs font-normal">
                        KM ({diffSign}
                        {diffPercent.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="text-[11px] mt-0.5 font-semibold">
                      {isWithinTolerance ? (
                        <span className="text-emerald-400 flex items-center gap-1">
                          ✓ Alinhamento perfeito com o motor
                        </span>
                      ) : diffKm < 0 ? (
                        <span className="text-red-400">
                          ⚠ Painel marca menos que o previsto
                        </span>
                      ) : (
                        <span className="text-amber-400">
                          ℹ Painel acima da média deste perfil
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Veredito Geral de Autenticidade */}
            {avgSpeed >= 22 && avgSpeed <= 65 ? (
              <div className="bg-emerald-950/30 border border-emerald-600/50 rounded-xl p-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-sm font-bold text-emerald-300">
                    Histórico Compatível: Quilometragem Consistente com a ECU
                  </div>
                  <p className="text-xs text-emerald-200/80 leading-relaxed">
                    A velocidade média histórica calculada ({avgSpeed.toFixed(1)} km/h) está rigorosamente dentro da faixa típica de uso de motocicletas Harley-Davidson (mistura de tráfego urbano, marcha lenta em semáforos e viagens rodoviárias). Não há indício de velocímetro trocado ou desconectado.
                  </p>
                </div>
              </div>
            ) : avgSpeed < 22 && totalHours > 50 ? (
              <div className="bg-red-950/40 border border-red-600/60 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-sm font-bold text-red-300">
                    Alerta de Divergência: Horas de Motor Elevadas para o KM
                  </div>
                  <p className="text-xs text-red-200/80 leading-relaxed">
                    A velocidade média calculada ({avgSpeed.toFixed(1)} km/h) é incompativelmente baixa para o tempo de motor ligado ({engineHoursTotal} horas). Isso é um forte indício de que o velocímetro foi substituído por uma unidade mais nova, rodou desconectado ou teve sua quilometragem adulterada.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-amber-950/30 border border-amber-600/50 rounded-xl p-4 flex items-start gap-3">
                <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-sm font-bold text-amber-300">
                    Média de Velocidade Elevada ({avgSpeed.toFixed(1)} km/h)
                  </div>
                  <p className="text-xs text-amber-200/80 leading-relaxed">
                    A média calculada indica uso predominantemente rodoviário ou velocímetro com quilometragem superior às horas de uso gravadas nesta central ECM.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 3. SEÇÃO DE CÓDIGOS DE FALHA (DTC CONTAINER) */}
        <div id="sec-dtc" className="scroll-mt-24 space-y-4">
          {/* 3A. FALHAS ATUAIS (Nó 0x40 / Ativas) */}
          <div className="bg-[#161616] border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-neutral-800 pb-3 gap-3">
              <div className="flex items-center gap-2">
                <div className="text-sm font-bold uppercase tracking-wider text-red-500">
                  Falhas Atuais / Presentes (DTC Atual)
                </div>
                <span className="text-[10px] font-mono bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded font-bold text-neutral-300">
                  Total: {activeFaults.length}
                </span>
                {checkEngine && (
                  <span className="text-[10px] font-mono bg-red-950/80 text-red-300 border border-red-700 px-2 py-0.5 rounded-full font-bold uppercase animate-pulse">
                    Luz de Injeção (MIL) Ativa
                  </span>
                )}
              </div>
            </div>

            {activeFaults.length === 0 ? (
              <div className="py-6 text-center flex flex-col items-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-2" />
                <div className="text-emerald-400 italic text-sm font-medium">
                  {isConnected ? 'Nenhuma falha ativa registrada no momento.' : 'Aguardando leitura do scanner.'}
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  Não há falha persistente acendendo a lâmpada de injeção.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {activeFaults.map((code) => {
                  const errInfo = BANCO_ERROS_HARLEY[code] || {
                    desc: 'Código registrado pela ECU Harley',
                    category: 'Injeção / Módulo',
                    tip: 'Consulte o manual de serviço para detalhamento do circuito.',
                  };

                  return (
                    <li
                      key={`active-${code}`}
                      className="bg-[#1e1111] border-l-4 border-red-500 border-y border-r border-red-950/60 rounded-r-xl p-4 transition-all hover:bg-[#251313]"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 font-mono">
                            <span className="text-lg font-black text-red-400 bg-red-950/80 px-2.5 py-0.5 rounded border border-red-800">
                              {code}
                            </span>
                            <span className="text-sm font-bold text-neutral-100">
                              {errInfo.desc}
                            </span>
                          </div>
                          <div className="text-xs text-neutral-400 flex items-center gap-2">
                            <span className="text-orange-400">Sistema: {errInfo.category}</span>
                            <span className="text-neutral-600">•</span>
                            <span className="text-red-400 font-semibold">Estado: Falha Ativa</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-2.5 text-xs bg-black/40 p-2.5 rounded-lg border border-neutral-800/80 text-neutral-300">
                        <span className="text-orange-400 font-bold">Diagnóstico mecânico: </span>
                        {errInfo.tip}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* 3B. FALHAS HISTÓRICAS (Nó 0x10 / ECM) */}
          <div className="bg-[#161616] border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-neutral-800 pb-3 gap-3">
              <div className="flex items-center gap-2">
                <div className="text-sm font-bold uppercase tracking-wider text-amber-500">
                  Falhas Históricas Gravadas na ECM (DTC Histórico)
                </div>
                <span className="text-[10px] font-mono bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded font-bold text-neutral-300">
                  Total: {historicFaults.length}
                </span>
              </div>
            </div>

            {historicFaults.length === 0 ? (
              <div className="py-6 text-center flex flex-col items-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-2" />
                <div className="text-emerald-400 italic text-sm font-medium">
                  {isConnected ? 'Nenhuma falha histórica armazenada na memória da ECM.' : 'Aguardando leitura do scanner.'}
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  A memória histórica da ECM não contém ocorrências passadas pendentes.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {historicFaults.map((code) => {
                  const errInfo = BANCO_ERROS_HARLEY[code] || {
                    desc: 'Código gravado no histórico da ECM',
                    category: 'Histórico ECM',
                    tip: 'Falha intermitente ou passada registrada pela central.',
                  };

                  return (
                    <li
                      key={`hist-${code}`}
                      className="bg-[#1a1711] border-l-4 border-amber-500 border-y border-r border-amber-950/60 rounded-r-xl p-4 transition-all hover:bg-[#211d14]"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 font-mono">
                            <span className="text-lg font-black text-amber-400 bg-amber-950/80 px-2.5 py-0.5 rounded border border-amber-800">
                              {code}
                            </span>
                            <span className="text-sm font-bold text-neutral-100">
                              {errInfo.desc}
                            </span>
                          </div>
                          <div className="text-xs text-neutral-400 flex items-center gap-2">
                            <span className="text-orange-400">Sistema: {errInfo.category}</span>
                            <span className="text-neutral-600">•</span>
                            <span className="text-amber-400 font-semibold">Estado: Histórico Gravado</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-2.5 text-xs bg-black/40 p-2.5 rounded-lg border border-neutral-800/80 text-neutral-300">
                        <span className="text-orange-400 font-bold">Diagnóstico mecânico: </span>
                        {errInfo.tip}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* 4. GUIA TÉCNICO E PROTOCOLO HARLEY J1850 */}
        <div id="sec-guia" className="scroll-mt-24">
          <div className="bg-[#14151b] border border-neutral-800 rounded-2xl p-5 text-xs text-neutral-400 space-y-3">
            <div className="font-bold text-neutral-200 uppercase tracking-wider flex items-center gap-2">
              <Info className="w-4 h-4 text-orange-500" />
              Protocolo Harley-Davidson J1850 VPW
            </div>
            <p className="leading-relaxed">
              O diagnóstico Harley-Davidson opera no barramento SAE J1850 VPW (10.4 kbps) através de comandos específicos mapeados pela comunidade:
            </p>
            <ul className="list-disc list-inside space-y-1 text-neutral-300 font-mono text-[11px]">
              <li><strong className="text-orange-400">Identificação (ATSH 0C 10 F1):</strong> 3C 01/02 (P/N), 3C 03/04 (CalID), 3C 0B (Software Level), 3C 0F/10/11 (VIN).</li>
              <li><strong className="text-orange-400">DTCs (ATSH 6C XX F1 19 52 FF 00):</strong> Nó 0x10 (DTCs Históricos ECM), Nó 0x40 (DTCs Atuais BCM/TSM), Nó 0x60 (Painel).</li>
              <li><strong className="text-orange-400">Limpeza (ATSH 6C XX F1 14):</strong> Apagamento sequencial com validação da resposta 54 antes de restaurar o monitoramento.</li>
            </ul>
            <p className="leading-relaxed text-neutral-500">
              Para retornar ao monitoramento de rotação, velocidade e marcha em tempo real, clique na aba Painel no topo da tela.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
