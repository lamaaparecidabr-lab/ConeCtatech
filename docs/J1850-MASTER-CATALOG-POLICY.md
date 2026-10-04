# Catálogo Mestre J1850

Todo conhecimento J1850 comprovável deve ser preservado no app, mesmo quando a função ainda não está exposta na interface.

Campos conceituais: protocolo, mercado, família, módulo/nó, serviço, DataStream, DPID, PID, ordem, tamanho, endian, gain, offset, unidade, OS/ECM, fonte, status de validação e evidência real.

Estados: REFERENCE_MAPPED, REAL_VALIDATED, UNSUPPORTED, DETECTED_UNMAPPED, UNKNOWN.

Finalidade reservada: TELEMETRY, IDENTIFICATION, DTC, ACTIVE_TEST, CONFIGURATION, SECURITY, UNKNOWN. Dados de TSM/TSSM/HFSM encontrados durante a mineração devem ser catalogados, mas funções de configuração/segurança não são ativadas nesta fase.

O catálogo referência técnica extraído contém 17 DataStreams totais, 9 J1850, 73 relações DataStream->DPID, 675 relações DPID->PID e 391 PIDs na origem. O subconjunto JSON embarcado contém as definições necessárias aos DataStreams J1850 extraídos, sem inventar variantes por VIN ausentes da fonte referência técnica.
