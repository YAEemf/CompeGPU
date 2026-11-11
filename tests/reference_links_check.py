"""Check catalog reference links through the UI without changing user data."""
import json
import sys
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import ROOT, make_handler
from playwright.sync_api import expect, sync_playwright


def run():
    catalog = json.loads((ROOT / 'data/gpus.json').read_bytes())
    server = ThreadingHTTPServer(('127.0.0.1', 0), make_handler(ROOT / 'data/gpus.json'))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(channel='chrome', headless=True)
            page = browser.new_page(viewport={'width':1600, 'height':1000})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}')
            expect(page.locator('[data-baseline]')).to_have_count(len(catalog['gpus']))
            assert sum(g['reference_url'].startswith('https://www.techpowerup.com/gpu-specs/') for g in catalog['gpus']) == 17
            page.evaluate('() => {window.open = url => {window.openedReference = url;};}')
            for orientation in range(2):
                for gpu in catalog['gpus']:
                    name = page.locator(f'[data-baseline="{gpu["id"]}"]')
                    baseline = name.get_attribute('aria-pressed')
                    name.click(modifiers=['Control'])
                    assert page.evaluate('window.openedReference') == gpu['reference_url']
                    expect(name).to_have_attribute('aria-pressed', baseline)
                page.click('#transpose')
            name = page.locator('[data-baseline="rtx5090"]')
            name.dblclick()
            expect(page.locator('#gpuForm [name="reference_url"]')).to_have_value(
                next(g['reference_url'] for g in catalog['gpus'] if g['id']=='rtx5090'))
            page.keyboard.press('Escape')
            page.select_option('#valueMode', 'measured')
            name.click(modifiers=['Control'])
            assert page.evaluate('window.openedReference').endswith('geforce-rtx-5090.c4216')
            assert not errors, errors
            browser.close()
            print('Reference links OK: all catalog devices, both orientations, editor URL, measured-mode reference, no baseline changes')
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


if __name__ == '__main__':
    run()
