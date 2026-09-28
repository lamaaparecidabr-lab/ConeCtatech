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
} from 'lucide-react';
import { TelemetryData, ConnectionConfig, ConnectionType, PacketLog } from './types';
import { ELM327Connection } from './services/elm327Connection';
import { soundEngine } from './services/soundEngine';
import { parseMode03DTCs } from './services/j1850Decoder';
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

const INITIAL_TELEMETRY: TelemetryData = {
  rpm: 0,
  speedKmH: 0,
  speedMph: 0,
  engineTempF: 180,
  engineTempC: 82,
  batteryVoltage: 12.8,
  gear: 'N',
  turnLeft: false,
  turnRight: false,
  neutral: true,
  checkEngine: false,
  oilWarning: false,
  highBeam: false,
  clutchEngaged: false,
  fuelLevelPercent: 80,
  odometerKm: 34226,
  engineHoursTotal: 892,
  engineMinutesTotal: 24,
  engineIgnitionCycles: 3120,
  vin: '1HD1BX1194K012345',
  ecuPartNumber: '32124-04B',
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
  const [activeDtcList, setActiveDtcList] = useState<string[]>(['P0107', 'P0118']);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSoundMuted, setIsSoundMuted] = useState(true);

  // Configuration
  const [config, setConfig] = useState<ConnectionConfig>({
    protocol: 'ATSP2', // SAE J1850 VPW (standard for Harley)
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
      },
      (newPacket) => {
        setLogs((prev) => {
          const updated = [...prev, newPacket];
          if (updated.length > 300) return updated.slice(-300);
          return updated;
        });

        // Detect Mode 03 DTCs in incoming logs
        if (newPacket.raw && newPacket.raw.startsWith('43') && newPacket.raw.length >= 6) {
          const clean = newPacket.raw.replace(/[\s:]+/g, '').toLowerCase();
          const dtcs = parseMode03DTCs(clean.substring(2));
          if (dtcs.length > 0) {
            setActiveDtcList(dtcs);
            setTelemetry((prev) => ({ ...prev, checkEngine: true }));
          }
        }
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
      soundEngine.stop();
    }
  };

  const handleSendCommand = (cmd: string) => {
    if (connectionRef.current) {
      connectionRef.current.sendCommand(cmd);
    }
  };

  // Alterna entre Dashboard e Diagnóstico (idêntico ao botão da injeção do HarleyDroid original)
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
    setStatusMessage('Modo: Lendo Scanner Harley...');
    handleSendCommand('\r'); // Interrompe fluxo contínuo ATMA
    setTimeout(() => {
      handleSendCommand('0902'); // Chassi VIN
    }, 300);
    setTimeout(() => {
      handleSendCommand('0904'); // P/N da ECU
    }, 700);
    setTimeout(() => {
      handleSendCommand('03'); // Códigos de Falha DTC
    }, 1100);
    setTimeout(() => {
      handleSendCommand('220201'); // Odômetro Total do Velocímetro (Nó 0x60)
    }, 1500);
    setTimeout(() => {
      handleSendCommand('22010A'); // Horas Totais e Partidas da ECM Delphi (Nó 0x10)
    }, 1900);
  };

  const retornarModoContinuo = async () => {
    setStatusMessage('Modo: Monitoramento Ativo J1850');
    handleSendCommand('ATMA'); // Retorna à escuta passiva contínua
  };

  const handleClearDTC = () => {
    handleSendCommand('04');
    setActiveDtcList([]);
    setTelemetry((prev) => ({ ...prev, checkEngine: false }));
    setStatusMessage('Comando 04 executado: Falhas apagadas da ECU.');
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
    <div className="min-h-screen bg-[#0d0d0d] text-neutral-100 flex flex-col font-sans selection:bg-orange-500/30">
      {/* Top Header com Botão MIL Injeção idêntico ao original */}
      <header className="border-b border-neutral-900 bg-[#121212] sticky top-0 z-40 px-4 py-3 shadow-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-3">
          {/* Logo & ConeCtaHarley Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-600 to-amber-600 p-0.5 shadow-lg shadow-orange-600/30 flex items-center justify-center font-black text-white text-base">
              CH
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold tracking-tight text-xl text-[#ff6600]">
                  ConeCtaHarley
                </h1>
                <span className="text-[10px] font-mono text-orange-400 bg-orange-950/60 border border-orange-900/60 px-1.5 py-0.5 rounded">
                  J1850 VPW
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">
                Painel de Monitoramento & Scanner para PC, Mac, Android e iPhone
              </p>
            </div>
          </div>

          {/* O Ícone da Injeção (Botão MIL Alternador de Telas) */}
          <div className="flex items-center gap-2 sm:gap-4">
            <MilButton
              isActive={telemetry.checkEngine}
              activeScreen={activeTab}
              onClick={handleAlternarTela}
            />

            {/* Navigation Tabs */}
            <div className="flex items-center gap-1 bg-[#181818] p-1 rounded-xl border border-neutral-800 overflow-x-auto max-w-full">
              <button
                onClick={() => {
                  setActiveTab('dashboard');
                  if (isConnected) retornarModoContinuo();
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'bg-[#ff6600] text-white shadow-md shadow-orange-600/30'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Gauge className="w-3.5 h-3.5" />
                <span>Painel</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('diagnostics');
                  if (isConnected) requisitarDadosFiltroDiag();
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  activeTab === 'diagnostics'
                    ? 'bg-[#ff6600] text-white shadow-md shadow-orange-600/30'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>Diagnóstico</span>
              </button>

              <button
                onClick={() => setActiveTab('actuators')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  activeTab === 'actuators'
                    ? 'bg-[#ff6600] text-white shadow-md shadow-orange-600/30'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Atuadores</span>
              </button>

              <button
                onClick={() => setActiveTab('oxygen')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  activeTab === 'oxygen'
                    ? 'bg-[#ff6600] text-white shadow-md shadow-orange-600/30'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Sondas O₂ / AFR</span>
              </button>

              <button
                onClick={() => setActiveTab('datalogger')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  activeTab === 'datalogger'
                    ? 'bg-[#ff6600] text-white shadow-md shadow-orange-600/30'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Datalogger</span>
              </button>

              <button
                onClick={() => setActiveTab('terminal')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  activeTab === 'terminal'
                    ? 'bg-[#ff6600] text-white shadow-md shadow-orange-600/30'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <TerminalIcon className="w-3.5 h-3.5" />
                <span>Terminal</span>
              </button>
            </div>

            {/* PWA Install Button */}
            <PWAInstallButton />

            {/* Audio V-Twin Engine */}
            <button
              onClick={handleToggleSound}
              className={`p-2 rounded-xl border transition-colors cursor-pointer shrink-0 ${
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
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-red-950/80 hover:bg-red-900 text-red-200 text-xs font-bold border border-red-800 rounded-xl transition-colors cursor-pointer"
              >
                <Power className="w-3.5 h-3.5" />
                <span>Desconectar</span>
              </button>
            ) : (
              <button
                id="btn-conectar"
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#ff6600] hover:bg-[#e05500] text-white text-xs font-extrabold uppercase tracking-wider rounded-xl shadow-lg shadow-orange-600/30 transition-all hover:scale-[1.02] cursor-pointer"
              >
                <Bluetooth className="w-3.5 h-3.5" />
                <span>Conectar ELM327</span>
              </button>
            )}
          </div>
        </div>

        {/* Global Connection Status Banner */}
        <div className="max-w-6xl mx-auto mt-2 pt-2 border-t border-neutral-900 flex items-center justify-between text-xs font-mono">
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
            <span className="hidden sm:inline">Protocolo: J1850 VPW (10.4 kbps)</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Disconnected Quick Welcome Banner */}
        {!isConnected && (
          <div className="bg-gradient-to-r from-neutral-900/90 to-neutral-900/50 border border-neutral-800 rounded-2xl p-5 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-neutral-100 flex items-center gap-2">
                <Info className="w-4 h-4 text-orange-500" />
                Pronto para monitorar sua Harley-Davidson!
              </h2>
              <p className="text-xs text-neutral-400 max-w-2xl leading-relaxed">
                Conecte seu scanner ELM327 Bluetooth/USB na tomada de diagnóstico da moto (Deutsch 4 pinos ou OBD2), ou teste imediatamente com o <strong>Simulador Harley J1850</strong> sem precisar de moto ou hardware agora.
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
          <div id="tela-dashboard" className="space-y-6">
            {/* Header controls for dashboard view style */}
            <div className="flex items-center justify-between border-b border-neutral-800/80 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider font-bold text-neutral-400">
                  Estilo dos Relógios:
                </span>
                <div className="flex items-center gap-1 bg-neutral-900 p-0.5 rounded-lg border border-neutral-800">
                  <button
                    onClick={() => setDashboardStyle('classic')}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      dashboardStyle === 'classic'
                        ? 'bg-[#ff6600] text-white'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    Digital HD
                  </button>
                  <button
                    onClick={() => setDashboardStyle('analog')}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      dashboardStyle === 'analog'
                        ? 'bg-[#ff6600] text-white'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    Ponteiros Analógicos
                  </button>
                </div>
              </div>

              <div className="text-xs text-neutral-400 hidden sm:block">
                Dica: Clique no ícone da injeção no topo para abrir o scanner
              </div>
            </div>

            {/* Tell-Tale Indicators Bar */}
            <IndicatorsBar
              turnLeft={telemetry.turnLeft}
              turnRight={telemetry.turnRight}
              neutral={telemetry.neutral}
              batteryWarning={telemetry.batteryVoltage < 12.2 && telemetry.batteryVoltage > 0}
              oilWarning={telemetry.oilWarning}
              checkEngine={telemetry.checkEngine}
              highBeam={telemetry.highBeam}
            />

            {/* Gauges Grid according to selected style */}
            {dashboardStyle === 'classic' ? (
              <ClassicGaugeCluster
                rpm={telemetry.rpm}
                speed={config.speedUnit === 'kmh' ? telemetry.speedKmH : telemetry.speedMph}
                speedUnit={config.speedUnit}
                gear={telemetry.gear}
                odometerKm={telemetry.odometerKm}
                onToggleSpeedUnit={() =>
                  setConfig((prev) => ({
                    ...prev,
                    speedUnit: prev.speedUnit === 'kmh' ? 'mph' : 'kmh',
                  }))
                }
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl mx-auto">
                <GaugeTachometer rpm={telemetry.rpm} maxRpm={7000} />
                <GaugeSpeedometer
                  speedKmH={telemetry.speedKmH}
                  speedMph={telemetry.speedMph}
                  unit={config.speedUnit}
                  gear={telemetry.gear}
                  odometerKm={telemetry.odometerKm}
                  onToggleUnit={() =>
                    setConfig((prev) => ({
                      ...prev,
                      speedUnit: prev.speedUnit === 'kmh' ? 'mph' : 'kmh',
                    }))
                  }
                />
              </div>
            )}

            {/* Secondary Engine Metrics (Temp, Battery, Gear) */}
            <EngineMetrics
              engineTempC={telemetry.engineTempC}
              engineTempF={telemetry.engineTempF}
              batteryVoltage={telemetry.batteryVoltage}
              gear={telemetry.gear}
              tempUnit={config.tempUnit}
              onToggleTempUnit={() =>
                setConfig((prev) => ({
                  ...prev,
                  tempUnit: prev.tempUnit === 'celsius' ? 'fahrenheit' : 'celsius',
                }))
              }
              packetRate={isConnected ? 14 : 0}
            />

            {/* Simulator Controls if in Simulator Mode */}
            {connectionType === 'simulator' && (
              <SimulatorControls
                currentRpm={telemetry.rpm}
                currentSpeed={telemetry.speedKmH}
                gear={telemetry.gear}
                onUpdateValues={(rpm, speed, gear) => {
                  if (connectionRef.current) {
                    connectionRef.current.updateSimulatorInputs(rpm, speed, gear);
                  }
                }}
              />
            )}

            {/* Terminal Sniffer Log at bottom of dashboard */}
            <div className="w-full max-w-4xl mx-auto">
              <TerminalConsole
                logs={logs}
                onSendCommand={handleSendCommand}
                onClearLogs={() => setLogs([])}
                isConnected={isConnected}
              />
            </div>
          </div>
        )}

        {/* Tab 2: Diagnostics & DTCs (id: tela-diagnostico) */}
        {activeTab === 'diagnostics' && (
          <div id="tela-diagnostico">
            <DiagnosticsPanel
              rpm={telemetry.rpm}
              vin={telemetry.vin}
              ecuPartNumber={telemetry.ecuPartNumber}
              checkEngine={telemetry.checkEngine}
              activeFaults={activeDtcList}
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

        {/* Tab 6: Terminal & J1850 Sniffer Full View */}
        {activeTab === 'terminal' && (
          <div className="space-y-4">
            <TerminalConsole
              logs={logs}
              onSendCommand={handleSendCommand}
              onClearLogs={() => setLogs([])}
              isConnected={isConnected}
            />

            {/* J1850 Frame Architecture Explanation */}
            <div className="w-full max-w-4xl mx-auto bg-[#14151b] border border-neutral-800 rounded-2xl p-5 shadow-xl text-xs space-y-3">
              <h3 className="text-sm font-bold text-neutral-200 uppercase tracking-wider flex items-center gap-2">
                <Info className="w-4 h-4 text-orange-500" />
                Engenharia Reversa dos Pacotes J1850 Harley-Davidson
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
      <footer className="border-t border-neutral-900 bg-[#0d0e12] py-4 px-4 text-center text-xs text-neutral-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>ConeCtaHarley · Monitor J1850 VPW para PC, Mac, Linux, Android e iPhone</span>
          <span className="font-mono text-[11px] text-neutral-600">
            Compatível com adaptadores ELM327 Bluetooth / USB & Harley-Davidson EFI
          </span>
        </div>
      </footer>
    </div>
  );
}
