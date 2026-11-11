# 比較フォーマット・性能調査

調査日：2026-11-11。目的はNVIDIA GPUの更新・導入候補を定量比較し、候補と測定結果を継続的に追加できる基盤を作ること。

## 方式の比較と採用理由

| 方式 | ソート・絞り込み | 追加編集 | 条件・出典の管理 | この用途での評価 |
| --- | --- | --- | --- | --- |
| Excel / LibreOffice | 得意。オートフィルタを利用 | 手軽 | セルのコメントや別シートが必要。精度×疎性で横に広がる | 単発の少数比較には良い。分析用CSVの利用先とする |
| CSV / Markdown | CSVは表計算等で可能。Markdown単体は不可 | テキストで編集可能 | 入れ子の測定条件・出典を表現しづらい | 交換・報告向け。正本には採用しない |
| Jupyter / pandas | 自由度が高い | コード/表データの知識が必要 | 柔軟 | 再解析向け。普段のGPU追加に実行環境が必要 |
| SQLite + 管理画面 | 複合検索・大量測定に強い | 管理画面を別途実装 | 正規化しやすい | 将来の多人数・大量履歴向け。初期用途には構成が増える |
| JSON + ローカルWeb表 | 数値/CCソートと複合フィルタを実装可能 | フォームとテキストの両方に対応 | 指標・条件・出典を構造化できる | **採用。外部ライブラリ不要で保守しやすい** |

これは本用途に対する設計上の評価であり、各製品の性能ベンチマークではない。原本をJSONに置くことで、Gitでの差分確認、別ツールでの集計、CSVへの変換が可能。Python標準ライブラリの小さなサーバーで、ブラウザから原本へ安全に保存する。ブラウザの保存領域だけに依存しない。公開ホスティングは不要で、このディレクトリ内で完結する。

CCは浮動小数点ではなく `major.minor` の文字列として保存し、ソート時は整数ペアで比較する。例えば `12.0 > 9.0`、`8.10 > 8.9` を正しく処理する。

## そろえる比較条件

- **SKU**：同じ名称でもPCIe/SXM、VRAM容量、reference/OC構成を別行にする。
- **演算器**：CUDAとTensorを分離。CUDA FP32とTensor TF32を同一列にしない。
- **精度**：FP64 / FP32 / TF32 / BF16 / FP16 / FP8 / FP4 / INT8 / INT4を分離する。Tensorの入力・蓄積精度が異なる場合、別指標や注記を用いる。
- **疎性**：DenseとSparseを分離。Sparseは対応する構造化疎行列が前提。公表値の丸めや誤記があり得るため自動で2分の1に換算しない。
- **性質**：公表理論値・算出理論値・実測・集計を区別。FLOPS/TOPSは速度の上限で、実アプリの速度そのものではない。
- **周辺条件**：VRAM容量、メモリ帯域、電力、マルチGPU接続、電源・冷却・筐体、ソフトウェア互換性。今回は前3項目を数値欄、残りをメモで管理。
- **欠損**：未確認の性能は値を置かない。0に置き換えない。ソート時は昇順でも降順でも末尾。

CCはハードウェア機能・命令の指標で、CUDA Toolkitの版番号でもアプリの高速化率でもない。[NVIDIA Compute Capability一覧](https://developer.nvidia.com/cuda/gpus) を確認し、導入時には対象ツールチェーンの対応も別途確認する。

## 初期データの調査結果（旧8構成・履歴）

この節は初回実装時の記録です。現行データは初回指定の16構成です（追加調査したA2は削除済み）。最新の値、対象、資料間の差異は [2026-11-11 カタログ調査](catalog-research-2026-11-11.md) を参照してください。以下の表は現行データを表しません。

以下は1 GPUの理論値。TensorのD/SはDense/Sparse。FP32とFP16はTFLOPS、INT8はTOPS。丸め・算出値を含むため、詳しくはJSONの値ごとの種別・注記を参照。

| GPU構成 | CUDA FP32 | Tensor FP16 D/S | Tensor INT8 D/S | VRAM GB | 帯域 GB/s | TDP/TGP W |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| T4 PCIe | 8.1 | 65 / — | 130 / — | 16 | 300 | 70 |
| L4 PCIe | 30.3 | 121 / 242 | 242 / 485 | 24 | 300 | 72 |
| L40S PCIe | 91.6 | 362.05† / 733 | 733 / 1466 | 48 | 864 | 350 |
| A100 80GB PCIe | 19.5 | 312 / 624 | 624 / 1248 | 80 | 1935 | 300 |
| A100 80GB SXM4 | 19.5 | 312 / 624 | 624 / 1248 | 80 | 2039 | 400 |
| H100 80GB SXM | 67 | — / 1979 | — / 3958 | 80 | 3350 | 最大700 |
| RTX 4090 reference | 83 | — / — | — / — | 24 | — | 450 |
| RTX 5090 reference | 約104.883‡ | — / — | — / — | 32 | — | 575 |

† L40Sの公式詳細表はBF16/FP16に `362.05 | 733*` と記載している。関係が不整合なため、値を「正しいはずの数値」に置き換えず、原文を記録した。INT4もINT8と同値で記載されており初期登録を保留。T4の帯域もMAR19データシート（300 GB/s）とAda白書比較欄（320 GB/s）が異なるため前者を採用。

‡ RTX 5090は21760 cores × 2.41 GHz × FMAの2演算 ÷ 1000。公式ページのBoostクロックは丸め値であり、他の資料の104.8等と少し異なり得る。RTX 4090は公式製品ページの83 TFLOPSを採用。製品ページのAI TOPS（4090:1321 / 5090:3352）は独立項目で保持し、INT8等に読み替えていない。

この表だけでも、例えばA100はCUDA FP32だけを見るとL40Sより低い一方、倍精度やVRAM容量等の要件によって評価が変わることが分かる。これは理論仕様の比較からの推論であり、特定の業務での速度比較ではない。

## ベンチマーク調査と扱い

実測は指標定義と値を分離した。定義には名称・版・モデル・精度・シナリオ・バッチ・GPU数・ソフトウェア・測定方法を固定し、同じ定義の値だけを横並びにする。定義ごとに「大きいほど良い」「小さいほど良い」と単位を持つ。

| 候補 | 使い道 | 比較時の注意 |
| --- | --- | --- |
| [MLPerf Inference: Datacenter](https://mlcommons.org/benchmarks/inference-datacenter/) | 推論のシステム性能 | 同じ版・モデル・シナリオ・division・accuracy target等を選ぶ。Closed divisionは共通モデルでの比較を意図する。システムのGPU数を必ず記録 |
| [Blender Open Data](https://opendata.blender.org/) | Cyclesの実レンダリング | Blender版、CUDA/OptiX、シーン、サンプル数、集計方法をそろえる。RT処理を含み、Tensorのピーク測定の代わりにはならない |
| 手元のGEMM/実アプリ | 自分の導入要件に最も近い | 入力/蓄積精度・TF32設定、行列サイズ、電力制限、同期・転送を含むか、ウォームアップ、繰返し、中央値等を明記 |

Blender公式の4.3.0版・GPU名別集計URLを調査したが、Web取得が失敗し、直接HTTP取得も403だった。未確認の結果や版が混ざった集計を初期値として入れず、**今回の実測数値収集は未完了**とする。測定条件が取れる結果を追加できる実装を提供した。ローカルGPU上の測定は実施していない。

## 公式仕様の出典

すべて2026-11-11に確認。URLと確認日はGPUごとの `sources` にも収録。

- [NVIDIA CUDA GPU Compute Capability](https://developer.nvidia.com/cuda/gpus)：各モデルのCC。
- [NVIDIA T4 Datasheet MAR19](https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/tesla-t4/t4-tensor-core-datasheet-951643.pdf)：T4の公開仕様。電力70Wは下記Ada白書Appendix D。
- [NVIDIA Ada Architecture Whitepaper V2.02](https://images.nvidia.com/aem-dam/Solutions/Data-Center/l4/nvidia-ada-gpu-architecture-whitepaper-V2.02.pdf)：Appendix DのL4 Dense/Sparse性能とT4比較欄。
- [NVIDIA L40S](https://www.nvidia.com/en-us/data-center/l40s/)：詳細仕様表とSparseの脚注。
- [NVIDIA A100 Datasheet](https://resources.nvidia.com/en-us-gpu/nvidia-a100-datashee-1)：80GB PCIe/SXM、Dense/Sparse、標準TDPとCTS例外。
- [NVIDIA H100](https://www.nvidia.com/en-us/data-center/h100/)：SXM列とNVL列を区別。Sparse値、帯域、最大TDP。
- [NVIDIA GeForce RTX 4090](https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4090/)：reference仕様、Shader TFLOPS、広告AI TOPS、TGP。
- [NVIDIA GeForce RTX 5090](https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5090/)：reference仕様、コア数・Boostクロック、広告AI TOPS、TGP。
