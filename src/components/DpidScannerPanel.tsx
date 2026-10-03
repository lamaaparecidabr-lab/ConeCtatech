import React from 'react';
import { Activity, Cpu, Gauge, Thermometer, Zap, Fuel, Radio, FlaskConical } from 'lucide-react';
import { ActiveDpidSnapshot } from '../types';

interface Props { data?: Record<string, ActiveDpidSnapshot>; isConnected: boolean; }

const definitions = [
  { group:'MOTOR', icon:Cpu, ids:['11','1B'], title:'Motor / rotação' },
  { group:'ADMISSÃO', icon:Gauge, ids:['12','19'], title:'Admissão / temperaturas / sensores' },
  { group:'IGNIÇÃO', icon:Zap, ids:['13','17','1A'], title:'Ignição / avanço / knock' },
  { group:'COMBUSTÍVEL', icon:Fuel, ids:['14','15','16','18','1D'], title:'Combustível / injeção / mistura' },
  { group:'ELÉTRICO', icon:Activity, ids:['1C'], title:'Elétrico / flags' },
  { group:'NÃO SUPORTADOS NESTA MOTO', icon:Radio, ids:['1E','1F','20','21'], title:'Consultas catalogadas com resposta negativa' },
];

const statusLabel = (s?: ActiveDpidSnapshot['status']) => s === 'ok' ? 'OK' : s === 'negative' ? 'NEG' : s === 'timeout' ? 'TIMEOUT' : s === 'pending' ? 'LENDO' : '—';

export const DpidScannerPanel: React.FC<Props> = ({data = {}, isConnected}) => (
  <section id="sec-dpids" className="bg-[#14151b] border border-neutral-800 rounded-2xl p-5 shadow-xl space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-800 pb-3">
      <div><div className="text-sm font-black uppercase tracking-wider text-neutral-100 flex items-center gap-2"><FlaskConical className="w-4 h-4 text-orange-400"/>Scanner de parâmetros ECM — DPID 0x11–0x21</div><p className="text-[11px] text-neutral-500 mt-1">0x11–0x1D responderam positivamente nos testes reais; 0x1E–0x21 retornaram resposta negativa. RAW é preservado quando a fórmula ainda não foi validada.</p></div>
      <span className="text-[10px] font-mono border border-neutral-700 rounded px-2 py-1 text-neutral-400">J1850 VPW · serviço 0x2A</span>
    </div>
    {!isConnected && <div className="text-sm text-neutral-500 text-center py-4">Conecte a moto ou inicie o simulador para executar a leitura.</div>}
    <div className="space-y-5">
      {definitions.map(({group,icon:Icon,ids,title}) => (
        <div key={group}>
          <div className="flex items-center gap-2 mb-2"><Icon className="w-4 h-4 text-orange-400"/><strong className="text-xs tracking-wider text-neutral-300">{group}</strong><span className="text-[10px] text-neutral-600">{title}</span></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {ids.map(id => { const d=data[id]; const vals=Object.entries(d?.values || {}); return (
              <article key={id} className="bg-[#0f1015] border border-neutral-800 rounded-xl p-3">
                <div className="flex items-center justify-between gap-2 mb-2"><strong className="font-mono text-orange-400">DPID 0x{id}</strong><span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${d?.status==='ok'?'text-emerald-400 border-emerald-900 bg-emerald-950/30':d?.status==='negative'?'text-amber-400 border-amber-900 bg-amber-950/30':'text-neutral-500 border-neutral-800'}`}>{statusLabel(d?.status)}</span></div>
                {vals.length > 0 ? <div className="grid grid-cols-2 gap-x-3 gap-y-1">{vals.map(([k,v])=><React.Fragment key={k}><span className="text-[10px] text-neutral-500">{k}</span><strong className="text-[11px] font-mono text-neutral-200 text-right">{String(v)}</strong></React.Fragment>)}</div> : <div className="text-[11px] text-neutral-500">{d?.status==='negative'?'ECM não disponibilizou este DPID nesta motocicleta.':d?.raw?'Resposta preservada em RAW; fórmula ainda não promovida como validada.':'Aguardando leitura.'}</div>}
                {d?.raw && <div className="mt-2 pt-2 border-t border-neutral-800 text-[9px] font-mono text-neutral-600 break-all">RAW {d.raw}</div>}
                {d?.note && <div className="mt-1 text-[9px] text-neutral-600">{d.note}</div>}
              </article>
            )})}
          </div>
        </div>
      ))}
    </div>
  </section>
);
