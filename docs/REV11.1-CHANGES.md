# ConeCtaHarley Rev11.1

## Alterações funcionais

- Leitura automática do VIN durante a conexão, antes do modo Live.
- A leitura automática reutiliza somente os três blocos VIN já existentes (3C 0F, 3C 10, 3C 11); não executa o Scanner completo.
- Novo identificador local de veículo, separado da camada de comunicação.
- Cartão compacto de identificação no topo da tela inicial.
- O protocolo exibido vem do protocolo efetivamente estabelecido pela conexão.
- A varredura experimental DPID 0x11–0x21 e a lógica de amostragem da Rev11 foram preservadas funcionalmente.

## Catálogo inicial

A Rev11.1 inclui a tabela Touring MY2007 necessária para a primeira validação real. Identificações fora do catálogo não são inventadas: permanecem como identificação parcial até a expansão do catálogo.

## Documentação pública

- A nota técnica experimental foi movida para `docs/J1850-DPID-CATALOG-NOTES.md`.
- Referências nominais a ferramentas/aplicativos usados durante pesquisa e engenharia reversa foram removidas dos arquivos públicos do projeto.

## Simulador - VIN coerente com o catálogo
O VIN de simulação foi substituído por `1HD1KB41X7Y123456`, um VIN sintético coerente com a estrutura MY2007 usada pelo simulador. O identificador local resolve `KB` como FLHX Street Glide e o código de motor `4` como Twin Cam 96 / 1584 cm³. O VIN é exclusivamente de simulação e não representa uma motocicleta real.

## Higienização de referências públicas
O nome do aplicativo em `metadata.json` foi corrigido para `ConeCtaHarley`. Arquivos públicos não devem expor nomes de softwares/fontes usados durante pesquisa e engenharia reversa.

## Vehicle Identity catalog expansion
- Expanded the local VIN catalog across legacy and modern model-year families.
- The simulator VIN is synthetic and resolves locally to a MY2007 FLHX Street Glide.
- Vehicle identity remains independent of the transport/protocol layer.
- Public project documentation intentionally does not name external reverse-engineering applications/tools.
