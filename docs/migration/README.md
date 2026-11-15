# Migração: fase 1, contratos e consumidores

Arquitetura aprovada: Vercel + Cloud Run + Firestore + Cloud Storage. Plano completo: `audits/praxis-2026-11-13/PLANO-MIGRACAO-INTEGRAL-FIREBASE.md` no workspace operacional.

## Entrega inicial

- `api/contracts/alfred.json`: catálogo local completo, schemas e mapa primário das 71 operações.
- `scripts/migration/freeze-alfred.py`: captura metadata por `describe`, nunca chama `dispatch`, credenciais ou banco. Recusa sobrescrever baseline; modo `--check` denuncia drift.
- `api/contracts/alfred.contract.test.mjs`: 6 verificações de contrato, inclusive contraprova retirando `preview_hash`.
- `docs/migration/consumers.json`: consumidores ativos, dependências de disco/loopback e destino planejado.

```sh
/usr/bin/node --test api/contracts/alfred.contract.test.mjs
python3 scripts/migration/freeze-alfred.py --check api/contracts/alfred.json
```

Os checks de catálogo vivo exigem o conector no caminho fixo desta VPS. São verificações de migração, não dependência de runtime da futura API. Para rodar fora deste ambiente, preparar fixture revisada do adaptador; não ocultar ausência com sucesso silencioso.

Resultado inicial: testes falharam sem baseline (6/6); após captura, 6/6 passaram; a mutação que remove a exigência de prévia é rejeitada pelo verificador.

## Segunda fatia: comportamento e persistência

- `scripts/migration/alfred-behavior-baseline.py` executa os testes existentes contra o adapter ativo, substituindo referências antigas a cópias candidate apenas em memória. Audit hook proíbe rede, subprocessos, segredos e banco fora do scratch.
- 91 testes isolados passaram. As 71 operações têm chamada de sucesso observada em mocks ou helpers identificados; `api/contracts/alfred-behavior-fixtures.json` conserva 195 amostras explícitas. Isso NÃO é prova da API completa em Firestore ou do MCP na conversa real.
- `alfred-finance.behavior.test.mjs` usa cálculos reais em SQLite em memória, cobrindo os 8 leitores, PF/PJ e órfãos. Os testes atuais do helper de pagamento também rodam com guard: 35 testes desse conjunto passaram.
- Uma asserção antiga do teste externo `test_finance_read.mjs` esperava rejeitar qualquer conta nova. O helper atual permite conta PF válida e rejeita referências órfãs; isso foi provado em testes novos. O teste externo não foi alterado. Execução original: 29/30, com essa divergência documentada, não omitida.
- `docs/migration/schema-manifest.json`: metadata das 56 tabelas atuais + 3 criadas sob demanda. Colunas, índices, referências, destino e conversão monetária registrados; nenhuma linha de dado copiada. Controles de identidade separados.
- Guards têm contraprovas de abertura do banco real, leitura de segredo e rede: todos bloqueados antes do acesso.

## Ainda pendente

- Comparar respostas/efeitos de ponta a ponta de TODAS as rotas entre os dois motores. Fixtures de transporte simulado não fecham essa equivalência.
- Desenho de índices Firestore consulta por consulta e migração do ledger privado do conector; preservar pendências/recibos.
- Consumidores identificados não foram todos executados; a sessão real do Alfred ainda precisa ser homologada.
- A fase 2 implementará persistência: nenhuma API funcional foi alterada nesta fatia.

Mensagem para João encaminhar ao Alfred: `audits/praxis-2026-11-13/fase5/ALFRED-AVISO-INICIO.md`. Uso normal continua; alterações de código/esquema/conector são coordenadas antes, sem pausa geral da rotina.

Sem merge em main, deploy, reinício, alteração do conector vivo, migração de dados reais ou ativação de faturamento. O código do Alfred continua como estava.
