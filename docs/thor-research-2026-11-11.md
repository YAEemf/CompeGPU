# Jetson AGX Thor / T5000 128GB 再調査（2026-11-11）

ThorをデータセンターBlackwell（B200等）やRTX Blackwell（5090等）と同じ構成とみなさず、T5000固有の資料を確認した。GPUのCCは11.0。初回補完で元の9件から23件、追加調査でCUDA FP64を加えて24件へ性能レコードを増やした。全カタログは16機種、性能212件で、Thor以外のGPU、価格、購入リンク、表示順は変更していない。

**蓄積精度別に追加した値の一部は条件付きの参考推定であり、メーカーが蓄積精度別に保証した値ではない。** 対応する命令があることだけでは、そのピークに達するとは限らない。蓄積精度未公表の元の公称項目も保持し、両者を区別できるようにした。実測値は追加していない。

## 今回確認した一次資料

- [NVIDIA Jetson Thor Technical Brief、TB-12572-001、2025年8月](https://dam-cdn.nvd.orangelogic.com/AssetLink/v686u306w26ftuk863xjeimilimtx55e.pdf)：現行NVIDIA製品ページからリンクされている40ページの資料。Table 2（本文15ページ）を画像でも確認した。
- [NVIDIA Thor SoC Technical Reference Manual、DP-11881-002 v1.1](https://cdck-file-uploads-global.s3.dualstack.us-west-2.amazonaws.com/nvidia/original/4X/a/0/8/a0808d84bcb2524b5ee54ddea208b294887cd42e.pdf)：NVIDIAフォーラムで公開されたNVIDIA作成資料。4.1.2節（本文50～52ページ）のGPU構成、Tensor対応形式、構造化Sparse対応を確認。
- [NVIDIA PTX ISA：tcgen05 MMA](https://docs.nvidia.com/cuda/parallel-thread-execution/index.html#tcgen05-mma)：FP16/BF16、TF32、FP8/FP6/FP4、整数等の命令区分、データ型・蓄積型、SM110の対応を確認。これは対応命令の仕様であり、SKUの性能保証表ではない。
- [NVlabs SOLARのT5000性能モデル](https://github.com/NVlabs/SOLAR/blob/master/configs/arch/Jetson_Thor_T5000.yaml)と[モデルの出典・Dense/Sparseの説明](https://github.com/NVlabs/SOLAR/blob/master/configs/arch/README.md)：NVIDIA公開プロジェクトの参考モデル。確認時のT5000ファイルのblob SHAは `24117df6ef6640d1edbc50c49b86f76964489541`。同モデル自身もBF16/TF32を推定、CUDA FP32の旧15 TFLOPSを未検証と明示している。
- [NVIDIA担当者の回答](https://forums.developer.nvidia.com/t/performance-benchmarking-on-jetson-thor/349494/5)と[Jetson Linux r38.2電力・クロック表](https://docs.nvidia.com/jetson/archives/r38.2/DeveloperGuide/SD/PlatformPowerAndPerformance/JetsonThor.html)：CUDA FP32のMAXN 8.064、120W 7.096、GPUクロック1575/1386MHzを確認。
- [NVIDIA T5000製品仕様](https://www.nvidia.com/en-us/autonomous-machines/embedded-systems/jetson-thor/)：128GB共有LPDDR5X、256bit、273GB/s、40～130Wのモジュール仕様を確認。

## 直接公表を確認して修正した値

| 項目 | Dense | Sparse | 扱い |
| --- | ---: | ---: | --- |
| Tensor FP16（蓄積精度未公表） | 258 | 517 | DenseはTechnical Brief、Sparseは公式ブログ |
| Tensor FP8（蓄積精度未公表） | 517 | 1035 | Technical Brief Table 2 |
| Tensor FP4（蓄積精度未公表） | 1035 | 2070 | 同上 |
| Tensor INT8 | 517 | 1035 | DenseはTechnical Brief、Sparseは公式ブログ |

浮動小数点の単位はTFLOPS、整数はTOPS。以前のFP16 Dense 258.5とINT8 Dense 517.5は、Sparse値を半分にした算出値だった。**直接公表の258と517を優先して更新**した。丸め差があるため、公表されたDenseとSparseが厳密に2倍になるように修正してはいけない。

CUDA FP32の8.064もNVIDIA担当者の直接の説明が確認できたため、今回 `published` とした。2560 × 1.575GHz × 2（FMA）÷ 1000とも一致する。参考モデルの旧15 TFLOPSは、単位誤りや未検証の扱いがあり、採用していない。

## 条件付き参考推定として追加した値

| 入力／蓄積 | Dense | Sparse | 前提 |
| --- | ---: | ---: | --- |
| FP16 → FP32 | 258 | 517 | 公表FP16ピークをFP32蓄積へ適用できると仮定 |
| FP16 → FP16 | 258 | 517 | 公表FP16ピークをFP16蓄積へ適用できると仮定 |
| BF16 → FP32 | 258 | 517 | BF16 = FP16という参考モデルのレート比 |
| TF32 → FP32 | 129 | 258.5 | TF32 = FP16 / 2という参考モデルのレート比 |
| FP8 → FP32 | 517 | 1035 | 公表FP8ピークを当該蓄積精度へ適用できると仮定 |
| FP8 → FP16 | 517 | 1035 | 同上 |
| FP4 → FP32 | 1035 | 2070 | NVFP4 block-scaled命令経路への対応付け |

すべてTFLOPS。全て `kind: derived` とし、`confidence`、`note`、`supporting_sources` に仮定・式・限界を記録した。特にFP16/FP8の蓄積精度別の値は、**蓄積精度による追加のレート制限がないと仮定した推定**である。SKUの蓄積精度別ピークの直接公表が見つかったという意味ではない。ISAの対応だけを根拠に `published` へ変更しない。

BF16とTF32はNVlabs SOLARの推定方法を参照したが、数値は今回確認した直接公表値を起点にしている。したがって、Denseは258を起点に258/129、Sparseは517を起点に517/258.5としている。SOLARの旧Sparse/2由来のDense 258.5/129.25をそのまま転記していない。公式の丸め差を引き継いだ比較用参考値である。

FP4の命令経路への対応付けは、入力FP4形式・スケール形式・蓄積型・Sparse条件が一致する場合を前提とする。全ての「4bit」量子化モデルや整数INT4に同じ値が適用されるわけではない。

公称値表示には従来どおり `published` と `derived` が含まれる。表の数値セルに注記は追加していないため、厳密な比較ではGPU編集画面の詳細JSONで値の種別・前提を確認する。元の蓄積精度未公表項目を選ぶこともできる。

## 未確認・非対応を混同しない

- **CUDA FP64は追加調査で0.126 TFLOPSを登録した。** [CUDA Programming GuideのCC別仕様表](https://docs.nvidia.com/cuda/cuda-programming-guide/05-appendices/compute-capabilities.html#compute-capabilities-table-device-and-streaming-multiprocessor-sm-information-per-compute-capability)（確認時Table 33）で、CC 11.0の非Tensor FP32:FP64比は64:1。元のFP32 8.064 / 64 = 0.126 TFLOPS（126 GFLOPS）。`kind: derived` として式・出典・MAXN条件を記録した。画面は既存の最大小数1桁仕様により `0.1` と表示し、原本の0.126は保持する。120W時は0.11088 TFLOPSで、これをMAXNの値と混在させない。前回確認したBest Practicesの表だけでは不足していた点を補った。
- **【追補】参照リンクのTechPowerUp現行ページは非Tensor FP16を8.064 TFLOPS（FP32と1:1）と掲載しており、第三者データベース値（confidence: third_party_database）としてDBへ登録した。以下はNVIDIA公式資料に限った調査結果。**
- **CUDA FP16の非TensorピークはNVIDIA公式資料では再調査後も未確認。** [公式ネイティブ命令スループット表](https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/index.html#throughput-of-native-arithmetic-instructions)（13.5、Table 5）にはCC 11.0の列がなく、CUDA 12.9.1の旧表にも旧称CC 10.1は載っていない。命令が使えることだけでは発行レートは決まらないため `—` を維持する。PVAのFP16 320 GFLOPS、Tensor FP16の258 TFLOPSは別の演算器なので転記しない。
- **Tensor FP64・ネイティブTensor INT4は非対応を確認し `x` に更新。** [同Programming GuideのTensor入力型対応表](https://docs.nvidia.com/cuda/cuda-programming-guide/05-appendices/compute-capabilities.html#compute-capabilities-table-tensor-core-data-types-per-compute-capability)（確認時Table 36）のCC 11.0行では、FP64・INT4が非対応である。Dense/Sparseとも `not_supported` とした。PTXの一般的な最低SM条件を、その後の全SKUに高速Tensor回路が搭載される保証とは読まない。INT4重みを浮動小数点へ展開するモデルや、FP64のソフトウェアエミュレーションは別であり、ネイティブTensorピークへ逆算しない。
- `Tensor FP32` は丸めないIEEE FP32入力のネイティブTensor演算の意味。FP32蓄積やTF32をこの項目へ入れず、従来どおり `x`。
- 「広告AI TOPS」には、別項目で収録済みのFP4 Sparse 2070 TFLOPSを重複した整数TOPSとして追加しない。

## 電力モードとコア数の差異

128GBはCPU/GPU共有メモリ、40～130WはCPUやメモリを含むモジュールの電力である。GPU単体のボード電力と同じ条件ではない。CUDA FP32のMAXN 1575MHzと120Wモード1386MHzの値を混在させない。Tensorの公表ピークも、任意の低電力設定で出る性能を保証するものではない。MIG分割・クロック制限や旧世代向けの命令経路によっても低下する。

TRMではSMあたり4 processing blocks、各1 Tensor Coreとされる。T5000は20 SMなので構成からは80基を算出できる。一方、旧Technical Brief・ブログの「合計96」はこの記載と整合しない。`tensor_cores: 80` は `derived` として記録し、この相違を注記した。Tensorコア数を使ってメーカーの公表ピークを再計算し、置き換えることはしていない。

変更前は `data/backups/gpus-before-thor-research-*.json`、追加調査の変更前は `data/backups/gpus-before-thor-unknowns-*.json` に保存した。ベンチマーク実行は行っていない。実測値表示は未登録を維持する。
