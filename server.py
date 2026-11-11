"""GPU comparison workspace. Python 3.10+, standard library only."""
import argparse
import hashlib
import json
import math
import re
import shutil
import threading
from datetime import date, datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
LOCK = threading.Lock()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def nonempty(value):
    return isinstance(value, str) and bool(value.strip())


def number(value):
    return type(value) in (int, float) and math.isfinite(value) and value >= 0


def url(value):
    return isinstance(value, str) and urlsplit(value).scheme in ('http', 'https') and bool(urlsplit(value).netloc)


def validate(data):
    require(isinstance(data, dict) and data.get('schema_version') == 1, 'schema_version は 1 が必要です')
    require(isinstance(data.get('metrics'), list) and bool(data['metrics']), 'metrics が必要です')
    require(isinstance(data.get('benchmarks'), list), 'benchmarks は配列です')
    require(isinstance(data.get('gpus'), list), 'gpus は配列です')
    metric_ids, bench_ids, gpu_ids = set(), set(), set()
    reserved = {'name', 'cc', 'memory_gb', 'bandwidth_gbs', 'power_w', 'price_jpy', 'purchase_url', 'fp32_per_w', 'fp32_per_10k_jpy', 'ratio'}
    for collection, ids in ((data['metrics'], metric_ids), (data['benchmarks'], bench_ids)):
        for item in collection:
            require(isinstance(item, dict), '指標はオブジェクトです')
            require(nonempty(item.get('id')) and item['id'] not in ids and item['id'] not in reserved and not item['id'].startswith('field:'), '指標 ID が空欄・重複・予約済みです')
            ids.add(item['id'])
            require(nonempty(item.get('name')) and nonempty(item.get('unit')), '指標名と単位が必要です')
            require(item.get('direction') in ('higher', 'lower'), 'direction は higher / lower です')
            if collection is data['benchmarks']:
                require(nonempty(item.get('conditions')), 'ベンチマークの条件が必要です')
    require(not metric_ids.intersection(bench_ids), '理論指標と実測指標の ID は分けてください')
    for gpu in data['gpus']:
        require(isinstance(gpu, dict), 'GPU はオブジェクトです')
        require(nonempty(gpu.get('id')) and gpu['id'] not in gpu_ids, 'GPU ID が空欄または重複しています')
        gpu_ids.add(gpu['id'])
        for key in ('name', 'architecture', 'category', 'form_factor'):
            require(nonempty(gpu.get(key)), f"{gpu['id']}: {key} が必要です")
        require(gpu.get('cc') is None or (isinstance(gpu.get('cc'), str) and re.fullmatch(r'\d+\.\d+', gpu['cc'])), 'CC は 8.9 のような文字列、CUDA非対応機種は null です')
        for key in ('memory_gb', 'bandwidth_gbs', 'power_w', 'price_jpy'):
            require(gpu.get(key) is None or number(gpu[key]), f'{key} は非負の数値か null です')
        require(gpu.get('purchase_url') in (None, '') or url(gpu['purchase_url']), '購入リンクは http(s) URL を1件指定してください')
        require(gpu.get('reference_url') in (None, '') or url(gpu['reference_url']), 'GPU名から開く出典リンクは http(s) URL を1件指定してください')
        require(isinstance(gpu.get('sources'), list), 'sources は配列です')
        source_ids = set()
        for source in gpu['sources']:
            require(isinstance(source, dict) and nonempty(source.get('id')) and source['id'] not in source_ids, '出典 ID が不正です')
            source_ids.add(source['id'])
            require(nonempty(source.get('title')) and url(source.get('url')), '出典名と http(s) URL が必要です')
            try:
                date.fromisoformat(source.get('checked_on', ''))
            except (ValueError, TypeError):
                raise ValueError('出典の確認日は YYYY-MM-DD です')
        for key, allowed in (('performance', metric_ids), ('results', bench_ids)):
            require(isinstance(gpu.get(key), dict), f'{key} はオブジェクトです')
            for mid, record in gpu[key].items():
                require(mid in allowed, f'未定義の指標: {mid}')
                require(isinstance(record, dict) and number(record.get('value')), f'{mid}: value は非負の数値です')
                require(record.get('source') in source_ids, f'{mid}: 有効な source ID が必要です')
                require(record.get('kind') in ('published', 'derived', 'measured', 'aggregate'), f'{mid}: kind が不正です')
                if key == 'results':
                    require(record['kind'] in ('measured', 'aggregate'), '実測値には measured / aggregate を指定します')
    return data


def revision(raw):
    return hashlib.sha256(raw).hexdigest()


def make_handler(data_path):
    class Handler(SimpleHTTPRequestHandler):
        # Windows MIME registry entries can otherwise block ES modules.
        extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript', '.js': 'text/javascript'}

        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(ROOT / 'web'), **kwargs)

        def end_headers(self):
            # Local UI files change in place; never reuse an earlier UI bundle.
            self.send_header('Cache-Control', 'no-store')
            super().end_headers()

        def json_response(self, status, body):
            raw = json.dumps(body, ensure_ascii=False).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self):
            if self.path == '/api/data':
                with LOCK:
                    raw = data_path.read_bytes()
                self.json_response(200, {'data': json.loads(raw), 'revision': revision(raw)})
            else:
                # Also refresh clients that cached files before no-store was added.
                for header in ('If-Modified-Since', 'If-None-Match'):
                    if header in self.headers:
                        del self.headers[header]
                super().do_GET()

        def do_POST(self):
            if self.path not in ('/api/data', '/api/validate'):
                self.json_response(404, {'error': 'Unknown endpoint'})
                return
            # Browser writes must originate from this loopback application.
            expected = f'http://127.0.0.1:{self.server.server_port}'
            if self.headers.get('Host') != f'127.0.0.1:{self.server.server_port}' or self.headers.get('Origin') != expected:
                self.json_response(403, {'error': '同じローカル画面から保存してください'})
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
                require(0 < length <= 5_000_000, 'ファイルサイズの上限は 5 MB です')
                payload = json.loads(self.rfile.read(length))
                data = validate(payload['data'])
                if self.path == '/api/validate':
                    self.json_response(200, {'ok': True})
                    return
                raw = (json.dumps(data, indent=2, ensure_ascii=False, allow_nan=False) + '\n').encode('utf-8')
                with LOCK:
                    old = data_path.read_bytes()
                    if payload.get('revision') != revision(old):
                        self.json_response(409, {'error': '別の画面またはファイルで更新されています。JSONをエクスポートしてから再読込してください'})
                        return
                    backup_dir = data_path.parent / 'backups'
                    backup_dir.mkdir(exist_ok=True)
                    shutil.copyfile(data_path, backup_dir / (datetime.now().strftime('%Y%m%d-%H%M%S-%f') + '.json'))
                    temp = data_path.with_suffix('.json.tmp')
                    temp.write_bytes(raw)
                    temp.replace(data_path)
                self.json_response(200, {'revision': revision(raw)})
            except (ValueError, KeyError, TypeError) as error:
                self.json_response(400, {'error': str(error)})
            except OSError as error:
                self.json_response(500, {'error': f'保存できませんでした: {error}'})

    return Handler


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--data', type=Path, default=ROOT / 'data' / 'gpus.json')
    parser.add_argument('--check', action='store_true', help='Validate dataset and exit')
    args = parser.parse_args()
    validate(json.loads(args.data.read_text(encoding='utf-8')))
    if args.check:
        print('Dataset OK')
    else:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), make_handler(args.data.resolve()))
        print(f'GPU Compare: http://127.0.0.1:{server.server_port}', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()
