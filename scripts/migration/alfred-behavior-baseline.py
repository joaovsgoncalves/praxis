#!/usr/bin/env python3
"""Baseline de comportamento do conector atual. Só mocks/SQLite temporário.
Reutiliza testes existentes contra o adapter ATIVO, não cópias *_candidate antigas.
Produção, segredos, rede e subprocessos reais são bloqueados por audit hook.
"""
import argparse
import copy
import math
import importlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from typing import Any, cast

SOURCE=Path('/root/.hermes/workspaces/labs/hermes-gpt/extensions/apps_access')
FILES=['test_praxis_adapter','test_praxis_extended','test_finance_read',
       'test_finance_confirm_wrapper','test_finance_fixed_schema',
       'test_finance_balance_correction','test_finance_subscription_update','test_guidance_access']
ROOT=Path(__file__).resolve().parents[2]
SCRATCH=Path('/root/.hermes/cache/scratch')
os.environ['TMPDIR']=str(SCRATCH)
tempfile.tempdir=str(SCRATCH)
sys.dont_write_bytecode=True
sys.path.insert(0,str(SOURCE))

def guard(event,args):
    if event in ('socket.connect','socket.connect_ex','socket.bind','subprocess.Popen','os.system'):
        raise RuntimeError('external_effect_forbidden_in_contract_suite')
    if event=='open' and args and isinstance(args[0],(str,bytes,os.PathLike)):
        p=Path(os.fsdecode(args[0])).resolve()
        if '/secrets/' in str(p) or p==SOURCE/'state'/'praxis-ledger.sqlite3' or (p.name.startswith('praxis.db') and not p.is_relative_to(SCRATCH)):
            raise RuntimeError('production_file_forbidden_in_contract_suite')
    if event=='sqlite3.connect':
        name=str(args[0])
        if name!=':memory:' and not Path(name).resolve().is_relative_to(SCRATCH):
            raise RuntimeError('non_scratch_sqlite_forbidden')

sys.addaudithook(guard)
active=importlib.import_module('praxis_adapter')
cases=[]

def trace(frame,event,arg):
    if event!='return' or frame.f_code.co_name!='dispatch':return
    filename=Path(frame.f_code.co_filename)
    if filename.parent!=SOURCE:return
    fixed={'finance_confirm.py':'finance.bill.confirm_payment','finance_balance_correction.py':'finance.balance.confirm_zero','finance_subscription_update.py':'finance.subscriptions.update'}
    if filename.name!='praxis_adapter.py' and filename.name not in fixed:return
    op=frame.f_locals.get('operation') or fixed.get(filename.name)
    if op not in active.OPS or not isinstance(arg,dict):return
    payload=frame.f_locals.get('payload')
    # Test fixtures only; transport cannot touch production under guard.
    cases.append(copy.deepcopy({'operation':op,'layer':filename.name,'payload':payload,'dry_run':frame.f_locals.get('dry_run'),
                  'request_id':frame.f_locals.get('request_id'),'result':arg}))

class Result(unittest.TextTestResult):
    def startTest(self,test):
        super().startTest(test)
        self.started=len(cases)
    def stopTest(self,test):
        for c in cases[self.started:]:c['test']=test.id()
        super().stopTest(test)

class ReaderRouting(unittest.TestCase):
    def test_every_financial_reader_routes_without_ledger_or_http(self):
        for op in active.FINANCE_OPS:
            payload={'month':'2026-11'} if op=='finance.month' else {'from':'2026-11-01','to':'2026-11-30'} if op=='finance.transactions.list' else {}
            with self.subTest(op=op), patch.object(active._fin,'dispatch',return_value={'ok':True,'fixture_layer':'routing_only'}) as helper, patch.object(active,'_http') as http, patch.object(active,'_ledger') as ledger:
                self.assertTrue(active.dispatch(op,payload)['ok'])
                helper.assert_called_once();http.assert_not_called();ledger.assert_not_called()

def json_fixture(value):
    if isinstance(value,float) and not math.isfinite(value):return {'invalid_python_number':repr(value)}
    if isinstance(value,list):return [json_fixture(x) for x in value]
    if isinstance(value,dict):return {k:json_fixture(v) for k,v in value.items()}
    return value

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    suite=unittest.TestSuite()
    for name in FILES:
        module=importlib.import_module(name)
        if hasattr(module,'a'):setattr(module,'a',active)
        suite.addTests(unittest.defaultTestLoader.loadTestsFromModule(module))
    suite.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(ReaderRouting))
    sys.setprofile(trace)
    try:r=unittest.TextTestRunner(verbosity=1,resultclass=cast(Any, Result)).run(suite)
    finally:sys.setprofile(None)
    coverage={op:{'calls':0,'successful_calls':0,'preview':False,'applied':False} for op in active.OPS}
    for c in cases:
        d=coverage[c['operation']];d['calls']+=1
        if c['result'].get('ok'):
            d['successful_calls']+=1
            d['preview']|=c['result'].get('dry_run') is True
            d['applied']|=c['dry_run'] is False
    report={'scope':'Current adapter with mocked transport; NOT live production/API parity',
            'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),
            'tests_against_active_adapter':True,'coverage':coverage,
            'uncovered':[op for op,d in coverage.items() if not d['successful_calls']],
            'cases':cases}
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(json_fixture(report),ensure_ascii=False,indent=2,allow_nan=False)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k not in ('cases','coverage')},ensure_ascii=False))
    return 0 if r.wasSuccessful() else 1

if __name__=='__main__':sys.exit(main())
