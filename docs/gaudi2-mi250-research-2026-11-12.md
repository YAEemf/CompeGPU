# Intel Gaudi2 / AMD Instinct MI250 調査・登録記録

後続更新: [欠測の再調査](accelerator-completion-2026-11-12.md)でMI250非行列FP16の参考算出値、非対応判定、Gaudi2 FP16実測4件を追加した。以下は初回登録時の記録。

調査日: 2026-11-12。`intel-gaudi2-hl225h` と `amd-instinct-mi250` を追加した。各1 OAMを比較単位とし、公称・算出ピークと公開実測を分離した。ローカルで実機測定した結果ではない。

## 採用仕様

| 項目 | Intel Gaudi2 HL-225H | AMD Instinct MI250 |
| --- | ---: | ---: |
| 構成 | OAM 1.1、2 MME + 24 TPC | OAM、2 GCD、208 CU（104×2） |
| メモリ | 96GB HBM2e | 128GB HBM2e（64GB×2） |
| 公称帯域 | 2450GB/s | 3200GB/s（1600×2） |
| 電力 | 上限TDP 600W | 500W TDP / 560Wピーク |
| 通常Vector FP64 / FP32 | 同条件のピーク未登録 | 各45.3 TFLOPS |
| Packed FP32 | 該当せず | 90.5 TFLOPS |
| Matrix FP64 / FP32 | FP64非対応 / FP32ピーク未確認 | 各90.5 TFLOPS |
| Matrix FP16 → FP32 Dense | 対応するがピーク未確認 | 362.1 TFLOPS |
| Matrix BF16 → FP32 Dense | 432 TFLOPS | 362.1 TFLOPS |
| Matrix FP8 → FP32 Dense | 865 TFLOPS | 非対応 |
| Matrix INT8 → INT32 Dense | 同条件ピーク未確認 | 362.1 TOPS |
| Vector BF16 | 11 TFLOPS | 同条件ピーク未確認 |

Gaudi2の構成・メモリ・上限TDP・対応型・MMEのFP32蓄積は[Intel Gaudi2白書v2.0（2023-10）pp.6,10,29](https://cdrdv2-public.intel.com/839363/Intel-Gaudi2-AI-Accelerators-whitepaper.pdf)を根拠とする。432 / 865 / 11は[Intel Gaudi3技術資料（2025-07 rev.3）Table 1のGaudi2列](https://cdrdv2-public.intel.com/817486/gaudi-3-ai-accelerator-white-paper.pdf)。Gaudi3列の数値を混入させない。帯域はGaudi2専用白書2.45TB/sを採用し、後年の比較表2.46TB/sは `bandwidth_alternate_gbs` に保持した。FP16・TF32・FP32入力の対応は確認できるが、BF16値から同じ速度と推定しない。Vector BF16 11をVector FP32 11へ読み替えない。

MI250は[公式SKU仕様](https://www.amd.com/en/products/accelerators/instinct/mi200/mi250.html)、[ROCm MI250構造・演算表](https://rocm.docs.amd.com/en/docs-10.0.0/reference/gpu-arch/mi250.html)、[AMD MFMA入力・蓄積型表](https://github.com/amd/amd-lab-notes/blob/release/matrix-cores/README.md)を照合した。**MI250X（220 CU、47.9/95.7/383 TFLOPS）ではない。** 2 GCDの合計値であり、単一GCDへ同じ128GB・45.3 TFLOPSを割り当てない。通常は2論理GPUとして扱い、64GBずつのメモリを単一デバイスの連続128GBとみなさない。公開実測は560W構成で、公称欄の500Wと区別する。

MI250英語SKUのFP16 362.1はMatrix値であり、非行列FP16へ転記していない。地域別旧SKU表などの90.5との表記差もあり、今回の一次資料だけで非行列FP16の同条件レートを独立に確定できなかったため `—` を維持する。[CDNA2の対応表](https://rocm.docs.amd.com/projects/rocprofiler-compute/en/docs-10.1.0/conceptual/cdna/cdna-performance-model.html)に基づきTF32・FP8行列は `x`。公式INT4 362.1 TOPSは広告専用項目に保持し、INT4 DOT/packingとネイティブINT4 Matrix命令を混同しない。広告項目の基準倍率は無効とした。

## Gaudi2の公開実測

[論文 arXiv:2503.09975v1 Table 1](https://arxiv.org/html/2503.09975v1)のGaudi2 1台のDense scaled FP8 GEMM平均を収録した。入力FP8、**蓄積FP32、出力BF16**。出力型を蓄積型として登録しない。

| M=K=N | per-tensor / HW scaling | per-tensor / 非HW scaling | per-channel / 非HW scaling |
| --- | ---: | ---: | ---: |
| 4096 | 803.8 | 771.4 | 746.5 |
| 6144 | 849.1 | 837.5 | 831.5 |
| 8192 | 851.2 | 800.8 | 760.4 |

単位TFLOPS。[測定者の再現コード](https://github.com/NAVER-INTEL-Co-Lab/gaudi-perf/blob/main/matmul/fp8.py)も確認した。HPU events/graphs、FP8事前変換、キャッシュを反復ごとにフラッシュしない方式。確認時のコードblobは `d419df686e5ab47a6eeb3dd3573a8dc3a0ee9115`。コードの現在のデフォルト反復数などを、論文が明示していない過去の設定として補完しない。固定SDK・ドライバ版・電力等の不足は各指標の条件欄へ残した。

さらに[測定者のBF16 GEMM表](https://github.com/NAVER-INTEL-Co-Lab/gaudi-perf/blob/main/matmul/README.md)から4096³=408.2、8192³=423.9 TFLOPSの平均を収録した。確認したREADME blobは `e01c390a6d854ab3a5256655e8a5cdf563b2d8b3`。同表のA100/H100は容量・構成を特定できないため既存GPUへ転記していない。

[Intel公式Gaudi2 inference 1.19.0の表](https://www.intel.com/content/www/us/en/developer/platform/gaudi/model-performance-gaudi2-inference-1-19.html)からは、LLaMA 3.1 8B FP8の **1 HPU** の行だけを収録した。

| 入力tokens | 出力tokens | バッチ | 合計throughput (tokens/s) |
| ---: | ---: | ---: | ---: |
| 128 | 128 | 2816 | 19875 |
| 128 | 2048 | 512 | 14784 |
| 2048 | 128 | 179 | 2011 |
| 2048 | 2048 | 256 | 6083 |

HLS-Gaudi2（8枚搭載）の1枚を使用。ホストは2×Xeon Platinum 8380、RAM 1TB、Gaudi software 1.19.0、Optimum-Habana/Hugging Face。高バッチの合計速度であり、1ユーザーの生成速度や既存Ryzenのllama-bench tg512とは同じ指標にしない。公式ページ内で冒頭・DockerはPyTorch 2.5.1 / Ubuntu24.04、末尾はPyTorch2.4.0 / Ubuntu22.04と不一致があるため、その資料版に限定した指標IDとし、`confidence` と条件欄に矛盾を明記した。複数HPUの70B結果を1台へ割り算しない。

## MI250の公開実測

[AMD MI200性能表の1xMI250列・脚注5/6](https://www.amd.com/en/products/accelerators/instinct/mi200.html)から収録した。

| 測定 | 原資料の値 | 登録値 | 条件 |
| --- | ---: | ---: | --- |
| HPL | 40.45 TFLOPS | 40.45 TFLOPS | 2022-11-14、rocHPL6.0.0、ROCm5.2.0 |
| HPCG 3.0 | 488.8 GFLOPS | 0.4888 TFLOPS | 2022-11-02、ROCm5.2.0、Ubuntu20.04.4、SBIOS M12 |

共通: 1 OAM / 128GB、560W構成、2P EPYC7763、SMT無効。CPUホストを含むシステム測定でありGPUの理論ピークではない。問題サイズ・全MPI設定は未掲載と明記した。2 OAM・4 OAMの結果を1 OAMへ流用しない。HPLとHPCGは別指標。UIの性能値は最大小数1桁の既存ルールに従うので40.5 / 0.5と表示するが、原本の40.45 / 0.4888は保持する。

## 比較項目・保存・参照リンク

- 共通Matrix項目は入力・蓄積型、Denseを分離。既存NVIDIA値56件は値・出典・算出条件を維持した対応付けとして追加した。既存295レコードと実測10件は変更していない。
- 新規2機種の公称レコードは計12件、実測/集計は17件。全19構成、51演算指標定義、363公称レコード（重複する共通項目への対応を含む）、27実測レコードとなった。
- CUDA / NVIDIA Tensor専用欄とCCは非対応 `x`。ピーク未確認は `—`。型対応の有無と公称速度の判明を区別し、未知を0で埋めない。
- 共通Matrix・Vector BF16・packed FP32の9項目は、公称表示の既存の手動順を保ち初回だけ末尾へ追加。実測の既存表示にも17項目を初回だけ追加。その後は自由に非表示・並べ替えできる。
- MI250のGPU名Ctrl+クリック先は[TechPowerUp MI250](https://www.techpowerup.com/gpu-specs/radeon-instinct-mi250.c3847)。公開URL索引で型番・参照先を確認したがTPU本文は直接取得できておらず、性能根拠はAMD公式。Gaudi2の同系列TPUページは確認できず、Intel Gaudi2専用白書を参照先とした。
- バックアップ: `data/backups/gpus-before-gaudi2-mi250-20261112-072124-385733.json`。範囲フィルタ、null CCのソート、表示移行、実測分離、行列反転、Ctrl+S確認保存、参照リンクをブラウザで検証した。
