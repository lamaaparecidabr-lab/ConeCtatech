import { DatalogSample } from '../types';

export type FuelTrend = 'LEAN_TENDENCY'|'ON_TARGET'|'RICH_TENDENCY'|'INSUFFICIENT';
export interface FuelCell { key:string; rpmMin:number; rpmMax:number; loadMin:number; loadMax:number; loadSource:'TPS'|'MAP'|'NONE'; gear:string; samples:number; avgIntegrator:number; avgLongTerm?:number; avgFrontO2?:number; avgRearO2?:number; avgSpeed?:number; trend:FuelTrend; confidence:'LOW'|'MEDIUM'|'HIGH'; }
export interface FuelSessionSummary { totalSamples:number; usableSamples:number; rejectedOperatingState:number; cells:FuelCell[]; overall:FuelTrend; overallIntegrator?:number; overallLongTerm?:number; note:string; }
const mean=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:undefined;
const trend=(v:number|undefined,n:number):FuelTrend=>v===undefined||n<8?'INSUFFICIENT':v>103?'LEAN_TENDENCY':v<97?'RICH_TENDENCY':'ON_TARGET';
const confidence=(n:number):'LOW'|'MEDIUM'|'HIGH'=>n>=60?'HIGH':n>=25?'MEDIUM':'LOW';
const bucket=(v:number,size:number)=>Math.floor(Math.max(0,v)/size)*size;
const hasIntegrator=(s:DatalogSample)=>s.integratorFrontPct!==undefined||s.integratorRearPct!==undefined;
const usableOperatingState=(s:DatalogSample)=>{
  if (s.fuelSystemStatus && s.fuelSystemStatus !== 'Closed-Loop') return false;
  // Sem status explícito, temperatura >=70 °C é somente uma barreira conservadora de uso,
  // não uma afirmação de que a ECM está necessariamente em closed-loop.
  return s.fuelSystemStatus === 'Closed-Loop' || s.engineTempC >= 70;
};

export function analyzeFuelSession(samples:DatalogSample[]):FuelSessionSummary {
  const withFuel=samples.filter(hasIntegrator);
  const usable=withFuel.filter(usableOperatingState);
  const groups=new Map<string,{samples:DatalogSample[];source:'TPS'|'MAP'|'NONE'}>();
  for(const s of usable){
    const r=bucket(s.rpm,500);
    const source:'TPS'|'MAP'|'NONE' = s.throttlePosition!==undefined?'TPS':s.mapKpa!==undefined?'MAP':'NONE';
    const load=source==='TPS'?bucket(s.throttlePosition!,5):source==='MAP'?bucket(s.mapKpa!,10):-1;
    const gear=s.gear||'—'; const key=`${gear}|${r}|${source}|${load}`;
    const g=groups.get(key)||{samples:[],source}; g.samples.push(s); groups.set(key,g);
  }
  const cells:FuelCell[]=[];
  for(const [key,g] of groups){
    const a=g.samples;
    const ints=a.flatMap(s=>[s.integratorFrontPct,s.integratorRearPct]).filter((x):x is number=>x!==undefined);
    const lts=a.flatMap(s=>[s.longTermFrontPct,s.longTermRearPct]).filter((x):x is number=>x!==undefined);
    const of=a.map(s=>s.frontO2Mv).filter((x):x is number=>x!==undefined), or=a.map(s=>s.rearO2Mv).filter((x):x is number=>x!==undefined);
    const [gear,rs,,ls]=key.split('|'); const r=Number(rs), l=Number(ls); const avg=mean(ints);
    cells.push({key,rpmMin:r,rpmMax:r+499,loadMin:l,loadMax:l<0?-1:l+(g.source==='TPS'?4.9:9.9),loadSource:g.source,gear,samples:a.length,avgIntegrator:avg??100,avgLongTerm:mean(lts),avgFrontO2:mean(of),avgRearO2:mean(or),avgSpeed:mean(a.map(s=>s.speedKmH).filter(Number.isFinite)),trend:trend(avg,a.length),confidence:confidence(a.length)});
  }
  cells.sort((a,b)=>b.samples-a.samples);
  const allInts=usable.flatMap(s=>[s.integratorFrontPct,s.integratorRearPct]).filter((x):x is number=>x!==undefined);
  const allLt=usable.flatMap(s=>[s.longTermFrontPct,s.longTermRearPct]).filter((x):x is number=>x!==undefined);
  const avg=mean(allInts);
  return {totalSamples:samples.length,usableSamples:usable.length,rejectedOperatingState:withFuel.length-usable.length,cells,overall:trend(avg,usable.length),overallIntegrator:avg,overallLongTerm:mean(allLt),note:'Tendência primária baseada no Integrator em série temporal; Long Term é exibido como adaptação acumulada/corroborativa. Narrowband não é convertida em AFR. Zona 97–103% é regra analítica provisória, não especificação Harley. Leituras explicitamente open-loop são excluídas; sem status explícito, <70 °C é tratado como evidência insuficiente.'};
}

export interface SessionComparison { comparableCells:number; improved:number; worsened:number; unchanged:number; rows:Array<{key:string;base:number;test:number;deltaToTarget:number;result:'IMPROVED'|'WORSE'|'SIMILAR'}>; }
export function compareFuelSessions(base:DatalogSample[],test:DatalogSample[]):SessionComparison{
 const a=analyzeFuelSession(base),b=analyzeFuelSession(test), bm=new Map(a.cells.filter(x=>x.samples>=8).map(x=>[x.key,x])); const rows:SessionComparison['rows']=[];
 for(const x of b.cells.filter(x=>x.samples>=8)){const y=bm.get(x.key);if(!y)continue;const before=Math.abs(y.avgIntegrator-100),after=Math.abs(x.avgIntegrator-100),d=before-after;rows.push({key:x.key,base:y.avgIntegrator,test:x.avgIntegrator,deltaToTarget:d,result:d>1?'IMPROVED':d<-1?'WORSE':'SIMILAR'});}
 return {comparableCells:rows.length,improved:rows.filter(x=>x.result==='IMPROVED').length,worsened:rows.filter(x=>x.result==='WORSE').length,unchanged:rows.filter(x=>x.result==='SIMILAR').length,rows};
}
