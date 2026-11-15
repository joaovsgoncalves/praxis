#!/usr/bin/env python3
"""Capture schema only, read-only; no rows, passwords, sessions or monetary values.
Includes lazy receipts absent from the current database. No cloud operations.
"""
import argparse
import json
from pathlib import Path
import re
import sqlite3

ROOT=Path(__file__).resolve().parents[2]
SOURCE=Path('/root/.hermes/workspaces/apps/praxis/api/praxis.db')
CONNECTOR=Path('/root/.hermes/workspaces/labs/hermes-gpt/extensions/apps_access')
GROUPS={
 'routine': 'tasks habits habit_logs wellness_checks focus_sessions goals rituals gamification achievements weekly_reviews task_checklist_items xp_events task_calendar_queue goal_link_repairs day_rollover_runs',
 'personal': 'user_settings purchase_items projects project_updates continuity_guidance',
 'capture': 'transcriptions capture_queue',
 'identity': 'praxis_users praxis_sessions',
 'legacy': 'nutrition_profile food_items food_meals food_meal_items food_logs body_weight_logs workout_exercises workout_programs workout_days workout_day_exercises workout_sessions workout_session_exercises workout_session_sets nutrition_regimen_items nutrition_regimen_logs nutrition_water_logs',
 'finance': 'finance_settings finance_accounts finance_balances finance_debts finance_payments finance_subscriptions finance_transactions finance_goals finance_sync_log finance_installments finance_card_status finance_fixed_expenses finance_budgets finance_pending_transactions finance_fixed_confirmation_requests finance_statement_coverage finance_obligation_requests finance_obligation_confirmations alfred_payment_receipts',
}
OWNER={table:group for group,tables in GROUPS.items() for table in tables.split()}
LAZY={
 'finance_obligation_requests':ROOT/'api/finance.obligation-confirmations.candidate.mjs',
 'finance_obligation_confirmations':ROOT/'api/finance.obligation-confirmations.candidate.mjs',
 'alfred_payment_receipts':CONNECTOR/'finance_confirm_candidate.mjs',
}

def camel(name):
    return re.sub(r'_([a-z])',lambda m:m[1].upper(),name)

def target(table):
    group=OWNER[table]
    if table=='praxis_users':return 'authUsers/{stableUserId}'
    if table=='praxis_sessions':return 'authSessions/{hashedSessionId}'
    if group=='legacy':return 'privateArchive/{uid}/'+table+' (manifest + object; no active Jota Fit migration)'
    return 'users/{uid}/'+camel(table)+'/{stableId}'

def metadata(db,table,present):
    if table not in OWNER:raise ValueError('unclassified_table: '+table)
    columns=[]
    for r in db.execute(f'PRAGMA table_info("{table}")'):
        name,kind=r[1],r[2]
        money=OWNER[table]=='finance' and kind.upper()=='REAL'
        columns.append({'name':name,'sqlType':kind,'nullable':not bool(r[3]),'defaultSql':r[4],
                        'pkPosition':r[5],'targetEncoding':'integer_cents_exact_conversion' if money else 'preserve_value_and_null_semantics'})
    if table=='praxis_users':
        for c in columns:
            if c['name']=='password_hash':c['targetEncoding']='password_hash_only_restricted_control_collection_never_plaintext'
    if table=='praxis_sessions':
        for c in columns:
            if 'token' in c['name'] or c['name']=='id':c['targetEncoding']='review_session_digest_mapping_preserve_expiry_reject_raw_token_export'
    indexes=[]
    for idx in db.execute(f'PRAGMA index_list("{table}")'):
        indexes.append({'name':idx[1],'unique':bool(idx[2]),'partial':bool(idx[4]),
                        'columns':[x[2] for x in db.execute(f'PRAGMA index_info("{idx[1]}")')],
                        'sql':(db.execute('SELECT sql FROM sqlite_master WHERE type=\'index\' AND name=?',(idx[1],)).fetchone() or [None])[0]})
    return {'table':table,'group':OWNER[table],'presentAtCapture':present,'optionalLazy':table in LAZY,
            'target':target(table),'columns':columns,'indexes':indexes,
            'foreignKeys':[list(x) for x in db.execute(f'PRAGMA foreign_key_list("{table}")')],
            'cutoverPolicy':'preserve IDs, values, dates, links and receipts; reconcile before enabling writes',
            'firestoreIndexDesign':'derive from complete query matrix; SQL index metadata is not deployable Firestore index config'}

def capture():
    db=sqlite3.connect(SOURCE.as_uri()+'?mode=ro',uri=True)
    try:
        db.execute('PRAGMA query_only=ON');db.execute('BEGIN')
        names=[r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        tables=[metadata(db,t,True) for t in names]
        for table,file in LAZY.items():
            if table in names:continue
            text=file.read_text();match=re.search(r'(CREATE TABLE(?: IF NOT EXISTS)?\s+'+table+r'\s*\([^`"]+?\))(?=[`\"])',text,re.I)
            if not match:raise ValueError('lazy_schema_not_found: '+table)
            temp=sqlite3.connect(':memory:')
            try:temp.execute(match[1]);tables.append(metadata(temp,table,False))
            finally:temp.close()
        return {'scope':'schema metadata only; not migration execution or data export','tables':sorted(tables,key=lambda x:x['table']),
                'externalState':[{'file':'apps_access/state/praxis-ledger.sqlite3','destination':'users/{uid}/connectorRequests/{requestHash}',
                'policy':'import pending/done/result and audit history; never reset or replay pending; schema capture deferred to coordinated connector transition'}],
                'limits':['Indexes still require query-by-query Firestore design','New identities/optional tables require recapture before cutover','No actual credentials or rows included']}
    finally:db.close()

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    if args.output.exists():raise SystemExit('Refusing overwrite; compare drift first')
    result=capture();args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'present':sum(t['presentAtCapture'] for t in result['tables']),'lazy_absent':sum(not t['presentAtCapture'] for t in result['tables']),'total':len(result['tables'])}))
