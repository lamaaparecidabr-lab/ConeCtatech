import React, { useState, useEffect, useRef } from 'react';
import {
  FileSpreadsheet,
  Play,
  Square,
  Pause,
  Trash2,
  Download,
  Clock,
  Database,
  LineChart,
  HardDrive,
  CheckCircle,
  BrainCircuit,
} from 'lucide-react';
import { DatalogSample, TelemetryData, PacketLog } from '../types';
import { analyzeSession } from '../services/diagnosticAnalyzer';

interface DataloggerPanelProps {
  telemetry: TelemetryData;
  logs?: PacketLog[];
}

export const DataloggerPanel: React.FC<DataloggerPanelProps> = ({ telemetry, logs = [] }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [samples, setSamples] = useState<DatalogSample[]>([]);
  const [elapsedSec, setElapsedSec] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<'rpm' | 'speed' | 'temp' | 'tps'>('rpm');

  // Recording sampling loop (samples every 200ms when recording)
  useEffect(() => {
    let interval: any = null;
    if (isRecording) {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now() - elapsedSec * 1000;
      }

      interval = setInterval(() => {
        const now = Date.now();
        const curElapsed = Number(((now - (startTimeRef.current || now)) / 1000).toFixed(1));
        setElapsedSec(Math.round(curElapsed));

        const newSample: DatalogSample = {
          timestamp: now,
          timeFormatted: new Date(now).toLocaleTimeString() + '.' + Math.floor((now % 1000) / 100),
          elapsedSec: curElapsed,
          rpm: telemetry.rpm,
          speedKmH: telemetry.speedKmH,
          engineTempC: telemetry.engineTempC,
          batteryVoltage: telemetry.batteryVoltage,
          throttlePosition: telemetry.throttlePosition,
          mapKpa: telemetry.manifoldPressureKpa,
          frontO2Voltage: telemetry.activeDpidData?.['1D']?.status === 'ok' ? Number(telemetry.activeDpidData?.['1D']?.values?.['O2 Front (mV)']) / 1000 : undefined,
          rearO2Voltage: telemetry.activeDpidData?.['1D']?.status === 'ok' ? Number(telemetry.activeDpidData?.['1D']?.values?.['O2 Rear (mV)']) / 1000 : undefined,
          frontSTFT: telemetry.activeDpidData?.['1D']?.status === 'ok' ? Number(telemetry.activeDpidData?.['1D']?.values?.['Integrator F (%)']) : undefined,
          rearSTFT: telemetry.activeDpidData?.['1D']?.status === 'ok' ? Number(telemetry.activeDpidData?.['1D']?.values?.['Integrator R (%)']) : undefined,
          fuelSystemStatus: undefined,
          gear: String(telemetry.gear),
        };

        setSamples((prev) => {
          // Limit memory to 5000 samples (~16 minutes of continuous recording)
          if (prev.length >= 5000) return [...prev.slice(1), newSample];
          return [...prev, newSample];
        });
      }, 200);
    } else {
      startTimeRef.current = null;
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording, telemetry, elapsedSec]);

  // Export to CSV function
  const handleExportCsv = () => {
    if (samples.length === 0) {
      alert('Nenhum dado gravado para exportar. Inicie a gravação primeiro!');
      return;
    }

    const headers = [
      'Timestamp',
      'Tempo_Decorrido_Seg',
      'RPM',
      'Velocidade_KmH',
      'Temp_Motor_C',
      'Tensao_Bateria_V',
      'Borboleta_TPS_pct',
      'Pressao_MAP_kPa',
      'Sonda_O2_Dianteira_V',
      'Sonda_O2_Traseira_V',
      'Trim_Combustivel_Front_pct',
      'Trim_Combustivel_Rear_pct',
      'Marcha',
      'Status_Injecao',
    ];

    const rows = samples.map((s) => [
      s.timeFormatted,
      s.elapsedSec,
      s.rpm,
      s.speedKmH,
      s.engineTempC,
      s.batteryVoltage,
      s.throttlePosition,
      s.mapKpa,
      s.frontO2Voltage ?? '',
      s.rearO2Voltage ?? '',
      s.frontSTFT ?? '',
      s.rearSTFT ?? '',
      s.gear,
      s.fuelSystemStatus,
    ]);

    const csvContent =
      '\uFEFF' + // UTF-8 BOM so Excel opens with proper accents
      [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.setAttribute('href', url);
    link.setAttribute('download', `telemetria_harley_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    if (samples.length > 0 && confirm('Deseja limpar todos os dados gravados desta sessão?')) {
      setIsRecording(false);
      setSamples([]);
      setElapsedSec(0);
      startTimeRef.current = null;
    }
  };

  const formatTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Generate SVG path for chart based on selected channel
  const renderChartPath = (width: number, height: number) => {
    if (samples.length < 2) return '';
    const slice = samples.slice(-80); // Show last 80 samples on chart
    const step = width / Math.max(1, slice.length - 1);

    let maxVal = 6000;
    let minVal = 0;

    if (selectedChannel === 'rpm') {
      maxVal = 6000;
      minVal = 0;
    } else if (selectedChannel === 'speed') {
      maxVal = 200;
      minVal = 0;
    } else if (selectedChannel === 'temp') {
      maxVal = 130;
      minVal = 20;
    } else if (selectedChannel === 'tps') {
      maxVal = 100;
      minVal = 0;
    }

    return slice
      .map((s, i) => {
        const x = i * step;
        let val = 0;
        if (selectedChannel === 'rpm') val = s.rpm;
        else if (selectedChannel === 'speed') val = s.speedKmH;
        else if (selectedChannel === 'temp') val = s.engineTempC;
        else if (selectedChannel === 'tps') val = s.throttlePosition ?? 0;

        const normalized = Math.min(1, Math.max(0, (val - minVal) / (maxVal - minVal)));
        const y = height - normalized * height;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const report = analyzeSession(telemetry, samples, logs);

  return (
    <div className="space-y-6">
      <div className="bg-[#14151b] border border-neutral-800 rounded-2xl p-5 shadow-xl">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 bg-violet-600/15 text-violet-300 rounded-xl border border-violet-500/25"><BrainCircuit className="w-5 h-5" /></div>
          <div><h2 className="text-lg font-black tracking-wide text-white uppercase">Análise automática da sessão</h2><p className="text-[11px] text-neutral-500">Motor determinístico local: confronta dados reais, suporte da ECM e regras validadas. IA poderá explicar estes fatos depois; não cria medições.</p></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {report.findings.map(f => <div key={f.id} className="rounded-xl border border-neutral-800 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-2"><strong className="text-xs text-neutral-200">{f.title}</strong><span className={`text-[9px] font-bold px-2 py-1 rounded-lg border ${f.status==='OK'?'text-emerald-300 border-emerald-800':f.status==='ATTENTION'?'text-amber-300 border-amber-800':'text-neutral-400 border-neutral-700'}`}>{f.status==='INSUFFICIENT'?'DADOS INSUFICIENTES':f.status}</span></div>
            <p className="text-[11px] text-neutral-400 mt-2">{f.summary}</p>
            {f.evidence.length>0 && <div className="mt-2 space-y-1">{f.evidence.map((e,i)=><div key={i} className="text-[10px] font-mono text-neutral-500">• {e}</div>)}</div>}
            <div className="mt-2 text-[9px] text-neutral-600">Fonte: {f.source}</div>
          </div>)}
        </div>
      </div>

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-neutral-900 via-neutral-900 to-neutral-950 p-5 rounded-2xl border border-neutral-800 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-orange-600/20 text-orange-400 rounded-xl border border-orange-500/30">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-black tracking-wide text-white uppercase">
                Datalogger & Telemetria em Tempo Real (CSV)
              </h2>
            </div>
            <p className="mt-1 text-xs text-neutral-400 max-w-2xl">
              Grave sessões de rodagem na estrada ou na oficina a cada 200ms para diagnosticar falhas intermitentes e exporte para Excel / Google Planilhas.
            </p>
          </div>

          {/* Action Bar */}
          <div className="flex items-center gap-2 flex-wrap">
            {!isRecording ? (
              <button
                onClick={() => setIsRecording(true)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-950/50 transition cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Iniciar Gravação</span>
              </button>
            ) : (
              <button
                onClick={() => setIsRecording(false)}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-lg shadow-amber-950/50 transition cursor-pointer animate-pulse"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Pausar Gravação</span>
              </button>
            )}

            <button
              onClick={handleExportCsv}
              disabled={samples.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider rounded-xl border border-neutral-700 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-orange-400" />
              <span>Exportar CSV</span>
            </button>

            <button
              onClick={handleClear}
              disabled={samples.length === 0}
              className="p-2 bg-neutral-900 hover:bg-red-950/50 disabled:opacity-30 text-neutral-400 hover:text-red-400 rounded-xl border border-neutral-800 transition cursor-pointer"
              title="Limpar buffer de gravação"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Counter Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-neutral-900/80 p-3.5 rounded-xl border border-neutral-800 flex items-center gap-3">
          <div className="p-2 bg-neutral-950 rounded-lg text-orange-400 border border-neutral-800">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-neutral-500 font-bold uppercase">Tempo Gravado</span>
            <p className="text-base font-black font-mono text-white">{formatTime(elapsedSec)}</p>
          </div>
        </div>

        <div className="bg-neutral-900/80 p-3.5 rounded-xl border border-neutral-800 flex items-center gap-3">
          <div className="p-2 bg-neutral-950 rounded-lg text-emerald-400 border border-neutral-800">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-neutral-500 font-bold uppercase">Amostras Coletadas</span>
            <p className="text-base font-black font-mono text-white">{samples.length}</p>
          </div>
        </div>

        <div className="bg-neutral-900/80 p-3.5 rounded-xl border border-neutral-800 flex items-center gap-3">
          <div className="p-2 bg-neutral-950 rounded-lg text-blue-400 border border-neutral-800">
            <HardDrive className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-neutral-500 font-bold uppercase">Tamanho em Memória</span>
            <p className="text-base font-black font-mono text-white">
              {((samples.length * 128) / 1024).toFixed(1)} KB
            </p>
          </div>
        </div>

        <div className="bg-neutral-900/80 p-3.5 rounded-xl border border-neutral-800 flex items-center gap-3">
          <div className="p-2 bg-neutral-950 rounded-lg text-amber-400 border border-neutral-800">
            <span
              className={`w-3.5 h-3.5 rounded-full inline-block ${
                isRecording ? 'bg-red-500 animate-ping' : 'bg-neutral-600'
              }`}
            />
          </div>
          <div>
            <span className="text-[10px] text-neutral-500 font-bold uppercase">Status</span>
            <p className="text-sm font-black text-white">
              {isRecording ? 'Gravando...' : samples.length > 0 ? 'Pausado' : 'Aguardando'}
            </p>
          </div>
        </div>
      </div>

      {/* Real-time Telemetry Graph */}
      <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <LineChart className="w-4 h-4 text-orange-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              Gráfico de Telemetria Dinâmico (Últimos 16 segundos)
            </h3>
          </div>

          {/* Channel Selectors */}
          <div className="flex items-center gap-1.5 bg-neutral-950 p-1 rounded-xl border border-neutral-800 text-xs">
            <button
              onClick={() => setSelectedChannel('rpm')}
              className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                selectedChannel === 'rpm'
                  ? 'bg-orange-600 text-white shadow'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              RPM
            </button>
            <button
              onClick={() => setSelectedChannel('speed')}
              className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                selectedChannel === 'speed'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Velocidade
            </button>
            <button
              onClick={() => setSelectedChannel('temp')}
              className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                selectedChannel === 'temp'
                  ? 'bg-red-600 text-white shadow'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Temp Cabeçote
            </button>
            <button
              onClick={() => setSelectedChannel('tps')}
              className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                selectedChannel === 'tps'
                  ? 'bg-amber-600 text-white shadow'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              TPS %
            </button>
          </div>
        </div>

        {/* Chart Viewport */}
        <div className="w-full h-48 bg-[#08080a] rounded-xl border border-neutral-800 relative overflow-hidden p-3">
          {/* Grid lines */}
          <div className="absolute inset-0 grid grid-rows-4 grid-cols-8 pointer-events-none opacity-15">
            {Array.from({ length: 32 }).map((_, i) => (
              <div key={i} className="border-b border-r border-neutral-700" />
            ))}
          </div>

          {samples.length < 2 ? (
            <div className="h-full flex items-center justify-center text-xs text-neutral-500 font-mono">
              Clique em "Iniciar Gravação" para plotar as curvas de telemetria em tempo real
            </div>
          ) : (
            <svg className="w-full h-full overflow-visible relative z-10" preserveAspectRatio="none" viewBox="0 0 500 150">
              <path
                d={renderChartPath(500, 150)}
                fill="none"
                stroke={
                  selectedChannel === 'rpm'
                    ? '#ff6600'
                    : selectedChannel === 'speed'
                    ? '#3b82f6'
                    : selectedChannel === 'temp'
                    ? '#ef4444'
                    : '#f59e0b'
                }
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          )}
        </div>
      </div>

      {/* Live Data Preview Table */}
      <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-5 shadow-xl">
        <h3 className="text-xs font-bold uppercase tracking-wider text-white mb-3 flex items-center justify-between">
          <span>Últimas Linhas Gravadas (Prévia do CSV)</span>
          <span className="text-[11px] text-neutral-500 font-mono">
            {samples.length} registros prontos para exportar
          </span>
        </h3>

        <div className="overflow-x-auto rounded-xl border border-neutral-800">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-neutral-950 text-neutral-400 uppercase text-[10px]">
              <tr>
                <th className="py-2.5 px-3">Hora</th>
                <th className="py-2.5 px-3">Tempo (s)</th>
                <th className="py-2.5 px-3 text-orange-400">RPM</th>
                <th className="py-2.5 px-3 text-blue-400">Km/h</th>
                <th className="py-2.5 px-3 text-red-400">Temp °C</th>
                <th className="py-2.5 px-3">TPS %</th>
                <th className="py-2.5 px-3 text-emerald-400">Front O₂</th>
                <th className="py-2.5 px-3 text-cyan-400">Rear O₂</th>
                <th className="py-2.5 px-3">Marcha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800 bg-neutral-900/60 text-neutral-300">
              {samples.slice(-6).reverse().map((row, idx) => (
                <tr key={idx} className="hover:bg-neutral-800/40">
                  <td className="py-2 px-3 text-neutral-400">{row.timeFormatted}</td>
                  <td className="py-2 px-3">{row.elapsedSec}s</td>
                  <td className="py-2 px-3 font-bold text-orange-400">{row.rpm}</td>
                  <td className="py-2 px-3 font-bold text-blue-400">{row.speedKmH}</td>
                  <td className="py-2 px-3 font-bold text-red-400">{row.engineTempC}°C</td>
                  <td className="py-2 px-3">{row.throttlePosition}%</td>
                  <td className="py-2 px-3 text-emerald-400">{row.frontO2Voltage.toFixed(3)}V</td>
                  <td className="py-2 px-3 text-cyan-400">{row.rearO2Voltage.toFixed(3)}V</td>
                  <td className="py-2 px-3 font-bold">{row.gear}</td>
                </tr>
              ))}
              {samples.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-4 text-center text-neutral-500 text-xs">
                    Nenhum dado gravado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
