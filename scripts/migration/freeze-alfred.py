#!/usr/bin/env python3
"""Snapshot/check de contratos, somente describe; nunca chama dispatch nem credenciais.

Não certifica execução do MCP público nem equivalência de um backend novo.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
ADAPTER = Path('/root/.hermes/workspaces/labs/hermes-gpt/extensions/apps_access/praxis_adapter.py')
MOUNTS = {'tasks':'tasks','habits':'habits','wellness':'wellness','focus':'focus',
          'goals':'goals','rituals':'rituals','purchases':'purchases','settings':'user',
          'gamification':'gamification','insights':'insights','weeklyReviews':'weekly-reviews',
          'projects':'projects','finance':'finance','ops':'categories'}
DIRECT = {
    'local-readonly': {'kind':'direct_sqlite_read', 'wrapper':'finance_read.py',
                      'implementation':'finance_read.mjs', 'table_scope':'finance_*'},
    'local-confirm-payment': {'kind':'direct_sqlite_write', 'wrapper':'finance_confirm.py',
                             'implementation':'finance_confirm_candidate.mjs',
                             'table_scope':'finance_* and lazy alfred_payment_receipts'},
}
PATTERN = r"%s\.(get|post|put|patch|delete)\(\s*['\"]([^'\"]+)"

def normalize(route):
    return re.sub(r'\{[^}]+\}|:[\w]+', '{}', route).rstrip('/')

def route_declarations():
    found = []
    api = ROOT / 'api'
    for file, mount in MOUNTS.items():
        p = api / 'routes' / (file + '.js')
        for method, route in re.findall(PATTERN % 'router', p.read_text()):
            found.append((method.upper(), '/api/' + mount + route.rstrip('/'), str(p.relative_to(ROOT))))
    for p in [*(api/'routes').glob('*.js'), api/'server.js']:
        for method, route in re.findall(PATTERN % 'app', p.read_text()):
            found.append((method.upper(), route, str(p.relative_to(ROOT))))
    for name in ['finance.fixed-confirmation.candidate.mjs', 'finance.obligation-confirmations.candidate.mjs']:
        p = api/name
        for method, route in re.findall(PATTERN % 'router', p.read_text()):
            found.append((method.upper(), '/api/finance' + route, str(p.relative_to(ROOT))))
    return found

def capture():
    spec = importlib.util.spec_from_file_location('alfred_contract_capture', ADAPTER)
    if spec is None or spec.loader is None:
        raise RuntimeError('adapter_loader_unavailable')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    catalog = module.describe()  # Pure metadata; do NOT call dispatch to capture examples.
    routes = route_declarations()
    mappings = {}
    for operation, definition in sorted(catalog['operations'].items()):
        method, route = definition['method'], definition['path']
        if route in DIRECT:
            mappings[operation] = dict(DIRECT[route])
            continue
        matches = sorted(set(p for m, r, p in routes if m == method and normalize(r) == normalize(route)))
        if not matches:
            raise ValueError('operation_without_route: ' + operation)
        mappings[operation] = {'kind':'http', 'method':method, 'path':route, 'files':matches}
    return {'format_version':1, 'scope':'Local adapter describe + static primary route declarations, not public MCP execution',
            'adapter':str(ADAPTER), 'catalog':catalog, 'mappings':mappings,
            'required_semantics':['preview_before_sensitive_write','stable_request_id','pending_not_auto_retried',
                                  'PF_only_finance','bank_freshness_not_read_time','CAS_project_and_guidance',
                                  'task_XP_recurrence_atomic','fixed_confirmation_not_cash_payment']}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--output', type=Path)
    group.add_argument('--check', type=Path)
    args = parser.parse_args()
    live = capture()
    if args.check:
        if not args.check.is_file():
            print('contract_missing', file=sys.stderr); return 1
        expected = json.loads(args.check.read_text())
        if expected != live:
            print('contract_drift: inspect catalog/schema/route changes; do not blindly regenerate', file=sys.stderr); return 1
        print('contract_match: operations=' + str(len(live['mappings'])))
    else:
        if args.output.exists():
            print('refusing_to_overwrite_contract: compare and approve drift explicitly',file=sys.stderr); return 1
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.output.write_text(json.dumps(live,ensure_ascii=False,indent=2)+'\n')
        print('contract_created: operations=' + str(len(live['mappings'])))
    return 0

if __name__ == '__main__':
    sys.exit(main())
