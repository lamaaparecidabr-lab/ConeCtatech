import React, { useState, useEffect, useRef } from 'react';
import {
  Bluetooth,
  Gauge,
  Terminal as TerminalIcon,
  Wrench,
  Volume2,
  VolumeX,
  Power,
  Play,
  Info,
  Layers,
  Sliders,
  Activity,
  FileSpreadsheet,
  Menu,
  Palette,
} from 'lucide-react';
import { TelemetryData, ConnectionConfig, ConnectionType, PacketLog } from './types';
import { ELM327Connection } from './services/elm327Connection';
import { soundEngine } from './services/soundEngine';
import { GaugeTachometer } from './components/GaugeTachometer';
import { GaugeSpeedometer } from './components/GaugeSpeedometer';
import { IndicatorsBar } from './components/IndicatorsBar';
import { EngineMetrics } from './components/EngineMetrics';
import { TerminalConsole } from './components/TerminalConsole';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { SimulatorControls } from './components/SimulatorControls';
import { ConnectionModal } from './components/ConnectionModal';
import { ClassicGaugeCluster } from './components/ClassicGaugeCluster';
import { MilButton } from './components/MilButton';
import { ActuatorsPanel } from './components/ActuatorsPanel';
import { OxygenSensorsPanel } from './components/OxygenSensorsPanel';
import { DataloggerPanel } from './components/DataloggerPanel';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import { VehicleIdentityCard } from './components/VehicleIdentityCard';
import conectAutoMark from './assets/branding/conectauto-mark.png';
import { V2Dashboard } from './components/V2Dashboard';


type UiSkin = 'original' | 'orange' | 'dark';

const INITIAL_TELEMETRY: TelemetryData = {
  rpm: 0,
  speedKmH: 0,
  speedMph: 0,
  engineTempF: 0,
  engineTempC: 0,
  batteryVoltage: 0,
  gear: 'N',
  turnLeft: false,
  turnRight: false,
  neutral: true,
  checkEngine: false,
  oilWarning: false,
  highBeam: false,
  clutchEngaged: false,
  activeDtcList: [],
  historicDtcList: [],
  lastUpdated: Date.now(),
};

export default function App() {
  const [telemetry, setTelemetry] = useState<TelemetryData>(INITIAL_TELEMETRY);
  const [connectionType, setConnectionType] = useState<ConnectionType>('disconnected');
  const [statusMessage, setStatusMessage] = useState<string>('Desconectado');
  const [statusIsError, setStatusIsError] = useState<boolean>(false);
  const [logs, setLogs] = useState<PacketLog[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'diagnostics' | 'actuators' | 'oxygen' | 'datalogger' | 'terminal'>('dashboard');
  const [dashboardStyle, setDashboardStyle] = useState<'classic' | 'analog'>('classic');
  const [activeDtcList, setActiveDtcList] = useState<string[]>([]);
  const [historicDtcList, setHistoricDtcList] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSoundMuted, setIsSoundMuted] = useState(true);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [uiSkin, setUiSkin] = useState<UiSkin>(() => {
    const saved = localStorage.getItem('conectaharley-ui-skin');
    return saved === 'orange' || saved === 'dark' || saved === 'original' ? saved : 'original';
  });

  useEffect(() => {
    localStorage.setItem('conectaharley-ui-skin', uiSkin);
  }, [uiSkin]);

  // Configuration
  const [config, setConfig] = useState<ConnectionConfig>({
    protocol: 'ATSP2', // SAE VPW Harley (standard for Harley)
    speedUnit: 'kmh',
    tempUnit: 'celsius',
    monitorMode: true,
    soundEnabled: false,
  });

  const connectionRef = useRef<ELM327Connection | null>(null);

  // Initialize connection instance on mount
  useEffect(() => {
    const conn = new ELM327Connection(
      (newTelemetry) => {
        setTelemetry((prev) => ({
          ...prev,
          ...newTelemetry,
        }));
        if (newTelemetry.activeDtcList !== undefined) {
          setActiveDtcList(newTelemetry.activeDtcList);
        }
        if (newTelemetry.historicDtcList !== undefined) {
          setHistoricDtcList(newTelemetry.historicDtcList);
        }
      },
      (newPacket) => {
        setLogs((prev) => {
          // Mantém o histórico útil para diagnóstico sem deixar o tráfego bruto do
          // transporte/ATMA apagar Scanner, DTC, erros e respostas ativas.
          const decoded = newPacket.decoded || '';
          const isVerboseTransport =
            decoded.startsWith('[RX-CHUNK]') ||
            decoded.startsWith('[RX-LINE]') ||
            decoded.startsWith('[BLE-RX-RAW]') ||
            decoded.startsWith('[SERIAL-RX-RAW]') ||
            decoded.startsWith('[BLE-TX-RAW]') ||
            decoded.startsWith('[SERIAL-TX-RAW]') ||
            decoded.startsWith('[BLE-TX-MODE]');

          // Tráfego de transporte foi essencial para validar o buffer RX, mas não
          // pertence ao log operacional normal. Frames decodificados, desconhecidos,
          // comandos, DTCs, erros e eventos do Scanner continuam preservados.
          if (isVerboseTransport) return prev;

          const updated = [...prev, newPacket];
          const MAX_LOGS = 5000;
          if (updated.length <= MAX_LOGS) return updated;

          // Ao atingir o limite, descarte primeiro telemetria repetitiva; nunca
          // sacrifique eventos de diagnóstico para abrir espaço para RPM/velocidade/temp.
          const discardableIndex = updated.findIndex((p) =>
            p.type !== 'error' && ['RPM', 'SPEED', 'TEMP'].includes(p.tag || '')
          );
          if (discardableIndex >= 0) {
            updated.splice(discardableIndex, 1);
            return updated;
          }
          return updated.slice(-MAX_LOGS);
        });
      },
      (msg, isErr) => {
        setStatusMessage(msg);
        setStatusIsError(!!isErr);
        if (conn) {
          setConnectionType(conn.getConnectionType());
        }
      }
    );

    connectionRef.current = conn;

    return () => {
      conn.disconnect();
      soundEngine.stop();
    };
  }, []);

  // Update sound engine on RPM change
  useEffect(() => {
    soundEngine.updateRpm(telemetry.rpm);
  }, [telemetry.rpm]);

  const handleConnectBluetooth = async () => {
    if (connectionRef.current) {
      await connectionRef.current.connectBluetooth(config);
      setConnectionType(connectionRef.current.getConnectionType());
    }
  };

  const handleConnectSerial = async () => {
    if (connectionRef.current) {
      await connectionRef.current.connectSerial(config);
      setConnectionType(connectionRef.current.getConnectionType());
    }
  };

  const handleStartSimulator = () => {
    if (connectionRef.current) {
      connectionRef.current.startSimulator();
      setConnectionType('simulator');
      soundEngine.init();
      soundEngine.start();
    }
  };

  const handleDisconnect = () => {
    if (connectionRef.current) {
      connectionRef.current.disconnect();
      setConnectionType('disconnected');
      setTelemetry(INITIAL_TELEMETRY);
      setActiveDtcList([]);
      setHistoricDtcList([]);
      soundEngine.stop();
    }
  };

  const handleSendCommand = (cmd: string) => {
    if (connectionRef.current) {
      connectionRef.current.sendCommand(cmd);
    }
  };

  // Alterna entre Dashboard e Diagnóstico (idêntico ao botão da injeção do referência técnica original)
  const handleAlternarTela = async () => {
    if (activeTab === 'dashboard') {
      setActiveTab('diagnostics');
      await requisitarDadosFiltroDiag();
    } else {
      setActiveTab('dashboard');
      await retornarModoContinuo();
    }
  };

  const requisitarDadosFiltroDiag = async () => {
    if (connectionRef.current) {
      await connectionRef.current.requestHarleyDiagnostics();
    }
  };

  const retornarModoContinuo = async () => {
    if (connectionRef.current) {
      await connectionRef.current.resumeLiveDashboard();
    }
  };

  const handleClearDTC = async () => {
    if (connectionRef.current) {
      setStatusMessage('Executando limpeza de falhas Harley...');
      const ok = await connectionRef.current.clearDTC();
      if (ok) {
        // Limpa a apresentação local imediatamente, como confirmação visual da operação.
        setActiveDtcList([]);
        setHistoricDtcList([]);
        setTelemetry((prev) => ({
          ...prev,
          activeDtcList: [],
          historicDtcList: [],
          checkEngine: false,
        }));

        // referência técnica restaura a leitura normal 2 s após o comando de limpeza.
        // Fazemos a releitura para que uma falha ainda presente reapareça como CURRENT/HISTORIC
        // conforme a resposta real da moto, em vez de manter a UI artificialmente zerada.
        await new Promise((resolve) => setTimeout(resolve, 2000));
        setStatusMessage('Revalidando falhas após a limpeza...');
        await connectionRef.current.requestHarleyDiagnostics();
      }
    }
  };

  const handleToggleSound = () => {
    const nextMuted = !isSoundMuted;
    setIsSoundMuted(nextMuted);
    soundEngine.init();
    if (!nextMuted) {
      soundEngine.start();
      soundEngine.setMuted(false);
    } else {
      soundEngine.setMuted(true);
    }
  };

  const isConnected = connectionType !== 'disconnected';

  return (
    <div className={`app-shell skin-${uiSkin} min-h-screen bg-[#0d0d0d] text-neutral-100 flex flex-col font-sans selection:bg-orange-500/30 overflow-x-hidden w-full max-w-full`}>
      {/* Top Header com Botão MIL Injeção idêntico ao original */}
      <header className="app-header border-b border-neutral-900 bg-[#121212] sticky top-0 z-40 px-3 sm:px-4 py-2.5 sm:py-3 shadow-md w-full">
        {/* Row 1: Brand & Top Action Buttons */}
        <div className="app-header-main max-w-6xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
          {/* Logo & ConeCtaHarley Title */}
          <div className="app-brand flex items-center gap-2.5 sm:gap-3 min-w-0">
            <>
              <div className="skin-logo skin-logo-conectauto"><img src={conectAutoMark} alt="ConeCtaHarley" className="h-11 w-11 rounded-lg object-cover" /></div>
              <div className="min-w-0">
                <div className="skin-wordmark normal-case"><span className="text-white">ConeCta</span><span className={uiSkin === 'dark' ? 'text-[#ef1b24]' : 'text-[#ff6600]'}>Harley</span><span className="v2-badge">2.0</span></div>
                <p className="v2-brand-subtitle">Diagnóstico · Monitoramento · Scanner</p>
              </div>
            </>
          </div>

          {/* Right Action Icons & Connect Button */}
          <div className="app-header-actions flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* O Ícone da Injeção (Botão MIL Alternador de Telas) */}
            <MilButton
              isActive={telemetry.checkEngine}
              activeScreen={activeTab}
              onClick={handleAlternarTela}
            />

            {/* PWA Install Button */}
            <PWAInstallButton />

            {/* Audio V-Twin Engine */}
            <button
              onClick={handleToggleSound}
              className={`p-1.5 sm:p-2 rounded-xl border transition-colors cursor-pointer shrink-0 ${
                !isSoundMuted
                  ? 'bg-orange-950/60 border-orange-700 text-orange-400'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200'
              }`}
              title={isSoundMuted ? 'Ativar som V-Twin Harley' : 'Silenciar áudio'}
            >
              {!isSoundMuted ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Connect / Disconnect Action */}
            {isConnected ? (
              <button
                onClick={handleDisconnect}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/80 hover:bg-red-900 text-red-200 text-xs font-bold border border-red-800 rounded-xl transition-colors cursor-pointer"
              >
                <Power className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Desconectar</span>
              </button>
            ) : (
              <button
                id="btn-conectar"
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 bg-[#ff6600] hover:bg-[#e05500] text-white text-xs font-extrabold uppercase tracking-wider rounded-xl shadow-lg shadow-orange-600/30 transition-all hover:scale-[1.02] cursor-pointer shrink-0"
              >
                <Bluetooth className="w-3.5 h-3.5" />
                <span>Conectar</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile-only navigation: keep desktop/tablet navigation unchanged. */}
        <div className="mobile-nav-shell">
          <div className="mobile-nav-primary">
            <button onClick={() => { setActiveTab('dashboard'); setMobileMoreOpen(false); if (isConnected) retornarModoContinuo(); }} className={activeTab === 'dashboard' ? 'active' : ''}><Gauge /><span>Painel</span></button>
            <button onClick={() => { setActiveTab('diagnostics'); setMobileMoreOpen(false); }} className={activeTab === 'diagnostics' ? 'active' : ''}><Wrench /><span>Diagnóstico</span></button>
            <button onClick={() => setMobileMoreOpen((v) => !v)} className={mobileMoreOpen || ['actuators','oxygen','datalogger','terminal'].includes(activeTab) ? 'active' : ''}><Menu /><span>Mais</span></button>
          </div>
          {mobileMoreOpen && (
            <div className="mobile-more-panel">
              <button onClick={() => { setActiveTab('actuators'); setMobileMoreOpen(false); }}><Sliders /><span>Atuadores</span></button>
              <button onClick={() => { setActiveTab('oxygen'); setMobileMoreOpen(false); }}><Activity /><span>Sondas O₂ / AFR</span></button>
              <button onClick={() => { setActiveTab('datalogger'); setMobileMoreOpen(false); }}><FileSpreadsheet /><span>Datalogger</span></button>
              <button onClick={() => { setActiveTab('terminal'); setMobileMoreOpen(false); }}><TerminalIcon /><span>Terminal</span></button>
              <div className="mobile-appearance">
                <span><Palette /> Aparência</span>
                <div>
                  <button type="button" onClick={() => setUiSkin('original')} className={uiSkin === 'original' ? 'active' : ''}>Original</button>
                  <button type="button" onClick={() => setUiSkin('orange')} className={uiSkin === 'orange' ? 'active' : ''}>Orange</button>
                  <button type="button" onClick={() => setUiSkin('dark')} className={uiSkin === 'dark' ? 'active' : ''}>Dark</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Row 2: Desktop/tablet navigation strip */}
        <div className="app-nav-wrap max-w-6xl mx-auto mt-2 pt-2 border-t border-neutral-900/90 w-full overflow-hidden">
          <nav className="app-nav flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth touch-pan-x py-0.5">
            <button
              onClick={() => {
                setActiveTab('dashboard');
                if (isConnected) retornarModoContinuo();
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 whitespace-nowrap cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-[#ff6600] text-white shadow-md shadow-orange-600/30'
                  : 'bg-neutral-900/60 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
              }`}
            >
              <Gauge className="w-3.5 h-3.5" />
              <span>Painel</span>
            </button>

            <button
              onClick={() => {
                // Abrir a tela de diagnóstico não deve iniciar uma segunda varredura
                // automaticamente. A leitura é iniciada explicitamente pelo botão
                // do DiagnosticsPanel (onReadDTC).
                setActiveTab('diagnostics');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 whitespace-nowrap cursor-pointer ${
                activeTab === 'diagnostics'
                  ? 'bg-[#ff6600] text-white shadow-md shadow-orange-600/30'
                  : 'bg-neutral-900/60 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Diagnóstico</span>
            </button>

            <button
              onClick={() => setActiveTab('actuators')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 whitespace-nowrap cursor-pointer ${
                activeTab === 'actuators'
                  ? 'bg-[#ff6600] text-white shadow-md shadow-orange-600/30'
                  : 'bg-neutral-900/60 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Atuadores</span>
            </button>

            <button
              onClick={() => setActiveTab('oxygen')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 whitespace-nowrap cursor-pointer ${
                activeTab === 'oxygen'
                  ? 'bg-[#ff6600] text-white shadow-md shadow-orange-600/30'
                  : 'bg-neutral-900/60 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Sondas O₂ / AFR</span>
            </button>

            <button
              onClick={() => setActiveTab('datalogger')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 whitespace-nowrap cursor-pointer ${
                activeTab === 'datalogger'
                  ? 'bg-[#ff6600] text-white shadow-md shadow-orange-600/30'
                  : 'bg-neutral-900/60 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Datalogger</span>
            </button>

            <button
              onClick={() => setActiveTab('terminal')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 whitespace-nowrap cursor-pointer ${
                activeTab === 'terminal'
                  ? 'bg-[#ff6600] text-white shadow-md shadow-orange-600/30'
                  : 'bg-neutral-900/60 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
              }`}
            >
              <TerminalIcon className="w-3.5 h-3.5" />
              <span>Terminal</span>
            </button>

            <div className="appearance-menu">
              <span className="appearance-label">Aparência</span>
              <div className="appearance-options" aria-label="Tema da interface">
                <button type="button" onClick={() => setUiSkin('original')} className={uiSkin === 'original' ? 'active' : ''}>Original</button>
                <button type="button" onClick={() => setUiSkin('orange')} className={uiSkin === 'orange' ? 'active' : ''}>Orange</button>
                <button type="button" onClick={() => setUiSkin('dark')} className={uiSkin === 'dark' ? 'active' : ''}>Dark</button>
              </div>
            </div>
          </nav>
        </div>

        {/* Row 3: Global Connection Status Banner */}
        <div className="app-status max-w-6xl mx-auto mt-2 pt-2 border-t border-neutral-900 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isConnected
                  ? connectionType === 'simulator'
                    ? 'bg-amber-400 animate-ping'
                    : 'bg-emerald-500 animate-pulse'
                  : 'bg-neutral-600'
              }`}
            />
            <span
              id="status"
              className={
                statusIsError
                  ? 'text-red-400 font-bold'
                  : isConnected
                  ? 'text-emerald-400 font-bold'
                  : 'text-neutral-400'
              }
            >
              Status: {statusMessage}
            </span>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-neutral-400">
            {connectionType === 'simulator' && (
              <span className="text-amber-400 bg-amber-950/60 border border-amber-800/80 px-2 py-0.5 rounded font-bold">
                Modo Demonstração / Simulador
              </span>
            )}
            <span className="hidden sm:inline">Comunicação: {isConnected ? 'Ativa' : 'Inativa'}</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="app-main flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Disconnected Quick Welcome Banner */}
        {!isConnected && (
          <div className="bg-gradient-to-r from-neutral-900/90 to-neutral-900/50 border border-neutral-800 rounded-2xl p-5 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-neutral-100 flex items-center gap-2">
                <Info className="w-4 h-4 text-orange-500" />
                Pronto para monitorar sua Harley-Davidson!
              </h2>
              <p className="text-xs text-neutral-400 max-w-2xl leading-relaxed">
                Conecte seu scanner ELM327 Bluetooth/USB na tomada de diagnóstico da moto (Deutsch 4 pinos ou OBD2), ou teste imediatamente com o <strong>Simulador Harley</strong> sem precisar de moto ou hardware agora.
              </p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                onClick={handleStartSimulator}
                className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-orange-400 border border-orange-500/40 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Testar com Simulador</span>
              </button>
              <button
                onClick={() => setIsModalOpen(true)}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-orange-600/30 flex items-center gap-1.5 cursor-pointer"
              >
                <Bluetooth className="w-3.5 h-3.5" />
                <span>Ligar Bluetooth</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 1: Dashboard View (id: tela-dashboard) */}
        {activeTab === 'dashboard' && (
          <V2Dashboard
            telemetry={telemetry}
            connectionType={connectionType}
            speedUnit={config.speedUnit}
            tempUnit={config.tempUnit}
            onOpenDiagnostics={() => setActiveTab('diagnostics')}
            onOpenDatalogger={() => setActiveTab('datalogger')}
          />
        )}

        {activeTab === 'diagnostics' && (
          <div id="tela-diagnostico">
            <DiagnosticsPanel
              rpm={telemetry.rpm}
              vin={telemetry.vin}
              ecuPartNumber={telemetry.ecuPartNumber}
              ecuCalId={telemetry.ecuCalId}
              ecuSoftwareLevel={telemetry.ecuSoftwareLevel}
              checkEngine={telemetry.checkEngine}
              activeFaults={activeDtcList}
              historicFaults={historicDtcList}
              odometerKm={telemetry.odometerKm}
              engineHoursTotal={telemetry.engineHoursTotal}
              engineMinutesTotal={telemetry.engineMinutesTotal}
              engineIgnitionCycles={telemetry.engineIgnitionCycles}
              onReadDTC={requisitarDadosFiltroDiag}
              onClearDTC={handleClearDTC}
              isConnected={isConnected}
            />
          </div>
        )}

        {/* Tab 3: Actuators Test (Controle Ativo Bidirecional) */}
        {activeTab === 'actuators' && (
          <ActuatorsPanel
            telemetry={telemetry}
            isConnected={isConnected}
            onRunTest={(testId) =>
              connectionRef.current
                ? connectionRef.current.runActuatorTest(testId)
                : Promise.resolve({ success: false, message: 'Dispositivo não conectado.' })
            }
          />
        )}

        {/* Tab 4: Oxygen Sensors & Closed-Loop AFR */}
        {activeTab === 'oxygen' && (
          <OxygenSensorsPanel telemetry={telemetry} />
        )}

        {/* Tab 5: Datalogger & Telemetria CSV */}
        {activeTab === 'datalogger' && (
          <DataloggerPanel telemetry={telemetry} />
        )}

        {/* Tab 6: Terminal & Sniffer Full View */}
        {activeTab === 'terminal' && (
          <div className="space-y-4">
            <TerminalConsole
              logs={logs}
              onSendCommand={handleSendCommand}
              onClearLogs={() => setLogs([])}
              isConnected={isConnected}
            />

            {/* Frame Architecture Explanation */}
            <div className="w-full max-w-4xl mx-auto bg-[#14151b] border border-neutral-800 rounded-2xl p-5 shadow-xl text-xs space-y-3">
              <h3 className="text-sm font-bold text-neutral-200 uppercase tracking-wider flex items-center gap-2">
                <Info className="w-4 h-4 text-orange-500" />
                Engenharia Reversa dos Pacotes Harley-Davidson
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-black/50 p-3 rounded-xl border border-neutral-800">
                  <div className="text-orange-400 font-mono font-bold">RPM Motor</div>
                  <div className="text-[11px] font-mono text-neutral-300 mt-1">
                    Header: <code>28 1B 10 02 [XX XX]</code>
                  </div>
                  <div className="text-neutral-400 text-[10px] mt-1">
                    Cálculo: <code>(hex / 4)</code> RPM. Ex: <code>0FA0</code> (4000) / 4 = 1000 RPM.
                  </div>
                </div>

                <div className="bg-black/50 p-3 rounded-xl border border-neutral-800">
                  <div className="text-blue-400 font-mono font-bold">Velocidade Atual</div>
                  <div className="text-[11px] font-mono text-neutral-300 mt-1">
                    Header: <code>48 29 10 02 [XX XX]</code>
                  </div>
                  <div className="text-neutral-400 text-[10px] mt-1">
                    Cálculo: <code>(hex / 128)</code> km/h. Broadcast contínuo do velocímetro.
                  </div>
                </div>

                <div className="bg-black/50 p-3 rounded-xl border border-neutral-800">
                  <div className="text-red-400 font-mono font-bold">Temp. Cabeçote (ET)</div>
                  <div className="text-[11px] font-mono text-neutral-300 mt-1">
                    Header: <code>A8 49 10 10 [XX]</code>
                  </div>
                  <div className="text-neutral-400 text-[10px] mt-1">
                    Cálculo: <code>hex</code> em °F. Convertido para °C via <code>(°F - 32) × 5/9</code>.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Offline Status Toast */}
      <OfflineIndicator />

      {/* Connection Selection Modal */}
      <ConnectionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConnectBluetooth={handleConnectBluetooth}
        onConnectSerial={handleConnectSerial}
        onStartSimulator={handleStartSimulator}
        config={config}
        onChangeConfig={setConfig}
        currentType={connectionType}
      />

      {/* Footer */}
      <footer className="app-footer border-t border-neutral-900 bg-[#0d0e12] py-4 px-4 text-center text-xs text-neutral-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>ConeCtaHarley · Diagnóstico e monitoramento para PC, Mac, Linux, Android e iPhone</span>
          <span className="font-mono text-[11px] text-neutral-600">
            Compatível com adaptadores ELM327 Bluetooth / USB & Harley-Davidson EFI
          </span>
        </div>
      </footer>
    </div>
  );
}
