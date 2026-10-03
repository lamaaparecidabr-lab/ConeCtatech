import { DatalogSample } from '../types';

export type FuelTrend = 'LEAN_TENDENCY'|'ON_TARGET'|'RICH_TENDENCY'|'INSUFFICIENT';
export interface FuelCell { key:string; rpmMin:number; rpmMax:number; loadMin:number; loadMax:number; gear:string; samples:number; avgIntegrator:number; avgLongTerm?:number; avgFrontO2?:number; avgRearO2?:number; avgSpeed?:number; trend:FuelTrend; confidence:'LOW'|'MEDIUM'|'HIGH'; }
export interface FuelSessionSummary { usableSamples:number; cells:FuelCell[]; overall:FuelTrend; overallIntegrator?:number; note:string; }
const mean=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:undefined;
const trend=(v:number|undefined,n:number):FuelTrend=>v===undefined||n<8?'INSUFFICIENT':v>103?'LEAN_TENDENCY':v<97?'RICH_TENDENCY':'ON_TARGET';
const confidence=(n:number):'LOW'|'MEDIUM'|'HIGH'=>n>=60?'HIGH':n>=25?'MEDIUM':'LOW';
const bucket=(v:number,size:number)=>Math.floor(Math.max(0,v)/size)*size;

export function analyzeFuelSession(samples:DatalogSample[]):FuelSessionSummary {
  const usable=samples.filter(s=>s.integratorFrontPct!==undefined||s.integratorRearPct!==undefined);
  const groups=new Map<string,DatalogSample[]>();
  for(const s of usable){
    const r=bucket(s.rpm,500), load=s.throttlePosition!==undefined?bucket(s.throttlePosition,5):s.mapKpa!==undefined?bucket(s.mapKpa,10):-1;
    const gear=s.gear||'—'; const key=`${gear}|${r}|${load}`;
    const a=groups.get(key)||[]; a.push(s); groups.set(key,a);
  }
  const cells:FuelCell[]=[];
  for(const [key,a] of groups){
    const ints=a.flatMap(s=>[s.integratorFrontPct,s.integratorRearPct]).filter((x):x is number=>x!==undefined);
    const lts=a.flatMap(s=>[s.longTermFrontPct,s.longTermRearPct]).filter((x):x is number=>x!==undefined);
    const of=a.map(s=>s.frontO2Mv).filter((x):x is number=>x!==undefined), or=a.map(s=>s.rearO2Mv).filter((x):x is number=>x!==undefined);
    const [gear,rs,ls]=key.split('|'); const r=Number(rs), l=Number(ls); const avg=mean(ints);
    cells.push({key,rpmMin:r,rpmMax:r+499,loadMin:l,loadMax:l<0?-1:l+4.9,gear,samples:a.length,avgIntegrator:avg??100,avgLongTerm:mean(lts),avgFrontO2:mean(of),avgRearO2:mean(or),avgSpeed:mean(a.map(s=>s.speedKmH).filter(Number.isFinite)),trend:trend(avg,a.length),confidence:confidence(a.length)});
  }
  cells.sort((a,b)=>b.samples-a.samples);
  const allInts=usable.flatMap(s=>[s.integratorFrontPct,s.integratorRearPct]).filter((x):x is number=>x!==undefined); const avg=mean(allInts);
  return {usableSamples:usable.length,cells,overall:trend(avg,usable.length),overallIntegrator:avg,note:'Tendência baseada em correção da ECM (Integrator) em série temporal. Narrowband não é convertida em AFR. Zona inicial 97–103% é regra analítica provisória, não especificação Harley.'};
}

export interface SessionComparison { comparableCells:number; improved:number; worsened:number; unchanged:number; rows:Array<{key:string;base:number;test:number;deltaToTarget:number;result:'IMPROVED'|'WORSE'|'SIMILAR'}>; }
export function compareFuelSessions(base:DatalogSample[],test:DatalogSample[]):SessionComparison{
 const a=analyzeFuelSession(base),b=analyzeFuelSession(test), bm=new Map(a.cells.filter(x=>x.samples>=8).map(x=>[x.key,x])); const rows:SessionComparison['rows']=[];
 for(const x of b.cells.filter(x=>x.samples>=8)){const y=bm.get(x.key);if(!y)continue;const before=Math.abs(y.avgIntegrator-100),after=Math.abs(x.avgIntegrator-100),d=before-after;rows.push({key:x.key,base:y.avgIntegrator,test:x.avgIntegrator,deltaToTarget:d,result:d>1?'IMPROVED':d<-1?'WORSE':'SIMILAR'});}
 return {comparableCells:rows.length,improved:rows.filter(x=>x.result==='IMPROVED').length,worsened:rows.filter(x=>x.result==='WORSE').length,unchanged:rows.filter(x=>x.result==='SIMILAR').length,rows};
}
