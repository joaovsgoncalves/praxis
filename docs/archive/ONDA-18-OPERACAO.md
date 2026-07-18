# Onda 18 — Backup + checklist 10/10

| ID | Task | Status |
|----|------|--------|
| P18-T01 | `scripts/praxis-backup.sh` + meta `last-backup.json` | **done** |
| P18-T02 | `install-praxis-backup-cron.sh` (03:15 diário) | **done** |
| P18-T03 | `GET /api/ops/backup-meta` | **done** |
| P18-T04 | Smoke: avoidance, captures, backup-meta | **done** |
| P18-T05 | `checklist-praxis-10.sh` + `CHECKLIST-PRAXIS-10.md` | **done** |

## Backup

- Rotação: 7 daily, 4 weekly, 12 monthly (gzip).
- Online via `sqlite3 .backup` (compatível com WAL).
- Offsite opcional: `RCLONE_REMOTE=gdrive:/praxis-backups ./scripts/praxis-backup.sh`

## Cron na VPS

```bash
chmod +x scripts/praxis-backup.sh scripts/install-praxis-backup-cron.sh
./scripts/install-praxis-backup-cron.sh
./scripts/praxis-backup.sh   # teste imediato
```

Log: `/var/log/praxis-forja-backup.log`