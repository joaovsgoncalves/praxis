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

## Ainda não concluído na fase 1

- Fixtures de resposta e efeitos de TODAS as operações, além dos schemas.
- Matriz completa de tabelas/índices/coleções e política de campos, incluindo recibos criados sob demanda.
- Consumidores identificados não foram todos executados; a sessão real do Alfred ainda precisa ser homologada.
- A fase 2 implementará persistência: nenhuma API funcional foi alterada nesta fatia.

Sem merge em main, deploy, reinício, alteração do conector vivo, migração de dados reais ou ativação de faturamento. O código do Alfred continua como estava.
