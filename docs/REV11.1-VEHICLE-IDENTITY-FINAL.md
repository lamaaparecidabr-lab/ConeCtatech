# REV11.1 — Vehicle Identity

Esta revisão consolida a identificação da motocicleta como uma camada independente do transporte. J1850 e CAN devem fornecer VIN e protocolo efetivamente detectado; o `HarleyVehicleIdentifier` resolve a identidade sem inferir o protocolo pelo ano.

## Regras
- VIN de 17 caracteres, caracteres ISO válidos e check digit validado.
- Resolução condicionada ao model-year; um código de modelo não é tratado como universal.
- Modelo e motor são resolvidos separadamente.
- `PARTIAL`: VIN estruturalmente legível, mas catálogo/check digit não fecha.
- `IDENTIFIED`: ano + modelo + check digit fecham de forma consistente.
- `VERIFIED`: reservado para futura confirmação cruzada com dados independentes da ECU/calibração; não é atribuído apenas pelo VIN.
- O protocolo exibido na interface vem da conexão real, nunca do VIN.

## Escopo
O registro cobre MY2000–MY2026 e inclui as famílias históricas e modernas presentes no catálogo local: Sportster XL/RH, Dyna, Softail, Touring, CVO, Revolution Max/Adventure e variantes registradas. A ausência de uma combinação específica nunca gera um modelo inventado: retorna identificação parcial.

## Simulador
VIN sintético de teste: `1HD1KB41X7Y123456`.
Resultado esperado: `FLHX Street Glide · 2007`, `Twin Cam 96 · 1584 cm³`; protocolo mostrado pela sessão simulada: `J1850 VPW`.

## Fontes de validação
A construção foi confrontada com tabelas VIN publicadas no Harley-Davidson Service Information Portal para múltiplos model-years e famílias, além de registros públicos de VIN/vehicle attributes para modelos modernos. As fontes de engenharia reversa do protocolo não são expostas nesta documentação pública.

## Guardrail CAN
A futura implementação CAN não deve criar outro decoder de motocicleta. Fluxo obrigatório: `CAN -> VIN -> HarleyVehicleIdentifier -> VehicleIdentity`, igual ao J1850.
