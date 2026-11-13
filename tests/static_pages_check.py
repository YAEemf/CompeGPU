"""Check the built Pages artifact at a repository subpath, without a Python API."""
import functools
import json
import sys
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.build_pages import build
from server import ROOT
from playwright.sync_api import expect, sync_playwright


def run():
    with tempfile.TemporaryDirectory() as temp:
        output = build(Path(temp) / 'CompeGPU')
        assert not (output / 'server.py').exists()
        assert not (output / 'data/backups').exists()
        class Handler(SimpleHTTPRequestHandler):
            extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript'}
        server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=temp))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(channel='chrome', headless=True)
                context = browser.new_context(viewport={'width':1500,'height':1000})
                page = context.new_page()
                errors, requests, confirmations = [], [], []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('request', lambda request: requests.append(request.url))
                def confirm(dialog):
                    confirmations.append(dialog.message)
                    dialog.accept()
                page.on('dialog', confirm)
                url = f'http://127.0.0.1:{server.server_port}/CompeGPU/'
                page.goto(url)
                expect(page.locator('[data-baseline]')).to_have_count(len(json.loads((ROOT/'data/gpus.json').read_bytes())['gpus']))
                expect(page.locator('#saveState')).to_have_text('公開データを表示中')
                expect(page.locator('#restorePublished')).to_be_visible()
                price = page.locator('[data-cell="price_jpy"][data-gpu="rtx4090"]')
                expect(price).to_have_text('—')
                page.locator('[data-baseline="rtx4090"]').dblclick()
                page.locator('#gpuForm [name="price_jpy"]').fill('12345')
                page.keyboard.press('Control+s')
                expect(page.locator('#saveState')).to_have_text('この端末に保存済み')
                assert '公開データや他の端末には反映されません' in confirmations[-1]
                expect(price).to_have_text('12,345')
                page.reload()
                expect(page.locator('#saveState')).to_have_text('この端末の保存を表示中')
                expect(price).to_have_text('12,345')
                # A different browser/device gets the public catalog, not private edits.
                separate = browser.new_context(viewport={'width':390,'height':844})
                mobile = separate.new_page()
                mobile.goto(url)
                expect(mobile.locator('[data-baseline]')).to_have_count(len(json.loads((ROOT/'data/gpus.json').read_bytes())['gpus']))
                expect(mobile.locator('[data-cell="price_jpy"][data-gpu="rtx4090"]')).to_have_text('—')
                page.select_option('#valueMode','measured')
                expect(page.locator('[data-cell="amd_mi250_rochpl6_single_oam"][data-gpu="amd-instinct-mi250"]')).to_have_text('40.5')
                page.select_option('#valueMode','nominal')
                # JSON transfer and client-side validation are available without POST endpoints.
                imported = json.loads((ROOT/'data/gpus.json').read_bytes())
                next(g for g in imported['gpus'] if g['id']=='rtx4090')['price_jpy'] = 45678
                file = Path(temp)/'transfer.json'
                file.write_text(json.dumps(imported),encoding='utf-8')
                page.locator('#importJson').set_input_files(file)
                expect(price).to_have_text('45,678')
                page.keyboard.press('Control+s')
                expect(page.locator('#saveState')).to_have_text('この端末に保存済み')
                page.click('#restorePublished')
                expect(price).to_have_text('—')
                page.reload()
                expect(page.locator('#saveState')).to_have_text('公開データを表示中')
                assert not any('/api/' in request for request in requests), requests
                assert not errors, errors
                browser.close()
                print('Static Pages OK: repository subpath, catalog devices, no API, browser save/reload, JSON transfer, public reset, independent mobile browser')
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == '__main__':
    run()
