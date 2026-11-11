"""Optional end-to-end check; requires installed Playwright and Chromium."""
import json
import argparse
import csv
import sys
import tempfile
import threading
from pathlib import Path
from http.server import ThreadingHTTPServer

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import ROOT, make_handler
from playwright.sync_api import sync_playwright, expect


def run(channel=None):
    with tempfile.TemporaryDirectory() as temp:
        data_path = Path(temp) / 'gpus.json'
        # UI regression scenarios use fixed data, independently of catalog updates.
        data_path.write_bytes((ROOT / 'tests/fixtures/gpus.json').read_bytes())
        server = ThreadingHTTPServer(('127.0.0.1', 0), make_handler(data_path))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(headless=True, channel=channel)
                page = browser.new_page(viewport={'width':1500, 'height':1050})
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                dialog_policy={'cancel_save':False}
                save_dialogs=[]
                def handle_dialog(dialog):
                    if dialog.type=='confirm' and ('data/gpus.json' in dialog.message or '表示設定と最後に手動で指定した並び順' in dialog.message):
                        save_dialogs.append(dialog.message)
                        if dialog_policy['cancel_save']:
                            dialog.dismiss()
                            return
                    dialog.accept()
                page.on('dialog', handle_dialog)
                def select_metric(id):
                    button=page.locator(f'[data-sort="{id}"]')
                    if button.get_attribute('aria-pressed')!='true':
                        button.click()
                def select_baseline(id):
                    button=page.locator(f'[data-baseline="{id}"]')
                    if button.get_attribute('aria-pressed')!='true':
                        button.click()
                page.goto(f'http://127.0.0.1:{server.server_port}')
                expect(page.locator('table.transposed')).to_have_count(1)
                expect(page.locator('#tableHead > th[data-gpu]')).to_have_count(8)
                expect(page.locator('#tableBody > tr[data-column]')).to_have_count(16)
                expect(page.locator('#save')).to_be_enabled()
                initial_file=data_path.read_bytes()
                dialog_policy['cancel_save']=True
                page.keyboard.press('Control+s')
                assert len(save_dialogs)==1 and '表示設定と最後に手動で指定した並び順' in save_dialogs[-1]
                assert data_path.read_bytes()==initial_file
                dialog_policy['cancel_save']=False
                page.click('#save')
                assert len(save_dialogs)==2
                expect(page.locator('#saveState')).to_have_text('表示設定を保存済み')
                assert data_path.read_bytes()==initial_file
                assert not (data_path.parent/'backups').exists()
                expect(page.locator('.gpuHeader .sub')).to_have_count(0)
                expect(page.locator('[data-cell="field:/architecture"][data-gpu="rtx5090"]')).to_have_text('Blackwell')
                toggle_box=page.locator('#toggleFilters').bounding_box()
                assert toggle_box['x']==0 and toggle_box['y']==8
                expect(page.locator('#metric, #baseline')).to_have_count(0)
                expect(page.locator('[data-sort="cuda_fp32"]')).to_have_attribute('aria-pressed','true')
                expect(page.locator('[data-cell] .sub')).to_have_count(0)
                expect(page.locator('[data-cell="cuda_fp32"][data-gpu="rtx5090"]')).to_have_text('104.9')
                page.select_option('#valueMode','measured')
                expect(page.locator('#known')).to_be_disabled()
                expect(page.locator('#tableBody > tr[data-column="cuda_fp32"]')).to_have_count(0)
                assert '未登録' in page.locator('#tableBody').inner_text()
                page.select_option('#valueMode','nominal')
                expect(page.locator('#tableBody > tr[data-column]')).to_have_count(16)
                assert page.locator('#tableHead > th[data-gpu]').first.get_attribute('data-gpu')=='rtx5090'
                page.locator('#tableHead [data-drag-gpu="l40s"]').drag_to(page.locator('#tableHead > th[data-gpu="rtx5090"]'))
                assert page.locator('#tableHead > th[data-gpu]').first.get_attribute('data-gpu')=='l40s'
                expect(page.locator('#gpuOrderMode')).to_have_value('manual')
                page.locator('#tableBody [data-drag-column="cuda_fp32"]').drag_to(page.locator('#tableBody > tr[data-column="cc"]'))
                assert page.locator('#tableBody > tr[data-column]').first.get_attribute('data-column')=='cuda_fp32'
                manual_order=page.locator('#tableHead > th[data-gpu]').evaluate_all('(els)=>els.map(e=>e.dataset.gpu)')
                page.select_option('#gpuOrderMode','sorted')
                assert page.locator('#tableHead > th[data-gpu]').first.get_attribute('data-gpu')=='rtx5090'
                page.keyboard.press('Control+s')
                saved_layout=page.evaluate('JSON.parse(localStorage.getItem("gpu-compare.layout.v1"))')
                assert saved_layout['manualOrder'] is True
                assert saved_layout['gpuOrder']==manual_order
                page.reload()
                expect(page.locator('table.transposed')).to_have_count(1)
                expect(page.locator('#gpuOrderMode')).to_have_value('manual')
                assert page.locator('#tableHead > th[data-gpu]').evaluate_all('(els)=>els.map(e=>e.dataset.gpu)')==manual_order
                assert page.locator('#tableHead > th[data-gpu]').first.get_attribute('data-gpu')=='l40s'
                assert page.locator('#tableBody > tr[data-column]').first.get_attribute('data-column')=='cuda_fp32'
                page.select_option('#exactCC','8.9')
                expect(page.locator('#tableHead > th[data-gpu]')).to_have_count(3)
                page.locator('#tableHead [data-drag-gpu="rtx4090"]').drag_to(page.locator('#tableHead > th[data-gpu="l40s"]'))
                page.click('#reset')
                expect(page.locator('#tableHead > th[data-gpu]')).to_have_count(8)
                gpu_order=page.locator('#tableHead > th[data-gpu]').evaluate_all('(els)=>els.map(e=>e.dataset.gpu)')
                assert gpu_order.index('rtx4090') < gpu_order.index('l40s')
                with page.expect_download() as transposed_export:
                    page.click('#exportCsv')
                transposed_csv=Path(temp)/'transposed.csv'
                transposed_export.value.save_as(transposed_csv)
                with transposed_csv.open(encoding='utf-8-sig',newline='') as handle:
                    matrix=list(csv.reader(handle))
                assert matrix[0][1]=='GeForce RTX 4090' and matrix[1][0]=='CUDA FP32 (TFLOPS)' and matrix[1][1]=='83'
                page.select_option('#gpuOrderMode','sorted')
                page.click('#showColumns')
                page.click('#defaultColumns')
                page.click('#closeColumns')
                page.click('#transpose')
                expect(page.locator('table.transposed')).to_have_count(0)
                page.locator('#tableBody [data-drag-gpu="l40s"]').drag_to(page.locator('#tableBody > tr[data-gpu="rtx5090"]'))
                assert page.locator('#tableBody > tr[data-gpu]').first.get_attribute('data-gpu')=='l40s'
                page.select_option('#gpuOrderMode','sorted')
                expect(page.locator('#tableBody tr')).to_have_count(8)
                expect(page.locator('#importJson')).not_to_be_visible()
                expect(page.locator('#tableBody tr')).to_have_count(8)
                assert '5090' in page.locator('#tableBody tr').first.inner_text()
                assert page.locator('#tableHead [data-column]').evaluate_all('(els)=>els.map(e=>e.dataset.column)') == ['cc','memory_gb','bandwidth_gbs','cuda_fp64','cuda_fp32','cuda_fp16','tensor_fp32_dense','tensor_tf32_dense','tensor_fp16_dense','tensor_bf16_dense','price_jpy','field:/architecture','field:/connection_type','field:/cooling_type','field:/board_variant','field:/slot_count']
                page.locator('[data-range-id="cc"] [data-bound="min"]').fill('9.0')
                expect(page.locator('#tableBody tr')).to_have_count(2)
                page.locator('[data-range-id="cc"] [data-bound="max"]').fill('9.0')
                expect(page.locator('#tableBody tr')).to_have_count(1)
                page.click('#reset')
                page.select_option('#rangeMetric','cuda_fp32')
                page.click('#addRange')
                page.locator('[data-range-id="cuda_fp32"] [data-bound="min"]').fill('19.5')
                page.locator('[data-range-id="cuda_fp32"] [data-bound="max"]').fill('67')
                expect(page.locator('#tableBody tr')).to_have_count(4)
                page.click('#showColumns')
                page.screenshot(path=str(Path(temp) / 'columns-dialog.png'), full_page=True)
                page.locator('[data-column-choice="cuda_fp32"]').uncheck()
                page.locator('[data-column-choice="power_w"]').check()
                page.locator('[data-column-choice="field:/sources/0/url"]').check()
                # Keep both drag endpoints visible in this compact-list scenario.
                for field in ['architecture', 'connection_type', 'cooling_type', 'board_variant', 'slot_count']:
                    page.locator(f'[data-column-choice="field:/{field}"]').uncheck()
                page.click('#closeColumns')
                expect(page.locator('#tableBody tr')).to_have_count(4)
                expect(page.locator('#tableHead [data-column="cuda_fp32"]')).to_have_count(0)
                with page.expect_download() as column_export:
                    page.click('#exportCsv')
                column_csv = Path(temp) / 'columns.csv'
                column_export.value.save_as(column_csv)
                with column_csv.open(encoding='utf-8-sig',newline='') as handle:
                    header = next(csv.reader(handle))
                assert 'CUDA FP32 (TFLOPS)' not in header and 'TDP / TGP (W)' in header and 'sources / 0 / url' in header
                page.click('#reset')
                page.click('#showColumns')
                source = page.locator('#selectedColumns [data-drag-column="power_w"]')
                target = page.locator('#selectedColumns [data-column="cc"]')
                source.drag_to(target)
                page.click('#closeColumns')
                assert page.locator('#tableHead [data-column]').first.get_attribute('data-column') == 'power_w', page.evaluate('({order:Array.from(document.querySelectorAll("#tableHead [data-column]")).map(e=>e.dataset.column),storage:{...localStorage}})')
                page.reload()
                expect(page.locator('#tableBody tr')).to_have_count(8)
                assert page.locator('#tableHead [data-column]').first.get_attribute('data-column') == 'power_w', page.evaluate('({order:Array.from(document.querySelectorAll("#tableHead [data-column]")).map(e=>e.dataset.column),storage:{...localStorage}})')
                expect(page.locator('#tableHead [data-column="field:/sources/0/url"]')).to_have_count(1)
                page.click('#showColumns')
                page.click('#defaultColumns')
                page.click('#closeColumns')
                page.click('#reset')
                page.select_option('#exactCC', '8.9')
                expect(page.locator('#tableBody tr')).to_have_count(3)
                page.click('#reset')
                select_metric('tensor_fp16_dense')
                page.check('#known')
                expect(page.locator('#tableBody tr')).to_have_count(5)
                select_baseline('t4')
                expect(page.locator('[data-cell="ratio"][data-gpu="a100-pcie"]')).to_have_text('4.8')
                expect(page.locator('[data-sort="tensor_fp16_dense"]')).to_have_attribute('aria-pressed','true')
                page.locator('[data-baseline="t4"]').click()
                expect(page.locator('[data-baseline="t4"]')).to_have_attribute('aria-pressed','false')
                expect(page.locator('[data-cell="ratio"][data-gpu="a100-pcie"]')).to_have_text('—')
                select_baseline('t4')
                select_metric('cuda_fp32')
                expect(page.locator('[data-sort="cuda_fp32"]')).to_have_attribute('aria-pressed','true')
                expect(page.locator('[data-cell="ratio"][data-gpu="a100-pcie"]')).to_have_text('2.4')
                page.click('#reset')
                select_metric('cuda_fp32')
                page.click('#add')
                for key, value in {'id':'qa-gpu','name':'QA GPU','architecture':'QA','cc':'12.0','memory_gb':'64','spec_url':'https://example.org/spec','spec_title':'QA fixture','price_jpy':'123456','purchase_url':'https://example.org/buy/qa-gpu'}.items():
                    page.locator(f'#gpuForm [name="{key}"]').fill(value)
                page.locator('[data-performance="cuda_fp32"]').fill('123')
                page.locator('#gpuForm button[type=submit]').click()
                expect(page.locator('#editor')).not_to_be_visible()
                expect(page.locator('#tableBody tr')).to_have_count(9)
                link=page.locator('[data-cell="price_jpy"][data-gpu="qa-gpu"] a')
                expect(link).to_have_text('123,456')
                expect(link).to_have_attribute('href','https://example.org/buy/qa-gpu')
                link.click()
                assert len(page.context.pages)==1
                link.dblclick()
                expect(page.locator('#purchaseLinkDialog')).to_be_visible()
                expect(page.locator('#purchaseLinkInput')).to_have_value('https://example.org/buy/qa-gpu')
                assert len(page.context.pages)==1
                page.locator('#purchaseLinkInput').fill('https://example.org/buy/qa-gpu-updated')
                page.locator('#purchaseLinkForm button[type=submit]').click()
                expect(page.locator('#purchaseLinkDialog')).not_to_be_visible()
                expect(link).to_have_text('123,456')
                expect(link).to_have_attribute('href','https://example.org/buy/qa-gpu-updated')
                page.context.route('https://example.org/buy/*',lambda route:route.fulfill(status=200,content_type='text/html',body='<title>Purchase fixture</title>'))
                with page.expect_popup() as opened:
                    link.click(modifiers=['Control'])
                popup=opened.value
                expect(popup).to_have_url('https://example.org/buy/qa-gpu-updated')
                popup.close()
                original_file=data_path.read_bytes()
                dialog_policy['cancel_save']=True
                page.keyboard.press('Control+s')
                assert save_dialogs and '上書き保存' in save_dialogs[-1]
                assert data_path.read_bytes()==original_file
                expect(page.locator('#save')).to_be_enabled()
                dialog_policy['cancel_save']=False
                page.keyboard.press('Control+s')
                expect(page.locator('#saveState')).to_have_text('ファイルに保存済み')
                assert len(json.loads(data_path.read_text(encoding='utf-8'))['gpus']) == 9
                stored=next(g for g in json.loads(data_path.read_text(encoding='utf-8'))['gpus'] if g['id']=='qa-gpu')
                assert stored['price_jpy']==123456 and stored['purchase_url']=='https://example.org/buy/qa-gpu-updated'
                page.reload()
                expect(page.locator('#tableBody tr')).to_have_count(9)
                expect(page.locator('[data-baseline="t4"]')).to_have_attribute('aria-pressed','true')
                expect(page.locator('[data-cell="price_jpy"][data-gpu="qa-gpu"] a')).to_have_attribute('href','https://example.org/buy/qa-gpu-updated')
                page.locator('[data-cell="price_jpy"][data-gpu="qa-gpu"]').dblclick()
                page.locator('#purchaseLinkInput').fill('')
                page.locator('#purchaseLinkForm button[type=submit]').click()
                expect(page.locator('#purchaseLinkDialog')).not_to_be_visible()
                expect(page.locator('[data-cell="price_jpy"][data-gpu="qa-gpu"] a')).to_have_count(0)
                expect(page.locator('[data-cell="price_jpy"][data-gpu="qa-gpu"]')).to_have_text('123,456')
                page.locator('[data-cell="price_jpy"][data-gpu="qa-gpu"]').dblclick()
                page.locator('#purchaseLinkInput').fill('https://example.org/buy/qa-gpu-updated')
                page.locator('#purchaseLinkForm button[type=submit]').click()
                expect(page.locator('#purchaseLinkDialog')).not_to_be_visible()
                # Editing a note must preserve a derived metric's provenance.
                page.locator('[data-edit="rtx5090"]').click()
                page.locator('#gpuForm [name="notes"]').fill('QA note')
                page.keyboard.press('Control+s')
                expect(page.locator('#editor')).not_to_be_visible()
                expect(page.locator('#saveState')).to_have_text('ファイルに保存済み')
                saved = json.loads(data_path.read_text(encoding='utf-8'))
                record = next(g for g in saved['gpus'] if g['id'] == 'rtx5090')['performance']['cuda_fp32']
                assert record['kind'] == 'derived' and record['note']
                assert next(g for g in saved['gpus'] if g['id']=='rtx5090')['notes']=='QA note'
                page.locator('[data-edit="qa-gpu"]').click()
                page.locator('#gpuForm [name="name"]').fill('QA GPU edited')
                page.locator('#gpuForm button[type=submit]').click()
                expect(page.locator('#editor')).not_to_be_visible()
                assert 'QA GPU edited' in page.locator('#tableBody').inner_text()
                page.locator('[data-edit="qa-gpu"]').click()
                page.click('#deleteGpu')
                expect(page.locator('#tableBody tr')).to_have_count(8)
                page.click('#addBenchmark')
                for key, value in {'id':'qa-latency','name':'QA latency','unit':'ms','conditions':'QA fixture only; tool v1; GPU 1; batch 1; same software and method'}.items():
                    page.locator(f'#benchmarkForm [name="{key}"]').fill(value)
                page.locator('#benchmarkForm [name="direction"]').select_option('lower')
                page.locator('#benchmarkForm button[type=submit]').click()
                expect(page.locator('#benchmarkDialog')).not_to_be_visible()
                expect(page.locator('#valueMode')).to_have_value('measured')
                expect(page.locator('[data-sort="cuda_fp32"]')).to_have_count(0)
                expect(page.locator('#tableHead [data-column="memory_gb"]')).to_have_count(0)
                for gpu, value in [('t4','10'), ('l4','5')]:
                    page.locator(f'[data-edit="{gpu}"]').click()
                    page.locator('[data-result="qa-latency"]').fill(value)
                    page.locator('[data-result-source="qa-latency"]').fill('https://example.org/qa-measurement')
                    page.locator('#gpuForm button[type=submit]').click()
                    expect(page.locator('#editor')).not_to_be_visible()
                select_baseline('t4')
                expect(page.locator('[data-cell="ratio"][data-gpu="l4"]')).to_have_text('2')
                assert 'L4' in page.locator('#tableBody tr').first.inner_text()
                expect(page.locator('[data-cell] .sub')).to_have_count(0)
                page.select_option('#valueMode','nominal')
                expect(page.locator('[data-sort="qa-latency"]')).to_have_count(0)
                expect(page.locator('#tableHead [data-column="qa-latency"]')).to_have_count(0)
                page.select_option('#rangeMetric','cuda_fp32')
                page.click('#addRange')
                page.locator('[data-range-id="cuda_fp32"] [data-bound="min"]').fill('100')
                expect(page.locator('#tableBody tr')).to_have_count(1)
                page.select_option('#valueMode','measured')
                expect(page.locator('#tableBody tr')).to_have_count(8)
                expect(page.locator('[data-cell="qa-latency"][data-gpu="l4"]')).to_have_text('5')
                with page.expect_download() as result:
                    page.click('#exportCsv')
                output = Path(temp) / 'comparison.csv'
                result.value.save_as(output)
                exported=output.read_text(encoding='utf-8-sig')
                assert 'QA latency' in exported and 'CUDA FP32' not in exported and 'resources.nvidia.com' not in exported
                page.click('#save')
                expect(page.locator('#saveState')).to_have_text('ファイルに保存済み')
                page.reload()
                expect(page.locator('#tableBody tr')).to_have_count(8)
                expect(page.locator('#valueMode')).to_have_value('measured')
                select_metric('qa-latency')
                expect(page.locator('#gpuOrderMode')).to_have_value('manual')
                expect(page.locator('[data-cell="qa-latency"][data-gpu="l4"]')).to_have_text('5')
                screenshot_dir = ROOT / 'test-results'
                screenshot_dir.mkdir(exist_ok=True)
                page.screenshot(path=str(screenshot_dir / 'measured.png'), full_page=True)
                page.select_option('#valueMode','nominal')
                page.click('#reset')
                select_metric('cuda_fp32')
                page.click('#transpose')
                expect(page.locator('table.transposed')).to_have_count(1)
                page.locator('[data-baseline="l4"]').click()
                expect(page.locator('[data-baseline="l4"]')).to_have_attribute('aria-pressed','true')
                expect(page.locator('#tableHead > th[data-gpu="l4"]')).to_have_class('gpuHeader baseline')
                page.locator('[data-sort="cuda_fp64"]').click()
                expect(page.locator('[data-sort="cuda_fp64"]')).to_have_attribute('aria-pressed','true')
                expect(page.locator('[data-sort="cuda_fp32"]')).to_have_attribute('aria-pressed','false')
                select_metric('cuda_fp32')
                screenshot_dir = ROOT / 'test-results'
                screenshot_dir.mkdir(exist_ok=True)
                page.screenshot(path=str(screenshot_dir / 'desktop.png'), full_page=True)
                page.set_viewport_size({'width':390,'height':844})
                page.screenshot(path=str(screenshot_dir / 'mobile.png'), full_page=True)
                assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Mobile page overflow'
                assert not errors, errors
                browser.close()
                print('Browser OK: nominal/measured isolation and persistence, numeric-only cells, transpose, drag, scoped CSV, ranges, CRUD, mobile')
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--channel', help='Use an installed browser, e.g. chrome or msedge')
    run(parser.parse_args().channel)
