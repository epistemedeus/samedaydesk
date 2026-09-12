"""Fresh caller cases through installed artifacts; assertions are owner QA."""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from test_consumer import ARCHIVE, PROJECT
from cw06_useful_jobs import consumer as c
from build_zipapp import build


def fresh_requests():
    def input_file(name, body):
        return {'filename':name, 'text':json.dumps(body, ensure_ascii=False)}
    def lock(packages):
        return {'name':'cw39-invoice-worker','version':'7.0.0','lockfileVersion':3,'packages':{'':{'name':'cw39-invoice-worker','version':'7.0.0'},**packages}}
    before=lock({'node_modules/stream-check':{'version':'3.2.1','integrity':'sha512-held-before'},'node_modules/old-fmt':{'version':'0.8.0','integrity':'sha512-old'}})
    after=lock({'node_modules/stream-check':{'version':'3.4.0','integrity':'sha512-held-after'},'node_modules/schema-proof':{'version':'2.1.0','integrity':'sha512-new'}})
    lock_request={'schema':c.REQUEST_SCHEMA,'job':'lockfile-pin-delta','inputs':{'before':input_file('before $(literal); 雪.json',before),'after':input_file('after --version "quoted".json',after)}}
    before={'$schema':'https://json-schema.org/draft/2020-12/schema','type':'object','properties':{'total_cents':{'type':'integer'},'currency':{'type':'string'},'ignored':{'type':'string'}}}
    after={'$schema':before['$schema'],'type':'object','properties':{'total_cents':{'type':'string'},'currency':{'type':'string'},'ignored':{'type':'number'}}}
    drift_request={'schema':c.REQUEST_SCHEMA,'job':'json-schema-webhook-drift','inputs':{'before':input_file('invoice before.json',before),'after':input_file('invoice after.json',after),'used':input_file('held paths.json',{'pointers':['/properties/total_cents','/properties/currency']})}}
    budget_request={'schema':c.REQUEST_SCHEMA,'job':'vendor-budget-impact','inputs':{'before':input_file('queue before.json',{'rows':[{'field':'queue-delivery','value':0.17,'unit':'USD/million-messages'},{'field':'archive-storage','value':0.025}]}),'after':input_file('queue after.json',{'rows':[{'field':'queue-delivery','value':0.23,'unit':'USD/million-messages'},{'field':'archive-storage','value':0.025}]})}}
    return [lock_request,drift_request,budget_request]


def assert_fresh_result(test, request, output, payload):
    test.assertTrue(payload['ok'])
    test.assertTrue(payload['published'])
    manifest=json.loads((output/c.MANIFEST_NAME).read_text())
    test.assertEqual(manifest['release']['archiveSha256'],c.ARCHIVE_SHA256)
    test.assertEqual({p.name for p in output.iterdir()},{a['name'] for a in manifest['artifacts']}|{c.MANIFEST_NAME})
    for artifact in manifest['artifacts']:
        data=(output/artifact['name']).read_bytes()
        test.assertEqual(hashlib.sha256(data).hexdigest(),artifact['sha256'])
        test.assertEqual(len(data),artifact['bytes'])
    job=request['job']
    if job=='lockfile-pin-delta':
        body=json.loads((output/'pin-delta.json').read_text())
        test.assertEqual([body['counts'][key] for key in ['added','removed','changed']],[1,1,1])
        test.assertEqual(body['changed'][0]['name'],'stream-check')
        test.assertEqual(body['changed'][0]['before']['version'],'3.2.1')
        test.assertEqual(body['changed'][0]['after']['version'],'3.4.0')
    elif job=='json-schema-webhook-drift':
        body=json.loads((output/'drift-brief.json').read_text())
        test.assertFalse(body['sample']); test.assertFalse(body['exampleMode'])
        test.assertEqual([row['pointer'] for row in body['impact']['breaking']],['/properties/total_cents'])
        test.assertEqual(body['impact']['unknown'],[])
    else:
        body=json.loads((output/'budget-impact.json').read_text())
        test.assertEqual(body['status'],'partial')
        test.assertEqual(payload['domainStatus'],'partial')
        test.assertTrue(body['gaps'])
        test.assertFalse(body['purchaseAuthority'])
    return manifest


class FreshPackagedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory(prefix='cw39 fresh installed 雪 ')
        cls.root=Path(cls.temp.name)
        cls.pyz=cls.root/'cw06-useful-jobs.pyz'
        build(cls.pyz)
        # Rebuilding cannot recursively embed the previous application.
        build(cls.pyz)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def invoke(self,index):
        request=fresh_requests()[index]
        output=self.root/request['job']
        result=subprocess.run([sys.executable,'-I',str(self.pyz),'--archive',str(ARCHIVE),'--output-dir',str(output)],input=json.dumps(request).encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,cwd=self.root,timeout=20,check=False)
        self.assertEqual(result.returncode,0,result.stdout.decode()+result.stderr.decode())
        return assert_fresh_result(self,request,output,json.loads(result.stdout))

    def test_fresh_lockfile_has_added_removed_and_changed_pins(self): self.invoke(0)
    def test_fresh_used_schema_break_excludes_unused_drift(self): self.invoke(1)
    def test_fresh_budget_preserves_partial_evidence(self): self.invoke(2)

    def test_zipapp_contains_only_runtime_package(self):
        with zipfile.ZipFile(self.pyz) as bundle:
            names=bundle.namelist()
        self.assertTrue(all(name=='__main__.py' or name.startswith('cw06_useful_jobs/') for name in names))
        self.assertFalse(any(name.endswith(('.pyc','.pyz')) or '__pycache__' in name for name in names))

    def test_real_cli_ok_true_with_refused_domain_publishes_nothing(self):
        request={'schema':c.REQUEST_SCHEMA,'job':'vendor-budget-impact','inputs':{key:{'filename':key+'.json','text':'{"notPricing":true}'} for key in ['before','after']}}
        output=self.root/'domain-refused'
        with self.assertRaises(c.ConsumerRefusal) as caught:
            c.consume(request,archive=ARCHIVE,output_dir=output)
        self.assertEqual(caught.exception.code,'engine-failed')
        report=caught.exception.detail['engineReport']
        self.assertTrue(report['ok'])
        self.assertEqual(report['status'],'refused')
        self.assertFalse(output.exists())

    def test_corruption_after_real_engine_success_never_publishes(self):
        original=c._run_owned
        for damage,code in [('truncated','invalid-artifact-content'),('missing','artifact-set-mismatch'),('hardlink','unsafe-artifact')]:
            with self.subTest(damage=damage):
                output=self.root/('damaged-'+damage)
                def run(argv,**kwargs):
                    result=original(argv,**kwargs)
                    if '--out-dir' in argv:
                        stage=Path(argv[argv.index('--out-dir')+1])
                        if damage=='truncated': (stage/'pin-delta.json').write_text('{"partial":')
                        elif damage=='missing': (stage/'pin-delta.md').unlink()
                        else: os.link(stage/'pin-delta.json',stage.parent/'unowned-link')
                    return result
                with patch.object(c,'_run_owned',side_effect=run):
                    with self.assertRaises(c.ConsumerRefusal) as caught:
                        c.consume(fresh_requests()[0],archive=ARCHIVE,output_dir=output)
                self.assertEqual(caught.exception.code,code)
                self.assertTrue(caught.exception.executed)
                self.assertFalse(output.exists())
