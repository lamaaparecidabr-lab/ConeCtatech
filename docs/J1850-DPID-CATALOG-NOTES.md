# ConeCtaHarley — J1850 DPID catalog notes (Rev11 experimental)

Documento técnico público do experimento de leitura ativa J1850 da Rev11.

## Escopo

- A varredura experimental atual usa somente o transporte J1850 já implementado.
- DPID 0x11 é a fonte ativa já validada para tensão ECM e dados auxiliares.
- DPIDs 0x12–0x21 permanecem experimentais e devem ser confirmados em motocicleta real antes de promover qualquer valor para a interface.
- Respostas experimentais permanecem preservadas no log para comparação e validação.

## Separação de protocolos

Grupos destinados a CAN não devem ser enviados pelo caminho J1850 atual. A futura implementação CAN deve possuir transporte/protocolo separado e compartilhar apenas os modelos de dados já validados quando aplicável.

## Regra de validação

Nenhum campo experimental deve substituir uma fonte já validada sem evidência reproduzível em teste real.
