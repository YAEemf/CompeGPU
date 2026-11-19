# 項目統合と全GPU再検証（2026-11-19）

## 目的

ベンダー別に同じ演算が別行になっていたため（例：NVIDIAは「CUDA FP32」、AMDは「GPU FP32」）、NVIDIAとAMD・Intelを同じ行で比べられなかった。性能の意味が同じ行は1行にまとめ、意味が大きく違う行は分けたままにした。あわせて全22構成の値を再検証し、MI250をMI250Xに置き換えた。

## 統合の方針

| 統合する | 統合しない（別行のまま） |
|---|---|
| NVIDIA CUDAコアとAMD Vector/VALU（同じ非行列演算） | 非行列（汎用）と行列（Matrix） |
| NVIDIA Tensor Core、AMD Matrix Core/WMMA、Intel MME（同じ入力→蓄積精度の行列演算） | 入力精度・蓄積精度が違うもの（FP16→FP32とFP16→FP16など） |
| 統合前に旧ベンダー別行と共通行で値が重複していたもの | DenseとSparse |
| | 精度条件が混在する広告値（AI TOPS、NPU、APU合計） |

1〜3機種しか値がなく、命令条件だけが違う補助行は、数値を消さずに該当値の注記へ移して行を削除した。

## 理論性能の対応表（51項目→27項目）

| 統合後の行 | 統合前の行 |
|---|---|
| FP64 / FP32 / FP16 汎用（非行列） `gpu_fp64/32/16` | `cuda_fp64/32/16`、`gpu_fp64/32/16`。注記へ移動：`gpu_fp32_packed`（MI210 45.3、MI250X 95.7）、`gpu_fp32_single_issue`・`gpu_fp16_single_issue`（Ryzen 14.848 / 29.696） |
| BF16 汎用（非行列） `vector_bf16` | `vector_bf16` |
| Matrix FP64 / Dense | `tensor_fp64_dense`、`matrix_fp64_dense`（削除：全機種非対応の`tensor_fp64_sparse`） |
| Matrix FP32 / Dense | `tensor_fp32_dense`、`matrix_fp32_dense`（削除：全機種非対応の`tensor_fp32_sparse`） |
| Matrix TF32→FP32 / Dense・Sparse | `tensor_tf32_*`、`matrix_tf32_acc32_dense` |
| Matrix FP16→FP32 / Dense・Sparse | `tensor_fp16_*`、`matrix_fp16_acc32_dense`。注記へ移動：Thorの蓄積精度未公表値`tensor_fp16_unspecified_*` |
| Matrix FP16→FP16 / Dense・Sparse | `tensor_fp16_acc16_*`、`gpu_matrix_fp16_acc16_dense`（Ryzen WMMA 59.4）。注記へ移動：`gpu_ai_fp16_advertised`（Ryzen広告値60） |
| Matrix BF16→FP32 / Dense・Sparse | `tensor_bf16_*`、`matrix_bf16_acc32_dense` |
| Matrix FP8→FP32 / Dense・Sparse | `tensor_fp8_*`、`matrix_fp8_acc32_dense`。注記へ移動：Thorの`tensor_fp8_unspecified_*` |
| Matrix FP8→FP16 / Dense・Sparse | `tensor_fp8_acc16_*` |
| Matrix FP4 / Dense・Sparse | `tensor_fp4_*`。注記へ移動：Thorの`tensor_fp4_unspecified_*` |
| Matrix INT8→INT32 / Dense・Sparse | `tensor_int8_*`、`matrix_int8_acc32_dense` |
| Matrix INT4 / Dense・Sparse | `tensor_int4_*`。AMDの`vendor_int4_tops_advertised`は、ネイティブINT4 MFMA命令がなくINT8と同じレートの広告値のため、非対応の理由欄へ移した |
| 広告AI TOPS / NPU AI / CPU+GPU+NPU AI | 変更なし（精度条件が混在するため倍率比較の対象外のまま） |

統合前にベンダー別行と共通行の両方に値があったセルは、すべて同じ値だった（移行スクリプトで差がないことを確認済み）。NVIDIAの行は元のCUDA/Tensor行の出典・注記をそのまま使い、AMD・Intelの行は共通行の出典・注記を使った。

## 実測の対応表（42項目→28項目）

| 統合後の行 | 統合前の行 | 代表値 |
|---|---|---|
| GEMM FP8 実測（1基・公開条件の最大値） | Gaudi2 `gaudi_paper_v1_fp8_gemm_*` 9件 | 851.2（8192³、per-tensor、HW加速） |
| GEMM BF16 実測 | Gaudi2 `gaudi_author_bf16_gemm_*` 2件 | 423.9（8192³） |
| GEMM FP16 実測 | Gaudi2 `gaudi124_fp16_gemm_*` 4件 | 370.94（8192³、compiled） |
| DGEMM FP64 実測（1基） | `dell2022_dgemm_single` | MI100 7.9 |
| SGEMM FP32 実測（1基） | `dell2022_sgemm_single` | MI210 32.2 |
| HPL FP64 実測（1基） | `dell2022_hpl_single` | MI100 6.4、MI210 18.2 |

代表値には、同じGPU・同じ精度の公開条件のうちの最大値を使った。他の条件の値と測定条件は、各結果の注記にすべて残している。LLMの実測（Ryzen llama.cpp、Gaudi2 LLaMA 3.1、RTX 5070 Ti Qwen3）は、モデル・フレームワーク・負荷条件がGPUごとに違うので統合していない。

旧IDで保存した表示項目、比較指標、ソートは、画面側（`web/columns.mjs`の`METRIC_ALIASES`）で統合後の行へ自動で読み替える。

## MI250 → MI250X

MI250（208 CU）の登録を削除し、MI250X（128GB OAM）に置き換えた。

| 項目 | MI250X | 根拠 |
|---|---|---|
| CU | 220（110×2 GCD）、Stream Processors 14,080、Matrix Core 880 | ROCm GPU hardware specifications |
| メモリ | 128GB HBM2e（64GB×2）、帯域 3.2 TB/s（AMDの丸め表記、理論値3276.8 GB/sは別フィールド） | AMD仕様 |
| 電力 | 500W（典型）/ 560W（ピーク） | AMD仕様 |
| FP64 / FP32 汎用 | 47.9 / 47.9 TFLOPS（packed FP32の95.7は注記） | AMD公表値。ROCmのCUあたりレート（128 FLOPs/clk）×220 CU×1.7 GHz = 47.87で一致 |
| FP16 汎用 | 95.744 TFLOPS（算出） | packed FP16 FMA 256 FLOPs/clk×220×1.7 GHz |
| Matrix FP64 / FP32 | 95.7 / 95.7 | 256 FLOPs/clk/CU×220×1.7 GHz = 95.74 |
| Matrix FP16→FP32 / BF16→FP32 / INT8 | 383 | 1024 FLOPs/clk/CU×220×1.7 GHz = 383.0 |
| TF32・FP8・FP4・FP16蓄積・INT4・Sparse | 非対応 | CDNA2のMFMA命令の種類 |

amd.comは取得時にタイムアウト、TechPowerUpはHTTP 403で本文を確認できなかった。そのため、AMD CDNA2白書を出典とする二次資料（glennklockwood.com）とROCm公式のCU数・CUあたり演算レートで照合した。旧MI250のHPL 40.45 / HPCG 0.4888はMI250の測定値なので削除した。MI250Xの単一OAMの公開実測は今回は追加していない。

## 再検証の内容

1. **一次資料との照合**：保存済みのNVIDIA白書（Blackwell V1.1 Appendix A–C、Ampere GA102、Ada、A100）の表と照合した。RTX 3090/4090/5090/5070 Ti、A40、A100、V100、T4、Quadro RTX 6000の公称値はすべて一致した。
2. **精度比の整合性**（全22構成）：Sparse = 2×Dense、GeForce（FP32蓄積が半分のレート）とプロ向け製品（全レート）の比、INT8 = 2×FP16蓄積16、INT4 = 2×INT8、FP64/FP32比（Ampere以降のGeForce/プロ向け1:64、Turing 1:32、V100/A100/CDNA 1:2または1:1）を機械的に確認した。外れ値はなかった。
3. **帯域・メモリ・電力**：全機種で既存の監査値と一致した。

### 訂正・追加

| GPU | 項目 | 変更 | 根拠 |
|---|---|---|---|
| RTX 3090 / 4090 / 5090 | BF16 汎用 | 未確認 → 35.6 / 82.6 / 104.8 | Blackwell白書Appendix A「Peak BF16 TFLOPS (non-Tensor)」 |
| A40 | BF16 汎用 | 未確認 → 37.4 | Ampere GA102白書 |
| A100 40GB | BF16 汎用 | 未確認 → 39 | A100白書Table 1 |
| RTX A4500、RTX 4000/5000/6000 Ada | BF16 汎用 | 未確認 → FP32と同値（算出） | 同アーキテクチャ白書のnon-Tensor BF16 = FP32のレート比 |
| V100、T4、T10、T40、Quadro RTX 6000/8000 | BF16 汎用 | 未確認 → 非対応 | 白書の比較表でNA（BF16はAmpere以降） |
| RTX 5070 Ti | BF16 汎用 43.9 | 値は維持し、Tensor表向けの汎用的な注記を「Peak BF16 TFLOPS (non-Tensor)」の出典注記に訂正 | Blackwell白書Appendix B |
| Ryzen AI Max+ 395 | Matrix FP64/FP32/TF32/FP8/FP4、Sparse | 未確認 → 非対応 | RDNA3.5のWMMAの入力型はFP16/BF16/IU8/IU4だけで、スパース命令はない |
| Ryzen AI Max+ 395 | Matrix FP16→FP32、BF16、INT8、INT4 | 未確認のまま（命令はあるが公称ピークは未公表） | 同上 |
| Gaudi2 | FP64/FP32/FP16 汎用 | 対象外 → 未公表 | ベンダー共通行になったため、TPCの当該精度が未公表であることを明示 |
| Gaudi2 | FP16/FP8のFP16蓄積、FP4、INT4 | 非対応 | MMEの蓄積はFP32のみで、入力型にFP4/INT4がない（Gaudi2白書p.6） |
| CDNA1/2（MI100、MI210、MI250X） | Sparse全般、FP16蓄積、INT4 | 非対応（理由をAMD固有に書き直し） | 構造化スパースはCDNA3以降。MFMAの整数入力はINT8だけ |

### 既知の資料間の相違（変更なし）

- RTX 4000 Ada：製品ページ・line cardのFP8 Sparse 427.6と、リンク先PDFの327.6が一致しない。427.6を維持（FP32 26.7×16と整合）。
- Jetson AGX Thor：蓄積精度別の値は、公表値（蓄積精度の明記なし）を元にした仮定付きの推定。公表値は各値の注記に移した。
- T10/T40：OEM品のため、命令レートから求めた参考理論値。

## 再現方法

移行は `.research-cache/consolidate_metrics_2026_11_19.py`（調査キャッシュのためリポジトリ外）で、HEAD時点の `data/gpus.json` から生成した。値の衝突、ステータスの変更、実測の統合をすべてログに出力して確認した。検証には `python server.py --check`、`python -m unittest discover -s tests -p "test_*.py"`、`node --test tests/model.test.mjs tests/catalog-store.test.mjs`、ブラウザ検査4本（browser / apu / static_pages / reference_links）を使い、すべて成功した。
