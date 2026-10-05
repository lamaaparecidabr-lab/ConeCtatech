export interface VehicleIdentity {
  manufacturer: 'Harley-Davidson';
  family?: string;
  factoryModel?: string;
  commercialName?: string;
  modelYear?: number;
  engine?: string;
  displacementCc?: number;
  confirmed: boolean;
  confidence: 'PARTIAL' | 'IDENTIFIED' | 'VERIFIED';
  vinValid: boolean;
  wmi?: string;
  manufacturingOrigin?: string;
  assemblyPlant?: string;
  marketConfiguration?: string;
}

type ModelInfo = { factoryModel: string; commercialName: string; family: string };
type EngineInfo = { engine: string; displacementCc: number };

const m = (factoryModel: string, commercialName: string, family: string): ModelInfo => ({ factoryModel, commercialName, family });

// Catálogo local por model-year. O identificador nunca inventa um modelo ausente.
// A tabela é deliberadamente separada da camada J1850/CAN: ambos entregam o VIN aqui.
const MODEL_CATALOG: Record<number, Record<string, ModelInfo>> = {};

// MY2000 - tabelas oficiais por família. CA é deliberadamente resolvido pelo motor.
const put = (years: number[], entries: Record<string, ModelInfo>) => years.forEach(y => MODEL_CATALOG[y] = { ...(MODEL_CATALOG[y] || {}), ...entries });
function put2000Placeholder() {}
put([2000], {
  CA:m('XL','Sportster 883/1200 (motor define variante)','Sportster'), CE:m('XLH883','883 Hugger','Sportster'), CG:m('XL1200C','1200 Custom','Sportster'), CH:m('XL1200S','1200 Sport','Sportster'), CJ:m('XL883C','883 Custom','Sportster'),
  GD:m('FXDL','Dyna Low Rider','Dyna'), GH:m('FXD','Dyna Super Glide','Dyna'), GE:m('FXDWG','Dyna Wide Glide','Dyna'), GG:m('FXDS-CON','Dyna Convertible','Dyna'), GJ:m('FXDX','Dyna Super Glide Sport','Dyna'),
  BH:m('FXST','Softail Standard','Softail'), BJ:m('FLSTC','Heritage Softail Classic','Softail'), BL:m('FXSTS','Springer Softail','Softail'), BM:m('FLSTF','Fat Boy','Softail'), BR:m('FLSTS','Heritage Springer','Softail'), BS:m('FXSTD','Softail Deuce','Softail'), BT:m('FXSTB','Night Train','Softail'),
  FD:m('FLHR','Road King','Touring'), FB:m('FLHRI','Road King','Touring'), FR:m('FLHRCI','Road King Classic','Touring'), DD:m('FLHT','Electra Glide Standard','Touring'), DJ:m('FLHTC','Electra Glide Classic','Touring'), FF:m('FLHTCI','Electra Glide Classic','Touring'), FC:m('FLHTCUI','Ultra Classic Electra Glide','Touring'), FL:m('FLHTCUI','Ultra Classic Electra Glide Shrine','Touring'), FG:m('FLHTCUI','Ultra Classic Electra Glide with Sidecar','Touring'), FP:m('FLTR','Road Glide','Touring'), FS:m('FLTRI','Road Glide','Touring'),
  PA:m('FLTRSEI','CVO Road Glide','CVO Touring'), EV:m('FXR4','FXR4','FXR')
});

const touring0204 = {
  FD:m('FLHR','Road King','Touring'), FB:m('FLHRI','Road King','Touring'), FR:m('FLHRCI','Road King Classic','Touring'),
  DD:m('FLHT','Electra Glide Standard','Touring'), DJ:m('FLHTC','Electra Glide Classic','Touring'), FF:m('FLHTCI','Electra Glide Classic','Touring'),
  FC:m('FLHTCUI','Ultra Classic Electra Glide','Touring'), FL:m('FLHTCUI','Ultra Classic Electra Glide Shrine','Touring'),
  FG:m('FLHTCUI','Ultra Classic Electra Glide with Sidecar','Touring'), FP:m('FLTR','Road Glide','Touring'), FS:m('FLTRI','Road Glide','Touring')
};
put([2002], {...touring0204, DG:m('FLHTC','Electra Glide Classic Shrine','Touring')});
put([2003], {...touring0204, FK:m('FLHTCI','Electra Glide Classic Shrine','Touring'), FV:m('FLHTI','Electra Glide Standard','Touring'), FW:m('FLHRI','Road King Shrine','Touring')});
put([2004], {...touring0204, FK:m('FLHTCI','Electra Glide Classic Shrine','Touring'), FV:m('FLHTI','Electra Glide Standard','Touring'), FW:m('FLHRI','Road King Shrine','Touring'), FX:m('FLHRS','Road King Custom','Touring'), FY:m('FLHRSI','Road King Custom','Touring')});
const touring0506 = {
  FD:m('FLHR','Road King','Touring'), FB:m('FLHRI','Road King','Touring'), FR:m('FLHRCI','Road King Classic','Touring'), DD:m('FLHT','Electra Glide Standard','Touring'),
  FF:m('FLHTCI','Electra Glide Classic','Touring'), FC:m('FLHTCUI','Ultra Classic Electra Glide','Touring'), FL:m('FLHTCUI','Ultra Classic Electra Glide Shrine','Touring'),
  FG:m('FLHTCUI','Ultra Classic Electra Glide with Sidecar','Touring'), FS:m('FLTRI','Road Glide','Touring'), FV:m('FLHTI','Electra Glide Standard','Touring'),
  FW:m('FLHRI','Road King Shrine','Touring'), FX:m('FLHRS','Road King Custom','Touring'), FY:m('FLHRSI','Road King Custom','Touring')
};
put([2005], touring0506);
put([2006], {...touring0506, KA:m('FLHX','Street Glide','Touring'), KB:m('FLHXI','Street Glide','Touring')});
put([2007], {
  FB:m('FLHR','Road King','Touring'), FC:m('FLHTCU','Ultra Classic Electra Glide','Touring'), FF:m('FLHTC','Electra Glide Classic','Touring'),
  FG:m('FLHTCU','Ultra Classic Electra Glide with Sidecar','Touring'), FL:m('FLHTCU','Ultra Classic Electra Glide Shrine','Touring'), FR:m('FLHRC','Road King Classic','Touring'),
  FS:m('FLTR','Road Glide','Touring'), FV:m('FLHT','Electra Glide Standard','Touring'), FW:m('FLHR','Road King Shrine','Touring'), FY:m('FLHRS','Road King Custom','Touring'), KB:m('FLHX','Street Glide','Touring')
});
put([2008], {FB:m('FLHR','Road King','Touring'),FC:m('FLHTCU','Ultra Classic Electra Glide','Touring'),FG:m('FLHTCU','Ultra Classic Electra Glide with Sidecar','Touring'),FL:m('FLHTCU','Ultra Classic Electra Glide Shrine','Touring'),FS:m('FLTR','Road Glide','Touring'),FV:m('FLHT','Electra Glide Standard','Touring'),FF:m('FLHTC','Electra Glide Classic','Touring'),KB:m('FLHX','Street Glide','Touring')});
put([2009], {FB:m('FLHR','Road King','Touring'),FR:m('FLHRC','Road King Classic','Touring'),FW:m('FLHR','Road King Shrine','Touring'),FS:m('FLTR','Road Glide','Touring'),KB:m('FLHX','Street Glide','Touring'),FV:m('FLHT','Electra Glide Standard','Touring'),FF:m('FLHTC','Electra Glide Classic','Touring'),FC:m('FLHTCU','Ultra Classic Electra Glide','Touring'),FL:m('FLHTCU','Ultra Classic Electra Glide Shrine','Touring')});
put([2010], {FB:m('FLHR','Road King','Touring'),FR:m('FLHRC','Road King Classic','Touring'),FW:m('FLHR','Road King Shrine','Touring'),KH:m('FLTRX','Road Glide Custom','Touring'),KB:m('FLHX','Street Glide','Touring'),KE:m('FLHTK','Electra Glide Ultra Limited','Touring'),FV:m('FLHT','Electra Glide Standard','Touring'),FF:m('FLHTC','Electra Glide Classic','Touring'),FC:m('FLHTCU','Ultra Classic Electra Glide','Touring'),FL:m('FLHTCU','Ultra Classic Electra Glide Shrine','Touring'),FG:m('FLHTCU','Ultra Classic Electra Glide with Sidecar','Touring')});
put([2011], {FB:m('FLHR','Road King','Touring'),FR:m('FLHRC','Road King Classic','Touring'),FW:m('FLHR','Road King Shrine','Touring'),KH:m('FLTRX','Road Glide Custom','Touring'),KG:m('FLTRU','Road Glide Ultra','Touring'),KB:m('FLHX','Street Glide','Touring'),KE:m('FLHTK','Electra Glide Ultra Limited','Touring'),FF:m('FLHTC','Electra Glide Classic','Touring'),FC:m('FLHTCU','Ultra Classic Electra Glide','Touring'),FL:m('FLHTCU','Ultra Classic Electra Glide Shrine','Touring')});

const softail0104 = {BH:m('FXST','Softail Standard','Softail'),BW:m('FLSTCI','Heritage Softail Classic','Softail'),BR:m('FLSTS','Heritage Springer','Softail'),BZ:m('FXSTSI','Springer Softail','Softail'),BS:m('FXSTD','Softail Deuce','Softail'),BV:m('FXSTI','Softail Standard','Softail'),BM:m('FLSTF','Fat Boy','Softail'),BY:m('FLSTSI','Heritage Springer','Softail'),BT:m('FXSTB','Night Train','Softail'),JB:m('FXSTDI','Softail Deuce','Softail'),BJ:m('FLSTC','Heritage Softail Classic','Softail'),BX:m('FLSTFI','Fat Boy','Softail'),BL:m('FXSTS','Springer Softail','Softail'),JA:m('FXSTBI','Night Train','Softail')};
put([2001,2002,2003], softail0104);
put([2004], Object.fromEntries(Object.entries(softail0104).filter(([k])=>!['BR','BY'].includes(k))));
const softail0506 = {BH:m('FXST','Softail Standard','Softail'),BT:m('FXSTB','Night Train','Softail'),BZ:m('FXSTSI','Springer Softail','Softail'),BJ:m('FLSTC','Heritage Softail Classic','Softail'),BN:m('FLSTN','Softail Deluxe','Softail'),BX:m('FLSTFI','Fat Boy','Softail'),BL:m('FXSTS','Springer Softail','Softail'),BR:m('FLSTSC','Springer Classic','Softail'),JB:m('FXSTDI','Softail Deuce','Softail'),BM:m('FLSTF','Fat Boy','Softail'),BV:m('FXSTI','Softail Standard','Softail'),JA:m('FXSTBI','Night Train','Softail'),BS:m('FXSTD','Softail Deuce','Softail'),BW:m('FLSTCI','Heritage Softail Classic','Softail'),JD:m('FLSTNI','Softail Deluxe','Softail'),BY:m('FLSTSCI','Springer Classic','Softail'),JG:m('FLSTFI','Fat Boy Shrine','Softail'),JH:m('FLSTCI','Heritage Softail Classic Shrine','Softail')};
put([2005], softail0506); put([2006], {...softail0506,JE:m('FLST','Heritage Softail','Softail'),JF:m('FLSTI','Heritage Softail','Softail')});
put([2007], {BV:m('FXST','Softail Standard','Softail'),BW:m('FLSTC','Heritage Softail Classic','Softail'),BX:m('FLSTF','Fat Boy','Softail'),BY:m('FLSTSC','Springer Classic','Softail'),JA:m('FXSTB','Night Train','Softail'),JB:m('FXSTD','Softail Deuce','Softail'),JD:m('FLSTN','Softail Deluxe','Softail'),JG:m('FLSTF','Fat Boy Shrine','Softail'),JH:m('FLSTC','Heritage Softail Classic Shrine','Softail'),JL:m('FXSTC','Softail Custom','Softail')});
put([2008], {BV:m('FXST','Softail Standard','Softail'),BW:m('FLSTC','Heritage Softail Classic','Softail'),BX:m('FLSTF','Fat Boy','Softail'),JA:m('FXSTB','Night Train','Softail'),JD:m('FLSTN','Softail Deluxe','Softail'),JE:m('FLST','Heritage Softail','Softail'),JG:m('FLSTF','Fat Boy Shrine','Softail'),JH:m('FLSTC','Heritage Softail Classic Shrine','Softail'),JJ:m('FXCW','Softail Rocker','Softail'),JK:m('FXCWC','Softail Rocker C','Softail'),JL:m('FXSTC','Softail Custom','Softail'),JM:m('FLSTSB','Cross Bones','Softail')});
put([2009,2010], {BW:m('FLSTC','Heritage Softail Classic','Softail'),BX:m('FLSTF','Fat Boy','Softail'),JD:m('FLSTN','Softail Deluxe','Softail'),JG:m('FLSTF','Fat Boy Shrine','Softail'),JH:m('FLSTC','Heritage Softail Classic Shrine','Softail'),JK:m('FXCWC','Softail Rocker C','Softail'),JM:m('FLSTSB','Cross Bones','Softail'),JN:m('FLSTFB','Fat Boy Lo / Fat Boy Special','Softail')});
put([2011], {BV:m('FXST','Softail Standard','Softail'),BW:m('FLSTC','Heritage Softail Classic','Softail'),BX:m('FLSTF','Fat Boy','Softail'),JD:m('FLSTN','Softail Deluxe','Softail'),JG:m('FLSTF','Fat Boy Shrine','Softail'),JH:m('FLSTC','Heritage Softail Classic Shrine','Softail'),JK:m('FXCWC','Softail Rocker C','Softail'),JM:m('FLSTSB','Cross Bones','Softail'),JN:m('FLSTFB','Fat Boy Lo / Fat Boy Special','Softail'),JP:m('FXS','Blackline','Softail')});

put([2001,2002,2003], {GD:m('FXDL','Dyna Low Rider','Dyna'),GH:m('FXD','Dyna Super Glide','Dyna'),GE:m('FXDWG','Dyna Wide Glide','Dyna'),GL:m('FXDXT','Dyna Super Glide T-Sport','Dyna'),GJ:m('FXDX','Dyna Super Glide Sport','Dyna')});
put([2004], {GD:m('FXDL','Dyna Low Rider','Dyna'),GJ:m('FXDX','Dyna Super Glide Sport','Dyna'),GN:m('FXDLI','Dyna Low Rider','Dyna'),GR:m('FXDXI','Dyna Super Glide Sport','Dyna'),GE:m('FXDWG','Dyna Wide Glide','Dyna'),GH:m('FXD','Dyna Super Glide','Dyna'),GP:m('FXDWGI','Dyna Wide Glide','Dyna'),GM:m('FXDI','Dyna Super Glide','Dyna')});
put([2005], {GH:m('FXD','Dyna Super Glide','Dyna'),GM:m('FXDI','Dyna Super Glide','Dyna'),GJ:m('FXDX','Dyna Super Glide Sport','Dyna'),GR:m('FXDXI','Dyna Super Glide Sport','Dyna'),GD:m('FXDL','Dyna Low Rider','Dyna'),GN:m('FXDLI','Dyna Low Rider','Dyna'),GE:m('FXDWG','Dyna Wide Glide','Dyna'),GP:m('FXDWGI','Dyna Wide Glide','Dyna'),GT:m('FXDC','Dyna Super Glide Custom','Dyna'),GV:m('FXDCI','Dyna Super Glide Custom','Dyna')});
put([2006], {GM:m('FXDI','Dyna Super Glide','Dyna'),GV:m('FXDCI','Dyna Super Glide Custom','Dyna'),GN:m('FXDLI','Dyna Low Rider','Dyna'),GP:m('FXDWGI','Dyna Wide Glide','Dyna'),GW:m('FXD35','Dyna 35th Anniversary','Dyna'),GX:m('FXDBI','Dyna Street Bob','Dyna')});
put([2007], {GM:m('FXD','Dyna Super Glide','Dyna'),GV:m('FXDC','Dyna Super Glide Custom','Dyna'),GN:m('FXDL','Dyna Low Rider','Dyna'),GP:m('FXDWG','Dyna Wide Glide','Dyna'),GX:m('FXDB','Dyna Street Bob','Dyna')});
put([2008], {GM:m('FXD','Dyna Super Glide','Dyna'),GV:m('FXDC','Dyna Super Glide Custom','Dyna'),GN:m('FXDL','Dyna Low Rider','Dyna'),GP:m('FXDWG','Dyna Wide Glide','Dyna'),GX:m('FXDB','Dyna Street Bob','Dyna'),GY:m('FXDF','Dyna Fat Bob','Dyna')});
put([2009], {GM:m('FXD','Dyna Super Glide','Dyna'),GV:m('FXDC','Dyna Super Glide Custom','Dyna'),GN:m('FXDL','Dyna Low Rider','Dyna'),GX:m('FXDB','Dyna Street Bob','Dyna'),GY:m('FXDF','Dyna Fat Bob','Dyna')});
put([2010,2011,2012], {GM:m('FXD','Dyna Super Glide','Dyna'),GV:m('FXDC','Dyna Super Glide Custom','Dyna'),GN:m('FXDL','Dyna Low Rider','Dyna'),GP:m('FXDWG','Dyna Wide Glide','Dyna'),GX:m('FXDB','Dyna Street Bob','Dyna'),GY:m('FXDF','Dyna Fat Bob','Dyna')});
put([2013,2014,2015,2016,2017], {GN:m('FXDL','Dyna Low Rider','Dyna'),GP:m('FXDWG','Dyna Wide Glide','Dyna'),GX:m('FXDB','Dyna Street Bob','Dyna'),GV:m('FXDC','Dyna Super Glide Custom','Dyna'),GY:m('FXDF','Dyna Fat Bob','Dyna'),GZ:m('FLD','Dyna Switchback','Dyna')});

// Sportster — entradas separadas por model-year; não extrapolar códigos entre anos.
put([2001], {CA:m('XLH','883/1200 (motor define variante)','Sportster'),CE:m('XLH883','883 Hugger','Sportster'),CG:m('XL1200C','1200 Custom','Sportster'),CH:m('XL1200S','1200 Sport','Sportster'),CJ:m('XL883C','883 Custom','Sportster')});
put([2002,2003], {CA:m('XLH','883/1200 (motor define variante)','Sportster'),CE:m('XLH883','883 Hugger','Sportster'),CG:m('XL1200C','1200 Custom','Sportster'),CH:m('XL1200S','1200 Sport','Sportster'),CJ:m('XL883C','883 Custom','Sportster'),CK:m('XL883R','883R','Sportster')});
put([2004], {CA:m('XL883','883','Sportster'),CJ:m('XL883C','883 Custom','Sportster'),CL:m('XL1200R','1200 Roadster','Sportster'),CG:m('XL1200C','1200 Custom','Sportster')});
put([2005], {CA:m('XL883','883','Sportster'),CJ:m('XL883C','883 Custom','Sportster'),CM:m('XL883L','883 Low','Sportster'),CK:m('XL883R','883R','Sportster'),CL:m('XL1200R','1200 Roadster','Sportster'),CG:m('XL1200C','1200 Custom','Sportster')});
put([2006], {CA:m('XL883','883','Sportster'),CJ:m('XL883C','883 Custom','Sportster'),CM:m('XL883L','883 Low','Sportster'),CK:m('XL883R','883R','Sportster'),CL:m('XL1200R','1200 Roadster','Sportster'),CG:m('XL1200C','1200 Custom','Sportster'),CW:m('XL1200L','1200 Low','Sportster')});
put([2007], {CN:m('XL883','883','Sportster'),CP:m('XL883C','883 Custom','Sportster'),CR:m('XL883L','883 Low','Sportster'),CS:m('XL883R','883R','Sportster'),CT:m('XL1200C','1200 Custom','Sportster'),CV:m('XL1200R','1200 Roadster','Sportster'),CX:m('XL1200L','1200 Low','Sportster'),CY:m('XL50','50th Anniversary','Sportster'),CZ:m('XL1200N','1200 Nightster','Sportster')});
put([2008,2009], {CN:m('XL883','883','Sportster'),CP:m('XL883C','883 Custom','Sportster'),CR:m('XL883L','883 Low','Sportster'),CS:m('XL883R','883R','Sportster'),CT:m('XL1200C','1200 Custom','Sportster'),CV:m('XL1200R','1200 Roadster','Sportster'),CX:m('XL1200L','1200 Low','Sportster'),CZ:m('XL1200N','1200 Nightster','Sportster'),LE:m('XL883N','Iron 883','Sportster'),LA:m('XR1200','XR1200','Sportster')});
put([2010], {CP:m('XL883C','883 Custom','Sportster'),CR:m('XL883L','883 Low','Sportster'),CS:m('XL883R','883R','Sportster'),LE:m('XL883N','Iron 883','Sportster'),CT:m('XL1200C','1200 Custom','Sportster'),CX:m('XL1200L','1200 Low','Sportster'),CZ:m('XL1200N','Nightster','Sportster'),LC:m('XL1200X','Forty-Eight','Sportster'),LA:m('XR1200','XR1200','Sportster'),LD:m('XR1200X','XR1200X','Sportster')});
put([2013], {CR:m('XL883L','SuperLow','Sportster'),CS:m('XL883R','883 Roadster','Sportster'),CT:m('XL1200C','1200 Custom','Sportster'),LE:m('XL883N','Iron 883','Sportster'),LF:m('XL1200V','Seventy-Two','Sportster'),LH:m('XL1200CP','1200 Custom','Sportster'),LC:m('XL1200X','Forty-Eight','Sportster'),LJ:m('XL1200CA','1200 Custom Limited A','Sportster'),LK:m('XL1200CB','1200 Custom Limited B','Sportster'),LD:m('XR1200X','XR1200X (Brazil)','Sportster')});
put([2019], {CR:m('XL883L','SuperLow','Sportster'),CT:m('XL1200C','1200 Custom','Sportster'),LC:m('XL1200X','Forty-Eight','Sportster'),LE:m('XL883N','Iron 883','Sportster'),LL:m('XL1200T','SuperLow 1200T','Sportster'),LM:m('XL1200CX','Roadster','Sportster'),LP:m('XL1200NS','Iron 1200','Sportster'),LR:m('XL1200XS','Forty-Eight Special','Sportster')});

// Touring 2012-2022: códigos estáveis da família; a presença por ano é limitada aos registros abaixo.
const touring1222 = {FB:m('FLHR','Road King','Touring'),FC:m('FLHTCU','Ultra Classic / Electra Glide Ultra Classic','Touring'),KB:m('FLHX','Street Glide','Touring'),KE:m('FLHTK','Ultra Limited','Touring'),KG:m('FLTRU','Road Glide Ultra','Touring'),KH:m('FLTRX','Road Glide','Touring'),KR:m('FLHXS','Street Glide Special','Touring'),KT:m('FLTRXS','Road Glide Special','Touring'),KV:m('FLHRXS','Road King Special','Touring'),KZ:m('FLTRK','Road Glide Limited','Touring')};
put([2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022], touring1222);

// Softail Milwaukee-Eight 2018-2024. O decoder continua condicionado ao model-year.
const m8Softail = {BF:m('FXBR','Breakout','Softail'),BX:m('FLFB','Fat Boy','Softail'),YC:m('FXLR','Low Rider','Softail'),YJ:m('FXBB','Street Bob','Softail'),YF:m('FLFB','Fat Boy','Softail'),YG:m('FLFBS','Fat Boy 114','Softail'),YE:m('FXFBS','Fat Bob 114','Softail'),YB:m('FXBR','Breakout','Softail'),YK:m('FXBRS','Breakout 114','Softail'),YY:m('FLHCS','Heritage Classic 114','Softail'),YV:m('FLHC','Heritage Classic','Softail')};
put([2018,2019,2020,2021,2022,2023,2024], m8Softail);

// Revolution Max: base de 2021-2023 mantida separada dos códigos 2024+ (que mudaram).
put([2021,2022,2023], {ZD:m('RA1250','Pan America 1250','Adventure'),ZE:m('RA1250S','Pan America 1250 Special','Adventure'),ZC:m('RH1250S','Sportster S','Revolution Max'),ZH:m('RH975','Nightster','Revolution Max'),ZF:m('RH975S','Nightster Special','Revolution Max')});

// Touring moderno — entradas por model-year conhecidas/documentadas.
put([2023], {AB:m('FLHXST','Street Glide ST','Touring'),AC:m('FLTRXST','Road Glide ST','Touring'),AD:m('FLHFB','Electra Glide Highway King','Touring'),AE:m('FLHXSANV','Street Glide Special Anniversary','Touring'),AF:m('FLTRXSANV','Road Glide Special Anniversary','Touring'),AG:m('FLHTKANV','Ultra Limited Anniversary','Touring'),KB:m('FLHX','Street Glide','Touring'),KE:m('FLHTK','Ultra Limited','Touring'),KH:m('FLTRX','Road Glide','Touring'),KN:m('FLHTKSHRINE','Ultra Limited Shrine','Touring'),KR:m('FLHXS','Street Glide Special','Touring'),KT:m('FLTRXS','Road Glide Special','Touring'),KV:m('FLHRXS','Road King Special','Touring'),KZ:m('FLTRK','Road Glide Limited','Touring'),PX:m('FLHXSE','CVO Street Glide','CVO Touring')});
put([2024], {KB:m('FLHX','Street Glide','Touring'),KH:m('FLTRX','Road Glide','Touring'),PX:m('FLHXSE','CVO Street Glide','CVO Touring')});
put([2025], {KB:m('FLHX','Street Glide','Touring'),KH:m('FLTRX','Road Glide','Touring'),AK:m('FLHXU','Street Glide Ultra','Touring'),PX:m('FLHXSE','CVO Street Glide','CVO Touring'),TC:m('FLTRXSE','CVO Road Glide','CVO Touring'),TL:m('FLTRXSTSE','CVO Road Glide ST','CVO Touring')});
put([2026], {AH:m('FLHXL','Street Glide Limited','Touring'),AL:m('FLTRXL','Road Glide Limited','Touring'),KB:m('FLHX','Street Glide','Touring'),KH:m('FLTRX','Road Glide','Touring')});

// Softail moderno — os anos recentes têm códigos próprios; MY2025/2026 confirmados em documentação oficial.
put([2025], {BD:m('FLSTFI','Fat Boy Gray Ghost','Softail'),YA:m('FLHC','Heritage Classic','Softail'),YE:m('FXBR','Breakout','Softail'),YF:m('FLFB','Fat Boy','Softail'),YJ:m('FXBB','Street Bob','Softail'),YW:m('FXLRS','Low Rider S','Softail'),YX:m('FXLRST','Low Rider ST','Softail')});
put([2026], {YA:m('FLHC','Heritage Classic','Softail'),YE:m('FXBR','Breakout','Softail'),YF:m('FLFB','Fat Boy','Softail'),YJ:m('FXBB','Street Bob','Softail'),YW:m('FXLRS','Low Rider S','Softail'),YX:m('FXLRST','Low Rider ST','Softail')});

// Revolution Max / Adventure. MY2024 e MY2025 documentados explicitamente.
put([2024], {ZD:m('RA1250','Pan America 1250','Adventure'),ZE:m('RA1250S','Pan America 1250 Special','Adventure'),ZC:m('RH1250S','Sportster S','Revolution Max'),ZH:m('RH975','Nightster','Revolution Max'),ZF:m('RH975S','Nightster Special','Revolution Max')});
put([2026], {ZJ:m('RA1250ST','Pan America 1250 ST','Adventure'),ZC:m('RH1250S','Sportster S','Revolution Max'),ZH:m('RH975','Nightster','Revolution Max'),ZF:m('RH975S','Nightster Special','Revolution Max')});
put([2025], {ZG:m('RA1250SE','CVO Pan America','Adventure'),ZJ:m('RA1250ST','Pan America 1250 ST','Adventure'),ZE:m('RA1250S','Pan America 1250 Special','Adventure'),ZC:m('RH1250S','Sportster S','Revolution Max'),ZH:m('RH975','Nightster','Revolution Max'),ZF:m('RH975S','Nightster Special','Revolution Max')});

const YEAR_CODES: Record<string, number> = {'Y':2000,'1':2001,'2':2002,'3':2003,'4':2004,'5':2005,'6':2006,'7':2007,'8':2008,'9':2009,A:2010,B:2011,C:2012,D:2013,E:2014,F:2015,G:2016,H:2017,J:2018,K:2019,L:2020,M:2021,N:2022,P:2023,R:2024,S:2025,T:2026};

const ENGINE_BY_YEAR_CODE: Array<{from:number;to:number;code:string;info:EngineInfo}> = [
  {from:2000,to:2006,code:'M',info:{engine:'Evolution 883',displacementCc:883}},
  {from:2000,to:2006,code:'P',info:{engine:'Evolution 1200',displacementCc:1200}},
  {from:2000,to:2000,code:'C',info:{engine:'CVO 1550',displacementCc:1550}},
  {from:2000,to:2006,code:'V',info:{engine:'Twin Cam 88',displacementCc:1450}},
  {from:2000,to:2006,code:'W',info:{engine:'Twin Cam 88 EFI',displacementCc:1450}},
  {from:2000,to:2006,code:'Y',info:{engine:'Twin Cam 88B',displacementCc:1450}},
  {from:2001,to:2006,code:'B',info:{engine:'Twin Cam 88B EFI',displacementCc:1450}},
  {from:2007,to:2009,code:'2',info:{engine:'Evolution 883 EFI',displacementCc:883}},
  {from:2007,to:2009,code:'3',info:{engine:'Evolution 1200 EFI',displacementCc:1200}},
  {from:2007,to:2011,code:'4',info:{engine:'Twin Cam 96',displacementCc:1584}},
  {from:2007,to:2011,code:'5',info:{engine:'Twin Cam 96B',displacementCc:1584}},
  {from:2010,to:2019,code:'2',info:{engine:'Evolution 883 EFI',displacementCc:883}},
  {from:2010,to:2022,code:'3',info:{engine:'Evolution 1200 EFI',displacementCc:1202}},
  {from:2010,to:2017,code:'M',info:{engine:'Twin Cam 103',displacementCc:1690}},
  {from:2014,to:2017,code:'L',info:{engine:'Twin-Cooled Twin Cam 103',displacementCc:1690}},
  {from:2016,to:2017,code:'V',info:{engine:'Twin Cam 103B',displacementCc:1690}},
  {from:2016,to:2017,code:'9',info:{engine:'Twin Cam 110B',displacementCc:1802}},
  {from:2017,to:2023,code:'C',info:{engine:'Milwaukee-Eight 107',displacementCc:1745}},
  {from:2017,to:2023,code:'D',info:{engine:'Twin-Cooled Milwaukee-Eight 107',displacementCc:1745}},
  {from:2017,to:2023,code:'P',info:{engine:'Milwaukee-Eight 114',displacementCc:1868}},
  {from:2017,to:2023,code:'F',info:{engine:'Twin-Cooled Milwaukee-Eight 114',displacementCc:1868}},
  {from:2022,to:2023,code:'L',info:{engine:'Milwaukee-Eight 117',displacementCc:1923}},
  {from:2023,to:2025,code:'6',info:{engine:'Milwaukee-Eight VVT 121',displacementCc:1977}},
  {from:2024,to:2026,code:'7',info:{engine:'Milwaukee-Eight 117',displacementCc:1923}},
  {from:2025,to:2026,code:'9',info:{engine:'Milwaukee-Eight 117',displacementCc:1923}},
  {from:2025,to:2026,code:'A',info:{engine:'Milwaukee-Eight 117 H.O.',displacementCc:1923}},
  {from:2026,to:2026,code:'N',info:{engine:'Milwaukee-Eight VVT 117',displacementCc:1923}},
  {from:2024,to:2026,code:'1',info:{engine:'Revolution Max 975T',displacementCc:975}},
  {from:2024,to:2026,code:'4',info:{engine:'Revolution Max 1250T',displacementCc:1252}},
  {from:2024,to:2026,code:'S',info:{engine:'Revolution Max 1252',displacementCc:1252}},
];

function engineFor(year:number|undefined, code:string): EngineInfo|undefined {
  if (!year) return undefined;
  return ENGINE_BY_YEAR_CODE.find(x=>year>=x.from&&year<=x.to&&x.code===code)?.info;
}

const WMI_ORIGIN: Record<string,string> = {
  '1HD':'Estados Unidos', '5HD':'Estados Unidos/Tailândia (exportação, conforme model-year)',
  '932':'Brasil', 'MEG':'Índia', 'MLY':'Tailândia'
};
// Assembly Plant (VIN físico, caractere 11). Os códigos mudam por model-year;
// nunca inferir uma planta por semelhança. Ausência de referência segura => undefined/Unknown na UI.
type PlantRule = { from: number; to: number; code: string; plant: string; wmi?: string[] };
const ASSEMBLY_PLANT_RULES: PlantRule[] = [
  // Estrutura histórica usada pelas famílias Harley-Davidson até MY2009.
  { from: 2000, to: 2009, code: 'Y', plant: 'York, Pennsylvania, USA' },
  { from: 2000, to: 2009, code: 'K', plant: 'Kansas City, Missouri, USA' },
  // Produção CKD brasileira histórica. Restringida ao WMI brasileiro para não
  // transformar o código M de outro contexto/época em Manaus por aproximação.
  { from: 2007, to: 2009, code: 'M', plant: 'H-D Brazil - Manaus, Brasil (CKD)', wmi: ['932'] },

  // Estrutura MY2010+. York/Kansas City/Manaus foram recodificadas B/C/D.
  { from: 2010, to: 2026, code: 'B', plant: 'York, Pennsylvania, USA' },
  { from: 2010, to: 2019, code: 'C', plant: 'Kansas City, Missouri, USA' },
  { from: 2010, to: 2026, code: 'D', plant: 'H-D Brazil - Manaus, Brasil (CKD)' },
  { from: 2011, to: 2021, code: 'N', plant: 'Haryana, Índia (Bawal District, Rewari)' },
  { from: 2019, to: 2026, code: 'S', plant: 'Tasit, Pluagdang, Rayong, Tailândia' },
];

function assemblyPlantFor(year: number | undefined, code: string, wmi: string): string | undefined {
  if (!year || !code) return undefined;
  return ASSEMBLY_PLANT_RULES.find(rule =>
    year >= rule.from && year <= rule.to && rule.code === code && (!rule.wmi || rule.wmi.includes(wmi))
  )?.plant;
}
const TRANSLITERATION: Record<string,number> = {A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9};
const VIN_WEIGHTS=[8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
function vinCheckDigit(vin:string): string {
  const sum=[...vin].reduce((acc,ch,i)=>acc+(/\d/.test(ch)?Number(ch):TRANSLITERATION[ch]||0)*VIN_WEIGHTS[i],0);
  const r=sum%11; return r===10?'X':String(r);
}
function marketFor(year:number|undefined, vin:string): string|undefined {
  if(!year) return undefined;
  // Legacy VINs encode market in VIN position 1 (1=domestic, 5=international).
  if(year<=2009) return vin[0]==='1'?'Domestic':vin[0]==='5'?'International':undefined;
  // 2010+ uses configuration/calibration in VIN position 8; mappings evolve by model-year.
  const code=vin[7];
  if(year<=2023){
    const era:Record<string,string>={1:'Domestic',2:'Domestic (mid-year/special)',3:'California',4:'Domestic (mid-year/special)',5:'California (mid-year/special)',6:'California (mid-year/special)',A:'Canada',B:'Canada (mid-year/special)',C:'HDI',D:'HDI (mid-year/special)',E:'Japan',F:'Japan (mid-year/special)',G:'Australia',H:'Australia (mid-year/special)',J:'Brazil',K:'Brazil (mid-year/special)',L:'Asia Pacific',M:'Asia Pacific (mid-year/special)',N:'India',P:'India (mid-year/special)'};
    return era[code];
  }
  const current:Record<string,string>={1:'Domestic',2:'California',3:'Canada',4:'ENG/EN2/HDI/HD2/HD4',5:'Japan',6:'Australia',7:'Brazil',8:'Asia Pacific',9:'India',0:'ASEAN',A:'China',G:'HD3'};
  return current[code];
}

export function identifyHarleyVehicle(vin?: string): VehicleIdentity | null {
  const normalized=(vin||'').trim().toUpperCase();
  if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(normalized)) return null;
  const modelYear=YEAR_CODES[normalized[9]];
  const modelCode=normalized.slice(4,6);
  let model=modelYear?MODEL_CATALOG[modelYear]?.[modelCode]:undefined;
  const engine=engineFor(modelYear,normalized[6]);
  // MY2000 CA é ambíguo sem o código de motor.
  if(modelYear && modelYear<=2003 && modelCode==='CA' && engine){
    model=engine.displacementCc===883?m('XLH883','883','Sportster'):engine.displacementCc===1200?m('XLH1200','1200','Sportster'):model;
  }
  const vinValid=vinCheckDigit(normalized)===normalized[8];
  const confirmed=Boolean(modelYear&&model&&vinValid);
  const identity:VehicleIdentity={manufacturer:'Harley-Davidson',modelYear,confirmed,confidence:confirmed?'IDENTIFIED':'PARTIAL',vinValid,wmi:normalized.slice(0,3)};
  if(model) Object.assign(identity,model);
  if(engine){identity.engine=engine.engine;identity.displacementCc=engine.displacementCc;}
  identity.manufacturingOrigin=WMI_ORIGIN[identity.wmi!];
  identity.assemblyPlant=assemblyPlantFor(modelYear, normalized[10], identity.wmi!);
  identity.marketConfiguration=marketFor(modelYear,normalized);
  return identity;
}
