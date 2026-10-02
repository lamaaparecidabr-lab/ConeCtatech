# ConeCtaHarley — Vehicle Identity Catalog

Catálogo local usado exclusivamente para transformar o VIN já lido da motocicleta em identidade de veículo exibida na interface.

Princípios:
- nenhuma consulta de VIN adicional é criada pelo catálogo;
- J1850 e CAN compartilham a mesma camada de identificação;
- o protocolo mostrado na interface vem da conexão efetiva, não do VIN;
- modelo não encontrado não é inventado;
- o VIN completo não é necessário para qualquer estatística remota futura.

A cobertura é organizada por model-year e deve ser ampliada somente com combinações documentadas. O simulador utiliza um VIN sintético MY2007 coerente com FLHX Street Glide para exercitar a interface.
