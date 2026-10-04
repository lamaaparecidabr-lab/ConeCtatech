export type ValidationLevel = 'VALIDATED' | 'REFERENCE_MAPPED' | 'ECM_UNSUPPORTED' | 'EXPERIMENTAL';
export interface ParameterRegistryEntry {
  dpid: string; pid?: string; key: string; label: string; unit?: string;
  scale?: string; bytes?: string; category: 'MOTOR'|'ADMISSION'|'FUEL'|'IGNITION'|'SENSORS'|'ELECTRICAL';
  validation: ValidationLevel; source: string;
}

// Registry is intentionally explicit: referência técnica mapping is not the same thing as validation on a motorcycle.
export const PARAMETER_REGISTRY: ParameterRegistryEntry[] = [
  {dpid:'11',key:'RPM',label:'RPM ECM',unit:'rpm',category:'MOTOR',validation:'VALIDATED',source:'catálogo técnico de referência + real-bike log'},
  {dpid:'11',key:'MAP (kPa)',label:'MAP',unit:'kPa',category:'ADMISSION',validation:'VALIDATED',source:'catálogo técnico de referência + real-bike log'},
  {dpid:'11',key:'TPS (%)',label:'TPS',unit:'%',category:'ADMISSION',validation:'VALIDATED',source:'catálogo técnico de referência + real-bike log'},
  {dpid:'11',key:'Bateria (V)',label:'Battery/ECM voltage',unit:'V',category:'ELECTRICAL',validation:'VALIDATED',source:'catálogo técnico de referência + multimeter comparison'},
  {dpid:'12',key:'Temp. motor (°C)',label:'Engine temperature',unit:'°C',category:'MOTOR',validation:'VALIDATED',source:'catálogo técnico de referência + real-bike log'},
  {dpid:'12',key:'IAT (°C)',label:'Intake air temperature',unit:'°C',category:'ADMISSION',validation:'VALIDATED',source:'catálogo técnico de referência + real-bike log'},
  {dpid:'12',key:'TPS sensor (V)',label:'TPS sensor voltage',unit:'V',category:'SENSORS',validation:'VALIDATED',source:'catálogo técnico de referência + real-bike correlation'},
  {dpid:'1A',pid:'0x2140',key:'O2 Raw Front (mV)',label:'O2 Raw Front',unit:'mV',bytes:'0-1',scale:'u16 × 0.0763126',category:'FUEL',validation:'VALIDATED',source:'catálogo técnico de referência mapping + real-bike response'},
  {dpid:'1A',pid:'0x2141',key:'O2 Raw Rear (mV)',label:'O2 Raw Rear',unit:'mV',bytes:'2-3',scale:'u16 × 0.0763126',category:'FUEL',validation:'REFERENCE_MAPPED',source:'catálogo técnico de referência; test ECM returned 0'},
  {dpid:'1A',pid:'0x2033',key:'Knock Front (°)',label:'Knock Retard Front',unit:'°',bytes:'4',scale:'raw × 0.25',category:'IGNITION',validation:'REFERENCE_MAPPED',source:'catálogo técnico de referência'},
  {dpid:'1A',pid:'0x2034',key:'Knock Rear (°)',label:'Knock Retard Rear',unit:'°',bytes:'5',scale:'raw × 0.25',category:'IGNITION',validation:'REFERENCE_MAPPED',source:'catálogo técnico de referência'},
  {dpid:'1D',pid:'0x2043',key:'O2 Front (mV)',label:'O2 Sensor Front',unit:'mV',bytes:'0',scale:'raw × 20',category:'FUEL',validation:'VALIDATED',source:'catálogo técnico de referência + real-bike log'},
  {dpid:'1D',pid:'0x2044',key:'O2 Rear (mV)',label:'O2 Sensor Rear',unit:'mV',bytes:'1',scale:'raw × 20',category:'FUEL',validation:'VALIDATED',source:'catálogo técnico de referência + real-bike log'},
  {dpid:'1D',pid:'0x2045',key:'Integrator F (%)',label:'Closed Loop Integrator Front',unit:'%',bytes:'2',scale:'raw × 0.78125',category:'FUEL',validation:'VALIDATED',source:'catálogo técnico de referência + real-bike log'},
  {dpid:'1D',pid:'0x2046',key:'Integrator R (%)',label:'Closed Loop Integrator Rear',unit:'%',bytes:'3',scale:'raw × 0.78125',category:'FUEL',validation:'VALIDATED',source:'catálogo técnico de referência + real-bike log'},
  {dpid:'1D',pid:'0x2047',key:'Long Term F (%)',label:'Adaptive Fuel Factor Front',unit:'%',bytes:'4',scale:'raw × 0.78125',category:'FUEL',validation:'VALIDATED',source:'catálogo técnico de referência + real-bike log'},
  {dpid:'1D',pid:'0x2048',key:'Long Term R (%)',label:'Adaptive Fuel Factor Rear',unit:'%',bytes:'5',scale:'raw × 0.78125',category:'FUEL',validation:'VALIDATED',source:'catálogo técnico de referência + real-bike log'},
];

export const registryForDpid = (dpid:string) => PARAMETER_REGISTRY.filter(p=>p.dpid===dpid.toUpperCase().replace(/^0X/,''));
