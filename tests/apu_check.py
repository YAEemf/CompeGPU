"""Exercise the mixed-vendor catalog and nullable CC using an isolated data copy."""
import json
import sys
import tempfile
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import ROOT, make_handler
from playwright.sync_api import expect, sync_playwright


def run():
    with tempfile.TemporaryDirectory() as temp:
        data_path = Path(temp) / 'gpus.json'
        data_path.write_bytes((ROOT / 'data/gpus.json').read_bytes())
        original = json.loads(data_path.read_bytes())
        server = ThreadingHTTPServer(('127.0.0.1', 0), make_handler(data_path))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(channel='chrome', headless=True)
                page = browser.new_page(viewport={'width': 1600, 'height': 1000})
                errors, dialogs = [], []
                page.on('pageerror', lambda error: errors.append(str(error)))
                def confirm(dialog):
                    dialogs.append(dialog.message)
                    dialog.accept()
                page.on('dialog', confirm)
                # Emulate an existing user's manual layout. APU additions append once.
                old_order = [g['id'] for g in original['gpus'] if g['category'] != 'APU'][::-1]
                page.add_init_script('''(() => {
                    if (localStorage.getItem('apu-test-seeded')) return;
                    localStorage.setItem('gpu-compare.columns-by-mode.v1', JSON.stringify({nominal:['cuda_fp32','cc'],measured:MEASURED}));
                    localStorage.setItem('gpu-compare.layout.v1', JSON.stringify({gpuOrder:ORDER,manualOrder:true,transposed:true}));
                    localStorage.setItem('gpu-compare.price-column.v1','true');
                    localStorage.setItem('gpu-compare.detail-columns.v1','true');
                    localStorage.setItem('apu-test-seeded','true');
                })();'''.replace('ORDER', json.dumps(old_order)).replace('MEASURED', json.dumps(list(next(g for g in original['gpus'] if g['category']=='APU')['results']))))
                page.goto(f'http://127.0.0.1:{server.server_port}')
                expect(page.locator('[data-baseline]')).to_have_count(len(original['gpus']))
                actual_order = page.locator('#tableHead > th[data-gpu]').evaluate_all('(els)=>els.map(el=>el.dataset.gpu)')
                assert actual_order == old_order + ['ryzen-ai-max-plus-395']
                columns = page.locator('#tableBody > tr[data-column]').evaluate_all('(els)=>els.map(el=>el.dataset.column)')
                assert columns[:2] == ['cuda_fp32', 'cc'] and len(columns) == 19
                apu = 'ryzen-ai-max-plus-395'
                def cell(metric):
                    return page.locator(f'[data-cell="{metric}"][data-gpu="{apu}"]')
                for metric, text in {'cc':'x','cuda_fp32':'x','gpu_fp64':'0.5','gpu_fp32':'29.7',
                                     'gpu_fp16':'59.4','gpu_matrix_fp16_acc16_dense':'59.4',
                                     'field:/cpu_cores':'16','field:/cpu_threads':'32',
                                     'npu_ai_tops':'50','platform_ai_tops':'126'}.items():
                    expect(cell(metric)).to_have_text(text)
                for gpu, values in {
                    'intel-gaudi2-hl225h':{'matrix_bf16_acc32_dense':'432','matrix_fp8_acc32_dense':'865','vector_bf16':'11','matrix_fp16_acc32_dense':'—','matrix_fp64_dense':'x'},
                    'amd-instinct-mi250':{'matrix_bf16_acc32_dense':'362.1','matrix_fp64_dense':'90.5','gpu_fp32':'45.3','gpu_fp32_packed':'90.5','matrix_fp8_acc32_dense':'x'},
                }.items():
                    for key,value in values.items():
                        expect(page.locator(f'[data-cell="{key}"][data-gpu="{gpu}"]')).to_have_text(value)
                page.select_option('#exactCC', '8.9')
                expect(page.locator(f'[data-baseline="{apu}"]')).to_have_count(0)
                page.click('#reset')
                page.select_option('#rangeMetric', 'gpu_fp32')
                page.click('#addRange')
                group = page.locator('[data-range-id="gpu_fp32"]')
                group.locator('[data-bound="min"]').fill('29')
                group.locator('[data-bound="max"]').fill('30')
                expect(page.locator('[data-baseline]')).to_have_count(1)
                expect(cell('gpu_fp32')).to_have_text('29.7')
                page.click('#reset')
                page.locator('[data-sort="cc"]').click()
                unknown_cc = page.locator('#tableHead > th[data-gpu]').evaluate_all('(els)=>els.slice(-3).map(el=>el.dataset.gpu)')
                assert set(unknown_cc) == {apu,'intel-gaudi2-hl225h','amd-instinct-mi250'}
                page.select_option('#valueMode', 'measured')
                expect(cell('gb640_cpu_single')).to_have_text('2,957')
                expect(cell('gb640_cpu_multi')).to_have_text('22,313')
                expect(cell('llama_5b59b83f4_gpt-oss-120b-mxfp4_vulkan_tg512')).to_have_text('55.3')
                expect(page.locator('[data-cell="gpu_fp32"], [data-cell="cc"]')).to_have_count(0)
                expect(page.locator('#tableBody > tr[data-column]')).to_have_count(len(original['benchmarks']))
                expect(page.locator('[data-cell="gaudi_paper_v1_fp8_gemm_8192_tensor_hw"][data-gpu="intel-gaudi2-hl225h"]')).to_have_text('851.2')
                expect(page.locator('[data-cell="amd_mi250_rochpl6_single_oam"][data-gpu="amd-instinct-mi250"]')).to_have_text('40.5')
                expect(page.locator('[data-cell="amd_mi250_hpcg3_single_oam"][data-gpu="amd-instinct-mi250"]')).to_have_text('0.5')
                page.click('#transpose')
                expect(cell('gb640_cpu_multi')).to_have_text('22,313')
                page.select_option('#valueMode', 'nominal')
                page.locator(f'[data-baseline="{apu}"]').dblclick()
                expect(page.locator('#gpuForm [name="cc"]')).to_have_value('')
                page.locator('#gpuForm [name="notes"]').fill('APU isolated save check')
                page.keyboard.press('Control+s')
                expect(page.locator('#saveState')).to_have_text('ファイルに保存済み')
                assert dialogs and 'data/gpus.json' in dialogs[-1]
                saved = json.loads(data_path.read_bytes())
                stored = next(g for g in saved['gpus'] if g['id'] == apu)
                assert stored['cc'] is None and stored['notes'] == 'APU isolated save check'
                original_apu = next(g for g in original['gpus'] if g['id'] == apu)
                assert stored['performance'] == original_apu['performance']
                assert stored['results'] == original_apu['results']
                assert not errors, errors
                browser.close()
                print('APU OK: layout migration, shared GPU metrics, x markers, CC sort/filter, ranges, measured isolation, transpose, nullable-CC Ctrl+S save')
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == '__main__':
    run()
