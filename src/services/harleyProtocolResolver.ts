import { VehicleIdentity } from './harleyVehicleIdentifier';

export type HarleyBusProtocol = 'J1850 VPW' | 'CAN' | 'UNKNOWN';
export type ProtocolEvidence = 'COMMUNICATION_CONFIRMED' | 'VIN_MARKET_FAMILY_EXPECTED' | 'MARKET_YEAR_EXPECTED' | 'FAMILY_YEAR_EXPECTED' | 'UNKNOWN';

export interface HarleyProtocolProfile {
  expected: HarleyBusProtocol;
  selected: HarleyBusProtocol;
  confirmed: boolean;
  evidence: ProtocolEvidence;
  connectorExpectation?: '4-pin' | '6-pin';
  note: string;
}

/**
 * Predicts the Harley diagnostic bus from identity context, but NEVER substitutes
 * prediction for a successful transport handshake. Market is intentionally part
 * of the resolver because transition model-years differ by market.
 *
 * Current Brazil rule is deliberately conservative: MY <= 2012 is expected J1850
 * for the Brazilian catalog/workflow. A live successful protocol handshake has
 * absolute priority over this expectation.
 */
export function expectedHarleyProtocol(identity: VehicleIdentity | null): HarleyProtocolProfile {
  if (!identity?.modelYear) return { expected:'UNKNOWN', selected:'UNKNOWN', confirmed:false, evidence:'UNKNOWN', note:'Ano/modelo ainda não identificado; protocolo deve ser detectado pela comunicação.' };
  const y = identity.modelYear;
  const market = identity.marketConfiguration || '';
  const family = identity.family || '';
  const brazil = /Brazil/i.test(market) || identity.wmi === '932' || /Manaus/i.test(identity.assemblyPlant || '');

  if (brazil && y <= 2012) {
    return { expected:'J1850 VPW', selected:'J1850 VPW', confirmed:false, evidence:'MARKET_YEAR_EXPECTED', connectorExpectation:'4-pin', note:'Perfil brasileiro até MY2012: J1850/4 vias esperado. A comunicação real deve confirmar.' };
  }

  // International family transition reference. These are expectations, not proof.
  if (family === 'Touring' && y <= 2013) return { expected:'J1850 VPW', selected:'J1850 VPW', confirmed:false, evidence:'FAMILY_YEAR_EXPECTED', connectorExpectation:'4-pin', note:'Touring MY<=2013: J1850 esperado; confirmar pelo handshake.' };
  if (family === 'Sportster' && y <= 2013) return { expected:'J1850 VPW', selected:'J1850 VPW', confirmed:false, evidence:'FAMILY_YEAR_EXPECTED', connectorExpectation:'4-pin', note:'Sportster MY<=2013: J1850 esperado; confirmar pelo handshake.' };
  if (family === 'Dyna' && y <= 2011) return { expected:'J1850 VPW', selected:'J1850 VPW', confirmed:false, evidence:'FAMILY_YEAR_EXPECTED', connectorExpectation:'4-pin', note:'Dyna MY<=2011: J1850 esperado; confirmar pelo handshake.' };
  if (family === 'Softail' && y <= 2011) return { expected:'J1850 VPW', selected:'J1850 VPW', confirmed:false, evidence:'FAMILY_YEAR_EXPECTED', connectorExpectation:'4-pin', note:'Softail MY<=2011: J1850 esperado; confirmar pelo handshake.' };
  if ((family === 'Dyna' || family === 'Softail') && y >= 2012) return { expected:'CAN', selected:'CAN', confirmed:false, evidence:'FAMILY_YEAR_EXPECTED', connectorExpectation:'6-pin', note:'CAN esperado para esta família/ano fora da regra brasileira; confirmar pelo handshake.' };
  if ((family === 'Touring' || family === 'Sportster') && y >= 2014) return { expected:'CAN', selected:'CAN', confirmed:false, evidence:'FAMILY_YEAR_EXPECTED', connectorExpectation:'6-pin', note:'CAN esperado para esta família/ano; confirmar pelo handshake.' };

  return { expected:'UNKNOWN', selected:'UNKNOWN', confirmed:false, evidence:'UNKNOWN', note:'Sem regra suficientemente segura; detectar protocolo pela comunicação.' };
}

export function resolveHarleyProtocol(identity: VehicleIdentity | null, detected?: HarleyBusProtocol): HarleyProtocolProfile {
  const predicted = expectedHarleyProtocol(identity);
  if (detected && detected !== 'UNKNOWN') {
    return { ...predicted, selected:detected, confirmed:true, evidence:'COMMUNICATION_CONFIRMED', connectorExpectation: detected === 'J1850 VPW' ? '4-pin' : '6-pin', note: detected === predicted.expected || predicted.expected === 'UNKNOWN' ? `Protocolo ${detected} confirmado pela comunicação.` : `Protocolo ${detected} confirmado pela comunicação; prevalece sobre a previsão ${predicted.expected}. Divergência deve ser registrada.` };
  }
  return predicted;
}
