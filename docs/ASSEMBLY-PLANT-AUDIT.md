# ConeCtaHarley — Assembly Plant VIN audit

Escopo: somente o campo **Assembly Plant**, fisicamente o 11º caractere do VIN de 17 caracteres.

## Política de segurança do decoder

- A planta é resolvida por **model-year + código da planta**; quando necessário, também por WMI.
- O decoder não aproxima, não escolhe uma fábrica parecida e não reutiliza automaticamente um código fora do intervalo documentado.
- Sem correspondência segura, `assemblyPlant` permanece indefinido e a interface exibe **Unknown**.
- O card superior de identidade do veículo não foi alterado; a planta aparece apenas no painel técnico ECM / VIN.

## Regras implementadas

| Model-year | Código | Planta | Observação |
|---|---|---|---|
| 2000–2009 | Y | York, Pennsylvania, USA | estrutura histórica Harley |
| 2000–2009 | K | Kansas City, Missouri, USA | estrutura histórica Harley |
| 2007–2009 | M | H-D Brazil - Manaus, Brasil (CKD) | restrito ao WMI 932; intervalo conservador |
| 2010–2026 | B | York, Pennsylvania, USA | estrutura moderna |
| 2010–2019 | C | Kansas City, Missouri, USA | até o último MY documentado usado pelo app |
| 2010–2026 | D | H-D Brazil - Manaus, Brasil (CKD) | estrutura moderna |
| 2011–2021 | N | Haryana, Índia (Bawal District, Rewari) | intervalo conservador documentado |
| 2019–2026 | S | Tasit, Pluagdang, Rayong, Tailândia | MY2019 confirmado em documentação Harley |

## Observação sobre Manaus / M

Há evidência histórica de `M` para Manaus e o VIN brasileiro MY2007 usado na validação do projeto contém `M` no campo Assembly Plant. Para não transformar uma hipótese de anos anteriores em regra global, a implementação começa em MY2007. Motocicletas anteriores com código não coberto retornam **Unknown** até existir referência suficiente para ampliar o intervalo.

## Não incluído

Códigos Buell/East Troy foram encontrados durante a auditoria histórica, mas não foram adicionados ao decoder Harley-Davidson porque o identificador atual declara `manufacturer: Harley-Davidson`. Misturar Buell neste mapa criaria identificação indevida.
