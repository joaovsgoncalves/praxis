# Entrega integrada das fases 3, 4 e 5: SQLite em produção

Publicado e verificado em 16/11/2026 (America/Fortaleza), código `83de315`. Implementação inicial por Claude Opus, retomada por Sonnet 5.5, integração/correções/QA A.N.A. e revisão independente Codex gpt-6.1-sol. Skills: praxis-product-ops, ai-engineering-agent-process e autonomous-coding-agents.

## O que foi publicado

- Fachada assíncrona, repositórios por dono, conexões SQLite dedicadas e encerramento gracioso.
- Rotina: tarefas, checklist, recorrência, metas, XP, hábitos/compostos/quantidades, rituais, foco, bem-estar e virada do dia.
- Fila da agenda pelo storage: intenção na transação da tarefa, dreno depois do commit, retentativa e uma execução por instância. Integração `gog` continua legada e restrita ao dono com agenda ligada.
- Pessoal: frentes/timeline/hierarquia, controle de revisão, orientação diária, configurações, compras, revisões e insights.
- Finanças: configuração, contas/saldos, cadastros, lançamentos, dívidas/baixas idempotentes, agregados, conciliação, cobertura, pendentes e ingest Pluggy.
- Meta vinculada a dívida compara centavos e fecha corretamente, aprovado pelo João.
- API continua exclusivamente SQLite. Firestore só por injeção em testes; não houve recursos pagos, dados reais enviados à nuvem nem corte.

## Provas da versão publicada

| Prova | Resultado |
|---|---|
| API completa com emulador loopback | 872/872, zero falhas e skips |
| API SQLite | 654/726, zero falhas; 72 skips dependem do Firestore e foram executados acima |
| Lint + build | aprovados |
| E2E local descartável | 33 aprovados: check, rotina, finanças e contas |
| Ensaio com cópia local do banco real | 33 GET iguais à versão antiga (só generated_at normalizado); criar/concluir/reabrir/excluir devolve XP |
| Produção local e pela Vercel | 33 GET autenticados por origem = 200; anônimo = 401 |
| Navegador móvel autenticado | 9 telas, nenhum erro JS/HTTP nem overflow; Finanças inspecionada visualmente |
| FinanceTotals e XP antes/depois da ativação | iguais |
| npm audit da API em produção | zero vulnerabilidades |

Evidência sem dados pessoais: `evidence/release-phases345.json`. Logs, cópia e captura de tela ficam em scratch privado, não no Git.

## Correções que a revisão independente exigiu

1. Validar o plano inteiro do ingest antes de qualquer commit. No SQLite, até 2.000 lançamentos ficam em uma transação. No Firestore, cada lote é replanejado sob transação, e saldo/cobertura/cartão/pendentes/log só são confirmados no último.
2. Coordenar chamada síncrona legada da agenda com a fila da conexão SQLite, sem transação aberta; reler a tarefa depois da espera para não criar evento de tarefa já excluída.
3. Carimbo de intenção monotônico, evitando perder nova intenção no mesmo milissegundo.
4. Testar XP sem presumir ordem: checks-first paga 540, manual-first preserva o legado sem bônus, misto verifica origem única e espelho exato. Nenhuma rejeição é aceita como sucesso.
5. Corrigir retorno do dreno para conta sem agenda: sempre Promise, sem queda por `.catch` em objeto.

Contraprovas próprias: ingest anterior falha em inválido/reenvio de 120 itens; carimbo antigo perde intenção; limite 500 recusa 2.000; snapshot antigo cria evento órfão; chave de baixa desligada quebra idempotência; revisão de frente desligada quebra 409. Código restaurado e retestado.

## Alfred e limites da entrega

O conector vivo não mudou. Os exports síncronos existentes de finance.js e pluggyIngest.js foram preservados; alguns helpers puros ganharam export. Request IDs, preview/preview_hash, recibos e pendências não foram alterados. Nenhuma operação pendente foi repetida.

Não confundir publicação SQLite com fechamento da migração integral:
- Fase 2 ainda tem chamadores de identidade/arquivos/captura legados a portar nas etapas correspondentes.
- Rotina e pessoal estão integrados e exercitados. Firestore real, limites/índices/custo, implantação Cloud Run e processamento distribuído ainda não foram homologados.
- Finanças HTTP/SQLite foi entregue; o aceite financeiro integral no destino ainda depende da fase 6: `financeReceipts` no Firestore é vazio enquanto os recibos do Alfred não forem portados. Não ativar ingest real nesse motor antes disso.
- /finance/seed e /finance/sync (Pierre aposentado) seguem legacyOnly, como permitido no contrato.
- Sementes da gamificação, sentinelas de unicidade e `_row` dos dados antigos precisam ser levados pelo importador. Não há importação automática no restart.
- O legado add-xp desbloqueia conquista sem bônus; preservado, não foi corrigido como mudança de produto.

## Segurança da ativação e retorno

Backup padrão + backup SQLite íntegro imediatamente antes de ativar: `/root/.hermes/backups/praxis/pre-ativacao345-20261116T141346Z/praxis.db`. Código anterior preservado em `ana/pre345-production` (`bcbadad`), dependências anteriores em scratch. Retorno de código não exige restaurar dados: nenhuma migração destrutiva foi executada.

A alteração alheia em `api/transcribe_audio.py` continua na árvore de produção, fora dos commits; checksum foi conferido antes e depois. Não sobrescrever nem guardar em stash.

## Próxima etapa

Fase 6: endpoints de compatibilidade financeira, tirar os oito leitores e a confirmação do Alfred do SQLite e preservar/importar recibos. Alterar o conector vivo exige coordenação; a publicação atual não requer ação dele.
