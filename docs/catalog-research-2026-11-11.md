# GPUカタログ調査（2026-11-11）

後日の更新: 2026-11-12にRyzen AI Max+ 395を追加した。現在の17構成と実測値の追加内容は [Ryzen AI Max+ 395調査記録](ryzen-ai-max-395-research-2026-11-12.md) を参照。以下は2026-11-11時点の調査記録。

追加調査したA2は依頼により削除し、現在は初回指定の16機種を `data/gpus.json` に収録している。L4、L40S、A100 80GB PCIe、A100 80GB SXM、H100は現行データから削除した。変更前のファイルは `data/backups/gpus-before-catalog-*.json` に、A2追加前は `data/backups/gpus-before-a2-*.json` に保存している。`tests/fixtures/gpus.json` は従来の画面操作テスト専用の固定データであり、アプリが読み込むデータベースではない。

A2削除後、初回185件にT10/T40の参考理論性能12件、Thorの参考推定14件とCC別公式比率から算出したCUDA FP64 1件を加えた性能値212件を収録しているが、**全パラメーターの数値収集が完了したわけではない**。メーカー保証値、実機報告、参考推定を区別する。欠測は数値の0で補わない。実測ベンチマークの新規収録はない。[T10/T40再調査](t10-t40-research-2026-11-11.md)と[Thor再調査](thor-research-2026-11-11.md)に根拠・計算式・仮定・限界を記録した。

## 対象と基本性能

帯域はGB/s、電力はW、CUDA FP32はTFLOPS。表は対象構成の確認用。精度別性能の原本・個別の出典・算出条件はJSONの各レコードを参照。

| GPU | CC | メモリGB | 帯域 | 電力 | CUDA FP32 |
| --- | --- | ---: | ---: | ---: | ---: |
| RTX 3090 | 8.6 | 24 | 936 | 350 | 35.6 |
| RTX 4090 | 8.9 | 24 | 1008 | 450 | 82.6 |
| RTX 5090 | 12.0 | 32 | 1792 | 575 | 104.8 |
| V100 16GB SXM2 | 7.0 | 16 | 900 | 300 | 15.7 |
| Tesla T4 | 7.5 | 16 | 320 | 70 | 8.1 |
| Tesla T10 16GB | 7.5（TU102から推定） | 16（実機画像） | 403.2（実機仕様表示） | 150（所有者報告） | 9.99936（算出） |
| Tesla T40 24GB | 7.5（TU102から推定） | 24（販売元仕様） | 624（換算・参考値） | 250/260の相違あり・未確定 | 14.37696（算出） |
| Quadro RTX 6000 | 7.5 | 24 | 672 | 295 | 16.3 |
| Quadro RTX 8000 | 7.5 | 48 | 672 | 295 | 16.3 |
| RTX 4000 Ada | 8.9 | 20 | 360 | 130 | 26.7 |
| RTX 5000 Ada | 8.9 | 32 | 576 | 250 | 65.3 |
| RTX 6000 Ada | 8.9 | 48 | 960 | 300 | 91.1 |
| RTX A4500 | 8.6 | 20 | 640 | 200 | 23.7 |
| A40 | 8.6 | 48 | 696 | 300 | 37.4 |
| A100 40GB SXM4 | 8.0 | 40 | 1555 | 400 | 19.5 |
| Jetson AGX Thor / T5000 | 11.0 | 128（共有） | 273 | 130（モジュール） | 8.064（MAXN） |

## 出典と採用条件

- RTX 3090/4090/5090：[NVIDIA RTX Blackwell白書V1.1](https://images.nvidia.com/aem-dam/Solutions/geforce/blackwell/nvidia-rtx-blackwell-gpu-architecture.pdf) Appendix Aの同一比較表を優先した。4090の旧登録83、5090の丸めクロックからの旧算出104.8832は、この表の82.6、104.8に更新した。INT4は[Ampere GA102白書](https://images.nvidia.com/aem-dam/en-zz/Solutions/geforce/ampere/pdf/NVIDIA-ampere-GA102-GPU-Architecture-Whitepaper-V1.pdf)と[Ada白書](https://images.nvidia.com/aem-dam/Solutions/geforce/ada/nvidia-ada-gpu-architecture.pdf)の個別表を使用。3090 INT4は旧表の丸め値568/1136を維持し、後年のINT8値から逆算しない。
- V100：[NVIDIA V100データシート Jan20](https://images.nvidia.com/content/technologies/volta/pdf/volta-v100-datasheet-update-us-1165301-r5.pdf)のSXM2列を使用。16GB/32GB共通の演算・帯域仕様から16GB構成を選択。CUDA FP16は[A100白書](https://images.nvidia.com/aem-dam/en-zz/Solutions/data-center/nvidia-ampere-architecture-whitepaper.pdf) Table 2のV100欄でも確認。
- T4：[NVIDIAデータシート MAR19](https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/tesla-t4/t4-tensor-core-datasheet-951643.pdf)を採用。電力はAda白書Appendix Dも参照。帯域はデータシート300とAda白書320の差異があり、再照合で320（256bit×10Gbpsの計算値・TechPowerUpと一致）へ更新し、300は別フィールドに保持した。
- T10/T40：ユーザー確認済みの対象はTuring世代Tesla T10 16GBとTesla T40 24GB。2008年のTesla T10プロセッサを含む旧Teslaボードの仕様は採用していない。再調査では、T10は所有者のGPU-Z画像、T40は販売元自身の個体仕様に範囲を広げて参考理論性能を追加した。出典は現在の各GPUの `spec` 等に登録している。メーカー保証値や実測性能とは区別する。蓄積精度別ピークと電力の相違等の未確定部分は [再調査記録](t10-t40-research-2026-11-11.md) を参照。CCはTuringの7.5からの推定であり、当該SKUが公式CC一覧に掲載されているという意味ではない。
- Quadro RTX 6000：[NVIDIAデータシート](https://www.nvidia.com/content/dam/en-zz/Solutions/design-visualization/quadro-product-literature/quadro-rtx-6000-us-nvidia-704093-r4-web.pdf)。RTX 8000：[Leadtek製品仕様](https://www.leadtek.com/eng/products/workstation_graphics%282%29/NVIDIA_Quadro_RTX8000%2820830%29/detail)。演算精度の条件は[NVIDIA GTC 2018資料](https://www.nvidia.com/content/apac/gtc/ja/pdf/2018/2040.pdf)も参照。電力はアクティブボードのTBP 295Wであり、TGP 260Wやパッシブ製品の249Wとは区別する。
- RTX 4000/5000/6000 Ada：各[NVIDIA製品ページ4000](https://www.nvidia.com/en-us/products/workstations/rtx-4000/)、[5000](https://www.nvidia.com/en-us/products/workstations/rtx-5000/)、[6000](https://www.nvidia.com/en-us/products/workstations/rtx-6000/)と[NVIDIA RTX PRO Blackwell白書V1.1](https://www.nvidia.com/content/dam/en-zz/Solutions/design-visualization/quadro-product-literature/pdf/NVIDIA-RTX-Blackwell-PRO-GPU-Architecture-v1_1.pdf)を使用。6000 Adaは同白書Appendix Aの蓄積精度別表を優先。4000はフルハイト130W版でありSFF版ではない。4000の[リンク先PDF](https://www.nvidia.com/content/dam/en-zz/Solutions/products/workstations/nvidia-rtx-4000-datasheet.pdf)にはTensor 327.6とあるが、現行製品ページ、下記line card、[PNY仕様](https://www.pny.com/nvidia-rtx-4000-ada-hw-sync?iscommercial=true)は427.6。後者を採用し、差異をGPUメモにも記録した。
- RTX A4500：[NVIDIA公式PDF](https://www.nvidia.com/content/dam/en-zz/Solutions/gtcs21/rtx-a5000/nvidia-rtx-a5000-datasheet.pdf)。URL名はA5000だが本文は20GB RTX A4500。モバイル版16GBと区別した。
- A40：[NVIDIAデータシート Mar22](https://images.nvidia.com/content/Solutions/data-center/a40/nvidia-a40-datasheet.pdf)。FP16/FP16、BF16/FP32、TF32、INT8/INT4の明示値を採用。FP16/FP32蓄積の条件は下記line cardを補助資料とした。
- A100：[NVIDIA A100白書](https://images.nvidia.com/aem-dam/en-zz/Solutions/data-center/nvidia-ampere-architecture-whitepaper.pdf)。40GB SXM4の仕様を採用した。非Tensor FP16は78 TFLOPSであり、同じ表の非Tensor BF16 39と混同しない。
- Jetson AGX Thor：公式Technical Brief、TRM、PTXとNVlabs SOLARの参考モデルを再調査した。FP16 Dense 258とINT8 Dense 517の直接公表値を優先。元の蓄積精度未公表項目は維持し、蓄積精度別の値等は仮定付き推定として区別した。[Thor再調査](thor-research-2026-11-11.md)を参照。128GBはCPU/GPU共有メモリ、130Wはモジュール電力上限。MAXN 1575MHzと標準120Wモード1386MHzを混在させない。Tensorコア数の資料差から公表ピークを再計算して置き換えない。

ワークステーションの蓄積精度は[NVIDIA Professional Graphics Solutions line card、文書3221166、APR24（NVIDIA作成資料の配布ミラー）](https://fe5e0932bbdbee188a67-ade54de1bba9a4fe61c120942a09245b.ssl.cf1.rackcdn.com/brochure_RTX_Ada_Desktop.pdf)脚注3でも確認した。同資料はデスクトップAdaをFP8入力、AmpereをFP16入力とし、どちらもFP16またはFP32蓄積と記載する。4000/5000 Ada、A4500等の精度換算はそのSKU自身の公称値を起点とし、アーキテクチャ白書の演算レート比を適用した算出値として記録する。他SKUの絶対値は流用していない。

CCの基本出典は[NVIDIA CUDA一覧](https://developer.nvidia.com/cuda/gpus)、V100は[Legacy一覧](https://developer.nvidia.com/cuda/gpus/legacy)。CUDAの演算レートは[CUDA 12.6 Programming Guide](https://docs.nvidia.com/cuda/archive/12.6.0/cuda-c-programming-guide/index.html#arithmetic-instructions)と各アーキテクチャ白書に照合した。

## 追加調査：NVIDIA A2（履歴・現在は削除済み）

以下は追加調査時の記録。A2は削除依頼により現行データベースから削除した。削除前のデータは `data/backups/gpus-before-remove-a2-*.json` に保存している。

[NVIDIA公式A2データシート](https://www.nvidia.com/content/dam/en-zz/solutions/data-center/a2/pdf/a2-datasheet.pdf)、[公式CUDA CC一覧](https://developer.nvidia.com/cuda/gpus)、[Lenovo製品ガイドLP1817](https://lenovopress.lenovo.com/lp1817-thinksystem-nvidia-a2-16gb-pcie-gen4-passive-gpu)を確認した。A2はAmpere、CC 8.6、16GB GDDR6、帯域200GB/s、PCIe 4.0 x8、ロープロファイル1スロット・パッシブ冷却。TDPは40～60Wで設定できるため、`power_w` に上限60、`power_min_w` に40を記録した。低電力設定で最大性能が出ると保証するものではない。

| 指標 | Dense | Sparse | 単位 |
| --- | ---: | ---: | --- |
| CUDA FP32 | 4.5 | 対象外 | TFLOPS |
| Tensor TF32 | 9 | 18 | TFLOPS |
| Tensor BF16 | 18 | 36 | TFLOPS |
| Tensor FP16（蓄積精度未公表） | 18 | 36 | TFLOPS |
| Tensor INT8 | 36 | 72 | TOPS |
| Tensor INT4 | 72 | 144 | TOPS |

Tensor FP16の蓄積精度は参照資料で明示されていないため、`tensor_fp16_unspecified_dense/sparse` に公表値を登録し、FP32蓄積・FP16蓄積それぞれの項目は未確認として `—` にする。Tensor BF16/TF32はAmpereのFP32蓄積の演算形式。FP8/FP4、ネイティブIEEE FP32入力、FP64加速Tensorは非対応として `x` にする。

非Tensor CUDA FP16は公称FP32×1 = 4.5、FP64は公称FP32×2/128 = 0.0703125 TFLOPSとして、[CUDA 12.6のCC 8.6命令スループット表](https://docs.nvidia.com/cuda/archive/12.6.0/cuda-c-programming-guide/index.html#arithmetic-instructions)から算出した `derived` 値を記録した。LenovoのFP64欄はNot applicableだが、これをネイティブFP64命令そのものがないという意味にはせず、直接公表値と理論換算を区別する。元のFP32の公称丸めを引き継ぐ。価格・購入リンク・実測結果は未登録。

## 数値の意味と欠測の管理

- `performance.<metric>.kind` は `published`（資料に明記）または `derived`（理論算出）。算出値の `note` に式、元の公称値、丸めや適用条件を記録した。`source` は同GPUの `sources` に対応する。
- 既存の `tensor_fp16_dense/sparse` と `tensor_fp8_dense/sparse` は**FP32蓄積**と定義を明確化。表示名には `FP16 → FP32` 等を使用する。FP16蓄積は `tensor_fp16_acc16_*` / `tensor_fp8_acc16_*` として独立させた。Tensor BF16はFP32蓄積、TF32もFP32蓄積。
- 蓄積精度が公表表で明示されていない値は `tensor_fp16_unspecified_*` / `tensor_fp8_unspecified_*` / `tensor_fp4_unspecified_*` に保持する。Thorの蓄積精度別参考値は、同じピークを適用できる等の仮定を記録した `derived` 値であり、蓄積精度別のメーカー直接公表値ではない。
- `Tensor FP32` はFP32蓄積を意味しない。IEEE FP32入力をそのまま計算するネイティブTensor演算として扱う。TF32やFP16入力・FP32蓄積の性能では埋めない。
- Sparseは指定の構造化疎行列での実効レート。Denseと条件が異なる。資料に双方の値があればそれぞれの丸め値を維持する。Sparseのみ公表の場合、対応が確認された精度に限りDenseを1/2として `derived` で記録する。
- 例：Thor FP8 Denseは公表517、Sparseは公表1035。前者を517.5に「修正」しない。INT8 DenseもTechnical Briefで517の直接公表が確認できたため、旧Sparse/2由来の517.5から517へ更新した。FP16 Denseも直接公表258を優先した。
- 欠測の各指標は `metric_status` に `not_supported`（非対応）、`not_published`（条件に合うピーク未確認）、`not_verified`（SKU自体の詳細未確認）、`not_applicable`（蓄積精度明示の別項目へ収録）と理由を記録した。基本仕様の出所と確認状態は `field_provenance` に記録した。
- 価格・購入リンクは既存登録があれば保持し、未登録はnull。価格条件や測定条件のないベンチマークスコアは追加しない。既存の対象GPUの実測記録があれば出典ごと保持する。

表では `metric_status` が `not_supported` の項目を `x`、未調査・未確認・条件不明の項目を `—` と表示する。数値が登録されている項目は数値を優先する。CSVでは非対応を `x`、未確認を空欄として区別する。種別・計算式・欠測理由はGPU編集の詳細JSON、または原本ファイルで確認できる。新しい精度項目は「表示項目を編集」から選択できる。どちらの欠測も数値範囲フィルタでは除外し、実測値の未登録は `—` とする。

## 検証

`python server.py --check` で形式を検証する。`python -m unittest discover -s tests -p 'test_*.py'` は保存処理に加え、指定16機種、全指標の値または欠測理由、GPU構成、蓄積精度の分離、未確認OEM値の欠測、Thorの電力範囲を確認する。UIの回帰テストは `python tests/browser_check.py --channel chrome` で固定フィクスチャを使って実行できる。
