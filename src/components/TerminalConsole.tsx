import React, { useState, useRef, useEffect } from 'react';
import { PacketLog } from '../types';
import { Terminal, Send, Trash2, Download, Pause, Play, Filter } from 'lucide-react';

interface TerminalConsoleProps {
  logs: PacketLog[];
  onSendCommand: (cmd: string) => void;
  onClearLogs: () => void;
  isConnected: boolean;
}

export const TerminalConsole: React.FC<TerminalConsoleProps> = ({
  logs,
  onSendCommand,
  onClearLogs,
  isConnected,
}) => {
  const [inputCmd, setInputCmd] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [filterTag, setFilterTag] = useState<string>('ALL');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCmd.trim()) return;
    onSendCommand(inputCmd);
    setInputCmd('');
  };

  const handleExport = () => {
    const text = logs
      .map((l) => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.raw} => ${l.decoded || ''}`)
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conectaharley-log-${new Date().toISOString().substring(0, 19)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredLogs = logs.filter((l) => {
    if (filterTag === 'ALL') return true;
    return l.tag === filterTag;
  });

  const quickCommands = [
    { label: 'ATZ (Reset)', cmd: 'ATZ' },
    { label: 'ATE0 (Echo Off)', cmd: 'ATE0' },
    { label: 'ATSP2 (VPW Harley)', cmd: 'ATSP2' },
    { label: 'ATMA (Monitor All)', cmd: 'ATMA' },
    { label: 'ATRV (Tensão)', cmd: 'ATRV' },
    { label: '010C (PID RPM)', cmd: '010C' },
    { label: '010D (PID Speed)', cmd: '010D' },
    { label: '03 (Ler DTCs)', cmd: '03' },
    { label: '220201 (Odo Speedo)', cmd: '220201' },
    { label: '22010A (Horas ECM)', cmd: '22010A' },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto bg-[#0d0e12] border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#14151b] border-b border-neutral-800 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-orange-500" />
          <span className="text-xs font-mono font-bold text-neutral-200 uppercase tracking-wider">
            Terminal ELM327 & Sniffer
          </span>
          <span className="text-[10px] font-mono text-neutral-400">
            ({logs.length} pacotes)
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {/* Filter selector */}
          <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800 rounded px-2 py-1">
            <Filter className="w-3 h-3 text-neutral-400" />
            <select
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              className="bg-transparent text-[11px] font-mono text-neutral-300 focus:outline-none cursor-pointer"
            >
              <option value="ALL">Todos os Pacotes</option>
              <option value="RPM">Apenas RPM</option>
              <option value="SPEED">Apenas Velocidade</option>
              <option value="TEMP">Apenas Temperatura</option>
              <option value="STATUS">Apenas Status</option>
              <option value="AT">Comandos AT / ELM</option>
            </select>
          </div>

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1.5 rounded text-xs border transition-colors ${
              autoScroll
                ? 'bg-neutral-800 text-orange-400 border-neutral-700'
                : 'bg-neutral-900 text-neutral-400 border-neutral-800'
            }`}
            title={autoScroll ? 'Pausar rolagem automática' : 'Ativar rolagem automática'}
          >
            {autoScroll ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={handleExport}
            className="p-1.5 rounded text-xs bg-neutral-900 text-neutral-300 border border-neutral-800 hover:bg-neutral-800 transition-colors"
            title="Exportar log para arquivo TXT"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onClearLogs}
            className="p-1.5 rounded text-xs bg-neutral-900 text-neutral-400 border border-neutral-800 hover:text-red-400 transition-colors"
            title="Limpar terminal"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Quick AT commands bar */}
      <div className="flex items-center gap-1.5 px-4 py-2 bg-[#101116] border-b border-neutral-800/80 overflow-x-auto text-[11px] no-scrollbar">
        <span className="text-[10px] font-mono text-neutral-400 uppercase mr-1 whitespace-nowrap">
          Comandos Rápidos:
        </span>
        {quickCommands.map((q) => (
          <button
            key={q.cmd}
            onClick={() => onSendCommand(q.cmd)}
            disabled={!isConnected}
            className="px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 hover:border-orange-500/50 rounded whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-mono text-[10px]"
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Terminal log output */}
      <div
        ref={scrollRef}
        className="h-72 overflow-y-auto p-4 font-mono text-xs leading-relaxed space-y-1 bg-black/90 selection:bg-orange-500/30 selection:text-white"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-neutral-500 italic py-8 text-center">
            Aguardando pacotes de dados Bluetooth / Serial...
            <div className="text-[11px] text-neutral-600 mt-1">
              Conecte seu adaptador ELM327 ou inicie o Simulador Harley para ver os dados.
            </div>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isTx = log.type === 'tx';
            const isErr = log.type === 'error';
            const isInfo = log.type === 'info';

            return (
              <div key={log.id} className="flex items-start gap-2 hover:bg-neutral-900/40 px-1 py-0.5 rounded">
                <span className="text-neutral-600 text-[10px] select-none whitespace-nowrap">
                  {log.timestamp}
                </span>

                {/* Packet Tag */}
                {log.tag && (
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase select-none ${
                      log.tag === 'RPM'
                        ? 'bg-amber-950 text-amber-400 border border-amber-800'
                        : log.tag === 'SPEED'
                        ? 'bg-blue-950 text-blue-400 border border-blue-800'
                        : log.tag === 'TEMP'
                        ? 'bg-red-950 text-red-400 border border-red-800'
                        : log.tag === 'AT'
                        ? 'bg-purple-950 text-purple-400 border border-purple-800'
                        : 'bg-neutral-900 text-neutral-400 border border-neutral-800'
                    }`}
                  >
                    {log.tag}
                  </span>
                )}

                {/* Direction prefix */}
                <span
                  className={`text-[10px] font-bold ${
                    isTx
                      ? 'text-orange-400'
                      : isErr
                      ? 'text-red-500'
                      : isInfo
                      ? 'text-cyan-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {isTx ? 'TX ▶' : isErr ? 'ERR ✖' : isInfo ? 'SYS ℹ' : 'RX ◀'}
                </span>

                {/* Content */}
                <div className="flex-1 break-all">
                  <span className={isTx ? 'text-neutral-200 font-bold' : isErr ? 'text-red-400' : 'text-emerald-300'}>
                    {log.raw}
                  </span>
                  {log.decoded && log.decoded !== log.raw && (
                    <span className="text-neutral-400 text-[11px] ml-2">
                      // {log.decoded}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Terminal Input Form */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 p-3 bg-[#14151b] border-t border-neutral-800">
        <span className="text-orange-500 font-mono font-bold select-none text-sm pl-1">&gt;</span>
        <input
          type="text"
          value={inputCmd}
          onChange={(e) => setInputCmd(e.target.value)}
          placeholder={isConnected ? "Digite comando AT ou PID OBD2 (ex: ATZ, ATRV, 010C) e tecle Enter..." : "Conecte para enviar comandos..."}
          disabled={!isConnected}
          className="flex-1 bg-black/50 border border-neutral-800 rounded-lg px-3 py-2 text-xs font-mono text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-orange-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!isConnected || !inputCmd.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-orange-600/20"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Enviar</span>
        </button>
      </form>
    </div>
  );
};
