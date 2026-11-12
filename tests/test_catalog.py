"""Research invariants: avoid comparing different SKUs or precision conditions."""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import ROOT, validate


class CatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / 'data/gpus.json').read_text(encoding='utf-8'))
        cls.gpus = {g['id']: g for g in cls.data['gpus']}

    def test_requested_models_only(self):
        validate(self.data)
        self.assertEqual(set(self.gpus), {
            'rtx3090', 'rtx4090', 'rtx5090', 'v100-sxm2-16gb', 't4', 't10', 't40',
            'quadro-rtx6000', 'quadro-rtx8000', 'rtx4000-ada', 'rtx5000-ada',
            'rtx6000-ada', 'rtx-a4500', 'a40', 'a100-sxm4-40gb', 'jetson-agx-thor',
            'ryzen-ai-max-plus-395', 'intel-gaudi2-hl225h', 'amd-instinct-mi250'})

    def test_gaudi_mme_precision_and_mi250_module_scope(self):
        gaudi = self.gpus['intel-gaudi2-hl225h']
        mi250 = self.gpus['amd-instinct-mi250']
        self.assertEqual((gaudi['memory_gb'],gaudi['bandwidth_gbs'],gaudi['power_w']), (96,2450,600))
        self.assertIsNone(gaudi['cc'])
        self.assertEqual(gaudi['performance']['matrix_bf16_acc32_dense']['value'],432)
        self.assertEqual(gaudi['performance']['matrix_fp8_acc32_dense']['value'],865)
        self.assertEqual(gaudi['performance']['vector_bf16']['value'],11)
        self.assertEqual(gaudi['metric_status']['matrix_fp16_acc32_dense']['status'],'not_published')
        self.assertEqual(gaudi['metric_status']['matrix_tf32_acc32_dense']['status'],'not_published')
        self.assertEqual(gaudi['metric_status']['matrix_fp64_dense']['status'],'not_supported')
        self.assertEqual(gaudi['results']['gaudi_paper_v1_fp8_gemm_8192_tensor_hw']['value'],851.2)
        self.assertEqual(gaudi['results']['gaudi119_llama31_8b_fp8_i128_o128_b2816']['value'],19875)
        self.assertTrue(all(r['accelerator_count']==1 for r in gaudi['results'].values()))
        self.assertEqual(len(gaudi['results']),19)
        self.assertEqual(gaudi['results']['gaudi124_fp16_gemm_8192_compiled']['value'],370.94)
        self.assertEqual(gaudi['results']['gaudi124_fp16_gemm_16384_compiled']['value'],335.73)
        self.assertEqual((mi250['gcd_count'],mi250['compute_units'],mi250['compute_units_per_die']), (2,208,104))
        self.assertEqual((mi250['memory_gb'],mi250['memory_per_die_gb'],mi250['bandwidth_gbs']), (128,64,3200))
        self.assertEqual((mi250['power_w'],mi250['power_max_w']), (500,560))
        self.assertEqual(mi250['performance']['gpu_fp32']['value'],45.3)
        self.assertEqual(mi250['performance']['gpu_fp32_packed']['value'],90.5)
        self.assertEqual(mi250['performance']['matrix_fp64_dense']['value'],90.5)
        self.assertEqual(mi250['performance']['matrix_fp16_acc32_dense']['value'],362.1)
        self.assertAlmostEqual(mi250['performance']['gpu_fp16']['value'],90.5216)
        self.assertEqual(mi250['performance']['gpu_fp16']['kind'],'derived')
        self.assertEqual(mi250['metric_status']['vector_bf16']['status'],'not_supported')
        self.assertEqual(gaudi['metric_status']['matrix_int8_acc32_dense']['status'],'not_supported')
        for gpu in [gaudi,mi250]:
            self.assertTrue(all(s['source'] and s['checked_on'] for s in gpu['metric_status'].values()))
        for key in ['matrix_fp8_acc32_dense','matrix_tf32_acc32_dense']:
            self.assertEqual(mi250['metric_status'][key]['status'],'not_supported')
        self.assertEqual(mi250['results']['amd_mi250_rochpl6_single_oam']['value'],40.45)
        self.assertAlmostEqual(mi250['results']['amd_mi250_hpcg3_single_oam']['value'],488.8/1000)
        for gpu in [gaudi,mi250]:
            self.assertEqual(gpu['metric_status']['cuda_fp32']['status'],'not_supported')

    def test_ryzen_apu_components_and_measured_workloads_are_distinct(self):
        gpu = self.gpus['ryzen-ai-max-plus-395']
        self.assertIsNone(gpu['cc'])
        self.assertEqual((gpu['cpu_cores'],gpu['cpu_threads'],gpu['compute_units']), (16,32,40))
        self.assertEqual((gpu['memory_gb'],gpu['bandwidth_gbs']), (128,256))
        self.assertEqual((gpu['power_w'],gpu['power_min_w'],gpu['power_max_w']), (55,45,120))
        self.assertAlmostEqual(gpu['performance']['gpu_fp32']['value'],29.696)
        self.assertAlmostEqual(gpu['performance']['gpu_fp32_single_issue']['value'],14.848)
        self.assertAlmostEqual(gpu['performance']['gpu_fp16']['value'],59.392)
        self.assertAlmostEqual(gpu['performance']['gpu_fp64']['value'],0.464)
        self.assertEqual(gpu['performance']['npu_ai_tops']['value'],50)
        self.assertEqual(gpu['performance']['platform_ai_tops']['value'],126)
        self.assertEqual(gpu['metric_status']['cuda_fp32']['status'],'not_supported')
        self.assertNotIn('cuda_fp32',gpu['performance'])
        self.assertEqual(gpu['results']['gb640_cpu_single']['value'],2957)
        self.assertEqual(gpu['results']['gb640_cpu_multi']['value'],22313)
        self.assertEqual(len(gpu['results']),10)
        for original in self.gpus.values():
            if original['id']==gpu['id']:continue
            for key,source in [('gpu_fp32','cuda_fp32'),('gpu_fp16','cuda_fp16'),('gpu_fp64','cuda_fp64')]:
                if source in original['performance']:
                    self.assertEqual(original['performance'][key]['value'],original['performance'][source]['value'])
                    self.assertEqual(original['performance'][key]['source'],original['performance'][source]['source'])

    def test_every_metric_has_a_value_or_an_explicit_missing_reason(self):
        metrics = {m['id'] for m in self.data['metrics']}
        for gpu in self.gpus.values():
            with self.subTest(gpu=gpu['id']):
                self.assertEqual(set(gpu['performance']) | set(gpu['metric_status']), metrics)
                self.assertFalse(set(gpu['performance']) & set(gpu['metric_status']))
                for status in gpu['metric_status'].values():
                    self.assertIn(status['status'], {'not_supported', 'not_published', 'not_verified', 'not_applicable'})
                    self.assertTrue(status['reason'])
                sources = {s['id'] for s in gpu['sources']}
                for record in gpu['performance'].values():
                    self.assertIn(record['kind'], {'published', 'derived'})
                    if record['kind'] == 'derived':
                        self.assertTrue(record.get('note'), 'Derivations require a formula/assumptions')
                    self.assertTrue(set(record.get('supporting_sources', [])) <= sources)

    def test_tensor_accumulation_and_sparsity_are_separate(self):
        gpu = self.gpus['rtx4090']['performance']
        self.assertEqual(gpu['cuda_fp32']['value'], 82.6)
        self.assertEqual(gpu['tensor_fp16_dense']['value'], 165.2)
        self.assertEqual(gpu['tensor_fp16_acc16_dense']['value'], 330.3)
        self.assertEqual(gpu['tensor_fp16_sparse']['value'], 330.4)
        self.assertEqual(gpu['tensor_fp8_dense']['value'], 330.3)
        self.assertEqual(gpu['tensor_fp8_acc16_dense']['value'], 660.6)
        self.assertNotIn('tensor_fp32_dense', gpu)

    def test_memory_variants_and_native_half_precision(self):
        a100 = self.gpus['a100-sxm4-40gb']
        self.assertEqual((a100['memory_gb'], a100['bandwidth_gbs'], a100['power_w']), (40, 1555, 400))
        self.assertEqual(a100['performance']['cuda_fp16']['value'], 78)
        v100 = self.gpus['v100-sxm2-16gb']
        self.assertEqual((v100['memory_gb'], v100['bandwidth_gbs']), (16, 900))
        self.assertEqual(v100['performance']['cuda_fp16']['value'], 31.4)

    def test_source_audit_preserves_sku_and_power_scope(self):
        v100 = self.gpus['v100-sxm2-16gb']
        self.assertTrue(v100['reference_url'].endswith('tesla-v100-sxm2-16-gb.c3018'))
        self.assertEqual((v100['bandwidth_gbs'], v100['power_w']), (900, 300))
        for id in ['quadro-rtx6000', 'quadro-rtx8000']:
            gpu = self.gpus[id]
            self.assertEqual(gpu['power_w'], 295)
            self.assertEqual(gpu['total_graphics_power_w'], 260)
            self.assertEqual(gpu['power_scope'], 'total_board_power_including_virtual_link')
        for id in ['rtx4000-ada', 'rtx5000-ada']:
            gpu = self.gpus[id]
            self.assertEqual(gpu['performance']['cuda_fp16']['kind'], 'derived')
            self.assertEqual(gpu['performance']['cuda_fp16']['value'], gpu['performance']['cuda_fp32']['value'])
            self.assertIn('spec', gpu['performance']['cuda_fp16']['supporting_sources'])
        self.assertEqual(self.gpus['rtx6000-ada']['performance']['cuda_fp16']['source'], 'pro')

    def test_oem_hardware_reports_and_theoretical_peaks_are_distinguished(self):
        for id, memory, bandwidth, cores, fp32, tensor16 in [
            ('t10', 16, 403.2, 3584, 9.99936, 79.99488),
            ('t40', 24, 624, 4608, 14.37696, 115.01568),
        ]:
            gpu = self.gpus[id]
            self.assertEqual(gpu['memory_gb'], memory)
            self.assertEqual(gpu['field_provenance']['cc']['status'], 'inferred')
            self.assertEqual(gpu['bandwidth_gbs'], bandwidth)
            self.assertEqual(gpu['cuda_cores'], cores)
            self.assertAlmostEqual(gpu['performance']['cuda_fp32']['value'], fp32)
            self.assertAlmostEqual(gpu['performance']['cuda_fp16']['value'], fp32 * 2)
            self.assertAlmostEqual(gpu['performance']['cuda_fp64']['value'], fp32 / 32)
            self.assertAlmostEqual(gpu['performance']['tensor_fp16_acc16_dense']['value'], tensor16)
            self.assertAlmostEqual(gpu['performance']['tensor_int8_dense']['value'], tensor16 * 2)
            self.assertAlmostEqual(gpu['performance']['tensor_int4_dense']['value'], tensor16 * 4)
            self.assertTrue(all(r['kind'] == 'derived' for r in gpu['performance'].values()))
            self.assertNotIn('tensor_fp16_dense', gpu['performance'])
            self.assertEqual(gpu['metric_status']['tensor_fp16_dense']['status'], 'not_verified')
            for metric in ['tensor_bf16_dense', 'tensor_tf32_dense', 'tensor_fp16_sparse', 'tensor_int8_sparse']:
                self.assertEqual(gpu['metric_status'][metric]['status'], 'not_supported')
        self.assertEqual(self.gpus['t10']['power_w'], 150)
        self.assertEqual(self.gpus['t10']['field_provenance']['power_w']['status'], 'owner_reported')
        self.assertIsNone(self.gpus['t40']['power_w'])
        self.assertEqual(self.gpus['t40']['field_provenance']['power_w']['status'], 'conflicting')
        self.assertEqual(self.gpus['t40']['reported_power_w'], {'backup_servers': 250, 'serverflow': 260})

    def test_thor_public_peaks_and_conditional_precision_estimates(self):
        gpu = self.gpus['jetson-agx-thor']
        self.assertEqual((gpu['cc'], gpu['memory_gb'], gpu['power_w']), ('11.0', 128, 130))
        self.assertEqual(gpu['power_scope'], 'module_including_cpu_and_memory')
        self.assertEqual(gpu['performance']['cuda_fp32']['value'], 8.064)
        self.assertEqual(gpu['performance']['tensor_fp4_unspecified_sparse']['value'], 2070)
        self.assertEqual(gpu['performance']['tensor_fp16_unspecified_dense']['value'], 258)
        self.assertEqual(gpu['performance']['tensor_fp16_unspecified_dense']['kind'], 'published')
        self.assertEqual(gpu['performance']['tensor_int8_dense']['value'], 517)
        self.assertEqual(gpu['performance']['tensor_int8_dense']['kind'], 'published')
        for mid, value in [('tensor_fp16_dense', 258), ('tensor_bf16_dense', 258),
                           ('tensor_tf32_dense', 129), ('tensor_tf32_sparse', 258.5),
                           ('tensor_fp8_dense', 517), ('tensor_fp4_sparse', 2070)]:
            record = gpu['performance'][mid]
            self.assertEqual(record['value'], value)
            self.assertEqual(record['kind'], 'derived')
            self.assertTrue(record['confidence'])
            self.assertTrue(record['note'])
        self.assertEqual(gpu['performance']['tensor_fp16_dense']['confidence'], 'conditional_accumulation_rate_estimate')
        fp64 = gpu['performance']['cuda_fp64']
        self.assertEqual(fp64['kind'], 'derived')
        self.assertAlmostEqual(fp64['value'], 0.126)
        self.assertAlmostEqual(fp64['value'], gpu['performance']['cuda_fp32']['value'] / 64)
        self.assertEqual(fp64['source'], 'cuda-cc-specifications')
        self.assertNotIn('cuda_fp64', gpu['metric_status'])
        fp16 = gpu['performance']['cuda_fp16']
        self.assertEqual((fp16['value'], fp16['source'], fp16['confidence']), (8.064, 'techpowerup', 'third_party_database'))
        self.assertNotIn('cuda_fp16', gpu['metric_status'])
        for mid in ['tensor_fp64_dense', 'tensor_fp64_sparse', 'tensor_int4_dense', 'tensor_int4_sparse']:
            self.assertNotIn(mid, gpu['performance'])
            self.assertEqual(gpu['metric_status'][mid]['status'], 'not_supported')
            self.assertEqual(gpu['metric_status'][mid]['source'], 'cuda-cc-specifications')
        self.assertEqual((gpu['sm_count'], gpu['tensor_cores_per_sm'], gpu['tensor_cores']), (20, 4, 80))
        self.assertEqual(gpu['field_provenance']['tensor_cores']['status'], 'derived')


if __name__ == '__main__':
    unittest.main()
