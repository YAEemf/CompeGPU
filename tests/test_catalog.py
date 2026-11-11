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
            'rtx6000-ada', 'rtx-a4500', 'a40', 'a100-sxm4-40gb', 'jetson-agx-thor'})

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

    def test_thor_module_power_and_unstated_accumulation(self):
        gpu = self.gpus['jetson-agx-thor']
        self.assertEqual((gpu['cc'], gpu['memory_gb'], gpu['power_w']), ('11.0', 128, 130))
        self.assertEqual(gpu['power_scope'], 'module_including_cpu_and_memory')
        self.assertEqual(gpu['performance']['cuda_fp32']['value'], 8.064)
        self.assertEqual(gpu['performance']['tensor_fp4_unspecified_sparse']['value'], 2070)
        self.assertNotIn('tensor_fp16_dense', gpu['performance'])


if __name__ == '__main__':
    unittest.main()
