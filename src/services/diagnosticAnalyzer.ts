import { ActiveDpidSnapshot, DatalogSample, PacketLog, TelemetryData } from '../types';

export type FindingStatus = 'OK'|'ATTENTION'|'INFO'|'INSUFFICIENT';
export interface DiagnosticFinding { id:string; title:string; status:FindingStatus; summary:string; evidence:string[]; source:string; }
export interface DiagnosticReport { generatedAt:number; findings:DiagnosticFinding[]; }
const num=(s:ActiveDpidSnapshot|undefined,k:string):number|undefined=>{const v=s?.values?.[k]; return typeof v==='number'&&Number.isFinite(v)?v:undefined};
const range=(a:number[])=>a.length?{min:Math.min(...a),max:Math.max(...a)}:undefined;

export function analyzeSession(telemetry:TelemetryData, samples:DatalogSample[], logs:PacketLog[]):DiagnosticReport {
 const d=telemetry.activeDpidData||{}; const findings:DiagnosticFinding[]=[];
 const tps=num(d['11'],'TPS (%)'); const tpsV=num(d['12'],'TPS sensor (V)') ?? num(d['19'],'TPS sensor (V)');
 if(tps!==undefined && tpsV!==undefined) findings.push({id:'tps',title:'TPS / sensor de borboleta',status:'OK',summary:'A ECM forneceu posição e tensão do TPS na mesma sessão.',evidence:[`TPS ${tps.toFixed(1)}%`,`TPS Sensor ${tpsV.toFixed(3)} V`],source:'DPID 0x11/0x12/0x19; correlação já validada em moto real'});
 else findings.push({id:'tps',title:'TPS / sensor de borboleta',status:'INSUFFICIENT',summary:'Ainda não há leitura ativa suficiente para avaliar TPS e tensão em conjunto.',evidence:[],source:'Regra local determinística'});
 const o=d['1D']; const of=num(o,'O2 Front (mV)'), or=num(o,'O2 Rear (mV)'), inf=num(o,'Integrator F (%)'), inr=num(o,'Integrator R (%)'), ltf=num(o,'Long Term F (%)'), ltr=num(o,'Long Term R (%)');
 if(o?.status==='ok' && of!==undefined && or!==undefined) findings.push({id:'o2',title:'Sondas O₂ / malha fechada',status:'INFO',summary:'DPID 0x1D respondeu com dados reais dos dois cilindros. A análise não converte narrowband em AFR e não condena sensor por uma amostra isolada.',evidence:[`Front ${of.toFixed(0)} mV · Rear ${or.toFixed(0)} mV`,inf!==undefined&&inr!==undefined?`Integrator ${inf.toFixed(2)}% / ${inr.toFixed(2)}%`:'',ltf!==undefined&&ltr!==undefined?`Long Term ${ltf.toFixed(2)}% / ${ltr.toFixed(2)}%`:'' ].filter(Boolean),source:'TTS/DataMaster DPID 0x1D + validação em moto real'});
 else findings.push({id:'o2',title:'Sondas O₂ / malha fechada',status:'INSUFFICIENT',summary:'Sem amostra 0x1D válida suficiente para diagnóstico.',evidence:[],source:'Regra local determinística'});
 const unsupported=['1E','1F','20','21'].filter(x=>d[x]?.status==='negative');
 if(unsupported.length) findings.push({id:'support',title:'Compatibilidade da ECM',status:'INFO',summary:'Resposta negativa da ECM foi classificada como parâmetro não suportado, não como falha de comunicação.',evidence:[`DPIDs: ${unsupported.map(x=>'0x'+x).join(', ')}`],source:'Resposta negativa J1850 serviço 0x2A'});
 const breaks=logs.filter(l=>l.raw==='ATMA_BREAK_NO_PROMPT').length; const okBreaks=logs.filter(l=>l.raw==='ATMA_BREAK_PROMPT_OK').length;
 findings.push({id:'comm',title:'Comunicação ELM / ATMA',status:breaks?'ATTENTION':'OK',summary:breaks?`${breaks} tentativa(s) ativa(s) foram canceladas com segurança porque o prompt do ELM não foi confirmado.`:'Nenhum aborto ATMA sem prompt foi registrado nesta sessão.',evidence:[`${okBreaks} transição(ões) ATMA→ativo confirmada(s)`,`${breaks} cancelada(s) por segurança`],source:'Eventos internos do transporte'});
 const batt=range(samples.map(s=>s.batteryVoltage).filter((v):v is number=>typeof v==='number'&&Number.isFinite(v)));
 if(batt) findings.push({id:'battery',title:'Tensão registrada',status:'INFO',summary:'Faixa observada no datalog. O analisador não aplica diagnóstico de sistema de carga sem conhecer estado do motor e condição de medição.',evidence:[`${batt.min.toFixed(1)}–${batt.max.toFixed(1)} V`],source:'Datalog local'});
 return {generatedAt:Date.now(),findings};
}
