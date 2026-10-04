# Auditoria final J1850 — catálogo técnico de referência

Fonte primária desta auditoria: ferramenta técnica de referência fornecida ao projeto fornecido ao projeto (Printed Help, arquivos técnicos de referência e biblioteca/configuração de datastreams extraído estaticamente). Nenhum executável desconhecido foi executado.

## Inventário recuperado
- 391 PIDBase.
- 675 relações DPID→PID no catálogo completo.
- 17 DataStreams totais.
- 9 DataStreams J1850.
- 73 relações DataStream→DPID totais.
- 71 relações OS Level→OS Type.
- 17 DPIDs J1850 técnicos decodificáveis no catálogo: 0x11–0x21.
- 89 relações PID efetivamente carregadas no catálogo J1850 0x11–0x21.
- 177 descrições DTC do quick-reference referência técnica agora preservadas no app; a própria documentação informa que nem todo código se aplica a todo veículo.

## Nove DataStreams J1850
0 Generic Data — 11,12,15,16,17,18,1B,13,19.
1 Open Loop Tuning Data — 15,16,17,18,19,1A,1B.
2 Dyno Data — 1B,12,17.
3 Generic O2 Data — 11,12,15,16,17,18,1B,13,1D,19.
4 Destroyer Data — 11,12,13,16,1B — FactoryOnly.
5 DBW Data — 11,12,15,16,17,18,1B,13,1D,1F,20.
6 Tuning Data — 11,12,15,16,17,18,1C,1D,1A.
7 Spark Data — 11,13,19.
8 Cam Timing Data — 00,01,02,03,04,05 — J1850_REFERENCE, FactoryOnly.

## Regra operacional
A varredura diagnóstica comum permanece 0x11–0x21, somente leitura. DPIDs 00–05 do CamTune NÃO são adicionados à varredura comum: o catálogo os marca FactoryOnly/J1850_REFERENCE e a ajuda referência técnica exige calibração MT8/9 apropriada para CamTune; sem isso os dados são inválidos. Eles ficam preservados para uma futura função CamTune explicitamente controlada.

DPIDs 0x14 e 0x21 possuem definições PID no catálogo, mas não aparecem associados a um DataStream J1850 público na matriz DsToDpid extraída. Permanecem como descoberta técnica: resposta positiva pode ser registrada/decodificada como REFERENCE_MAPPED; resposta negativa = UNSUPPORTED naquela ECM.

## Condições especiais encontradas na documentação
- Generic Data J1850: ~5–6 frames/s esperados.
- Dyno Data J1850: ~12–15 frames/s esperados e é o Data Type exigido pela ajuda referência técnica para Dyno estimator em DLC 4 pinos/J1850.
- VTune exige calibração custom MT8/9 instalada; a coleta rodando deve operar regiões de carga de forma estável. Sem MT8/9 não devemos chamar nosso datalog comum de “VTune”.
- CamTune exige calibração MT8/9 apropriada. IVO: moto parada, quente, idle 900–1100 rpm. IVC: dinamômetro, ~3500 rpm e carga/MAP controlados. Não é teste comum de rua.
- O2/TBW possuem parâmetros adicionais somente quando equipados/suportados.
- A ajuda referência técnica diz explicitamente que anos/modelos não são todos iguais.
- 4-pin DLC = J1850; 6-pin DLC = CAN no contexto da interface referência técnica. O ConeCtaHarley ainda deve usar identidade/mercado como expectativa e comunicação real como confirmação.

## Parâmetros J1850 cobertos pelo catálogo
0x11: RPM, Desired Idle, Battery, MAP, TPS.
0x12: Engine Temp, IAT, ET/IAT/MAP/TPS sensor volts.
0x13: Spark F/R low-res, Knock Fast F/R, IAC, Engine Flag 1.
0x14: Injector F/R, Purge duty, O2, Fuel Trim, Vehicle Speed.
0x15: AFR Desired, AF Feedback F/R, MAP/default/read2.
0x16: Accel Enrichment, Injector BPW F/R.
0x17: Decel Enleanment, Spark F/R high-res.
0x18: VE F/R, VE New F/R, Warm Up AFR, IAC.
0x19: Air/Charge/Engine/Head temp, TPS, TPS sensor.
0x1A: O2 Raw F/R, Knock Retard F/R.
0x1B: RPM, Runtime, Barometer, Sync counter, Vehicle Speed.
0x1C: Battery, Ion-Q F/R, Factory/referência técnica fields.
0x1D: O2 F/R, Integrator F/R, Long Term F/R.
0x1E: Crank Time, Sidestand Sensor, Gear Position.
0x1F: Cruise target, Fuel Pump volts, Engine Flag 2, BARO analog, Throttle Motor duty, TGS%.
0x20: post-cat O2 F/R, TGS1/TGS2, TPS2, Cruise switch volts.
0x21: Cruise disengage reason codes 1–6.

## O que NÃO deve ser inferido
- referência técnica catalogado não significa capability presente em toda ECM.
- REFERENCE_MAPPED não significa validação física.
- DPID negativo não é falha de comunicação.
- Narrowband não é AFR medido.
- VTune/CamTune não devem ser simulados por um datalog genérico sem seus pré-requisitos.
- FactoryOnly não deve virar comando automático.

## Estado de fechamento offline
O material catálogo técnico de referência fornecido foi varrido em quatro camadas: ajuda impressa, DataStreams/DM3, catálogo configuração de datastreams e código de resolução biblioteca técnica. O que resta para J1850 é validação física por ECM/família/mercado e testes de movimento; não há justificativa técnica para adicionar comandos FactoryOnly à rotina comum sem a condição/calibração requerida.
