import copy
import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import ROOT, make_handler, validate


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'gpus.json'
        self.path.write_bytes((ROOT / 'data/gpus.json').read_bytes())
        self.original = json.loads(self.path.read_text(encoding='utf-8'))
        self.http = ThreadingHTTPServer(('127.0.0.1', 0), make_handler(self.path))
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
        self.url = f'http://127.0.0.1:{self.http.server_port}'

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        self.temp.cleanup()

    def request(self, path, body=None, origin=True):
        headers = {'Content-Type': 'application/json'}
        if origin:
            headers['Origin'] = self.url
        request = Request(self.url + path, data=None if body is None else json.dumps(body).encode(), headers=headers)
        try:
            with urlopen(request) as response:
                return response.status, json.loads(response.read())
        except HTTPError as error:
            return error.code, json.loads(error.read())

    def test_save_backup_and_revision_conflict(self):
        status, state = self.request('/api/data')
        self.assertEqual(status, 200)
        changed = copy.deepcopy(state['data'])
        changed['gpus'][0]['price_jpy'] = 12345
        changed['gpus'][0]['purchase_url'] = 'https://example.org/buy/t4'
        payload = {'data': changed, 'revision': state['revision']}
        self.assertEqual(self.request('/api/data', payload)[0], 200)
        self.assertEqual(json.loads(self.path.read_text(encoding='utf-8')), changed)
        backups = list((self.path.parent / 'backups').glob('*.json'))
        self.assertEqual(len(backups), 1)
        self.assertEqual(json.loads(backups[0].read_text(encoding='utf-8')), self.original)
        self.assertEqual(self.request('/api/data', payload)[0], 409)

    def test_browser_modules_have_javascript_mime_type(self):
        with urlopen(self.url + '/app.mjs') as response:
            self.assertEqual(response.headers.get_content_type(), 'text/javascript')
            self.assertIn(b'import ', response.read())

    def test_invalid_data_and_foreign_origin_never_write(self):
        raw = self.path.read_bytes()
        self.assertEqual(self.request('/api/data', {'data': self.original}, origin=False)[0], 403)
        bad = copy.deepcopy(self.original)
        bad['gpus'].append(bad['gpus'][0])
        self.assertEqual(self.request('/api/data', {'data': bad})[0], 400)
        bad = copy.deepcopy(self.original)
        bad['gpus'][0]['performance']['cuda_fp32']['source'] = 'missing'
        self.assertEqual(self.request('/api/validate', {'data': bad})[0], 400)
        for invalid_link in ('javascript:alert(1)', 'data:text/html,bad', ['https://example.org/one', 'https://example.org/two']):
            bad = copy.deepcopy(self.original)
            bad['gpus'][0]['purchase_url'] = invalid_link
            self.assertEqual(self.request('/api/validate', {'data': bad})[0], 400)
        self.assertEqual(self.path.read_bytes(), raw)

    def test_validation_supports_extensible_benchmarks(self):
        sample = copy.deepcopy(self.original)
        sample['benchmarks'].append({'id':'latency-v1','name':'Latency','unit':'ms','direction':'lower','conditions':'Test fixture; batch 1, GPU 1'})
        sample['gpus'][0]['results']['latency-v1'] = {'value':5,'source':'spec','kind':'measured'}
        self.assertEqual(self.request('/api/validate', {'data':sample})[0],200)
        sample['gpus'][0]['results']['latency-v1']['value'] = -1
        self.assertEqual(self.request('/api/validate', {'data':sample})[0],400)
        for value in [True, float('nan'), float('inf')]:
            sample = copy.deepcopy(self.original)
            sample['gpus'][0]['power_w'] = value
            with self.assertRaises(ValueError):
                validate(sample)


if __name__ == '__main__':
    unittest.main()
