# Vehicle Identity — auditoria REV11.1

A camada de identidade é independente do transporte J1850/CAN. O protocolo exibido na UI vem da conexão real.

## Regras
- VIN de 17 caracteres, sem I/O/Q.
- check digit ISO/NHTSA validado antes de marcar IDENTIFIED.
- model-year seleciona a tabela; códigos não são extrapolados entre anos como verdade universal.
- PARTIAL = VIN estruturalmente lido mas combinação não fechada; IDENTIFIED = ano/modelo + check digit coerentes; VERIFIED fica reservado para futura correlação com ECM/calibração.
- WMI, mercado/configuração e planta são campos separados.

## Cobertura documental incorporada
Inclui tabelas históricas e modernas consolidadas no catálogo local. MY2000 foi adicionado explicitamente (Sportster, Dyna, Softail, Touring, FLTRSEI/CVO e FXR4) e o caso ambíguo CA é resolvido pelo código do motor.

## Regra de segurança
Ausência de entrada ou combinação inconsistente nunca gera modelo inventado. A UI deve cair em identificação parcial.

## Simulador
VIN sintético: `1HD1KB41X7Y123456`. O check digit X é válido e a combinação resolve FLHX Street Glide MY2007 / Twin Cam 96.
