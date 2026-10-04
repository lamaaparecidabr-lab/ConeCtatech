# Consolidação J1850 antes de CAN

Este pacote consolida a base V2 pré-teste, correção de ciclo de sessões do Datalog, catálogo J1850 extraído do catálogo técnico de referência e resolução de protocolo sensível a mercado.

## Incorporado
- Catálogo catálogo técnico de referência J1850 estruturado e rastreável.
- Decoder genérico orientado pelas definições referência técnica para DPIDs mapeados.
- 0x18 corrigido pelas fórmulas catálogo técnico de referência.
- Estados REFERENCE_MAPPED / REAL_VALIDATED / UNSUPPORTED / DETECTED_UNMAPPED / UNKNOWN.
- Perfil de capability J1850 por resposta real da ECM.
- Resolução de protocolo separando previsão VIN/mercado/família da confirmação de transporte.
- Regra brasileira MY<=2012 como J1850/4 vias esperado, sempre subordinada ao handshake real.
- Dados futuros de módulos/segurança devem ser preservados no catálogo, mas não ativados nesta fase.
- Ciclo Datalog: pausar, finalizar, nova sessão e BASE independente preservados.

## Não alterado por decisão de projeto
- Handshake crítico não recebe auto-VIN.
- Temperatura passiva continua RAW-40; DPID 0x12 ativo continua RAW-16.
- Nenhum AFR narrowband é sintetizado.
- DTC 0x11 Histórico / 0x13 Corrente.
- 0x1E-0x21 negativos continuam capability não suportada, não falha de comunicação.
- Segurança/FOB não é executada nesta fase.
- CAN ainda não é implementado; o resolver já reserva a seleção arquitetural futura.
