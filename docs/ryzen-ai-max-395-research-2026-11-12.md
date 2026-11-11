# Ryzen AI Max+ 395 調査・収録記録

調査日: 2026-11-12。非PROの **AMD Ryzen AI Max+ 395 / Radeon 8060S、128GB共有メモリ構成**を追加した。CPU、内蔵GPU、NPUを1件のAPUとして扱い、実行主体を項目・測定条件で分ける。公開測定結果の収録であり、このPCでの実機測定ではない。

## CPU・メモリ・電力

| 項目 | 登録値 | 意味 |
| --- | --- | --- |
| CPU | Zen 5、16コア / 32スレッド | CPUの構成 |
| CPUクロック | ベース3GHz / 最大5.1GHz | 全コア持続クロックではない |
| CPUキャッシュ | L2 16MB / L3 64MB | GPUキャッシュとは別 |
| 内蔵GPU | Radeon 8060S、RDNA 3.5、40 CU、最大2.9GHz | ROCmターゲット gfx1151 |
| メモリ | 128GB、LPDDR5X-8000、256bit | 今回採用した共有RAM構成。全容量が常に専用VRAMとして使える意味ではない |
| メモリ帯域 | 256GB/s | 8000MT/s × 256bit / 8 の理論値。CPU/GPU共有 |
| 電力 | 既定55W、設定範囲45–120W | APUのTDP。GPU単独電力・システム実測電力とは別 |

出典: [AMD公式SKU仕様](https://www.amd.com/en/products/processors/laptop/ryzen/ai-300-series/amd-ryzen-ai-max-plus-395.html)、[ROCm GPU仕様表](https://rocm.docs.amd.com/en/latest/reference/gpu-specs.html)。異なる容量・冷却・電力設定のシステムを同一条件とは扱わない。

## GPU・NPUの理論演算性能

| 比較項目 | 登録値 | 条件 |
| --- | --- | --- |
| GPU FP64 | 0.464 TFLOPS | 40 CU × 4 FLOPs/CU/cycle × 2.9GHz |
| GPU FP32 | 29.696 TFLOPS | 40 CU × 256、VOPDによるdual issue成立時 |
| GPU FP16 | 59.392 TFLOPS | 40 CU × 512、packed FP16、dual issue成立時 |
| GPU FP32 single issue | 14.848 TFLOPS | 40 CU × 128、非VOPD |
| GPU FP16 single issue | 29.696 TFLOPS | 40 CU × 256、packed FP16、非VOPD |
| GPU Matrix FP16 / FP16蓄積 Dense | 59.4 TFLOPS | AMD公表のWMMAピーク |
| 広告 GPU AI FP16 | 60 TFLOPS | AMD SKUページの上限。WMMA公表値とは別の記録 |
| 広告 NPU AI | 50 TOPS | XDNA 2。SKUページだけでは入力型・疎性条件を確定できず、INT8 Denseへ代入しない |
| 広告プラットフォームAI合計 | 126 TOPS | Overall TOPS。単一モデルの同時実行・持続速度ではない |

VALUのレートは[AMD公式RDNA演算レート資料](https://rocm.docs.amd.com/projects/rocprofiler-compute/en/docs-10.1.0/conceptual/rdna/system-speed-of-light.html)から算出した。FMAを2演算とする。VOPDには命令の組合せ、レジスタ、独立性などの条件があり、2倍の速度が全カーネルで得られるわけではない。**FP64はsingle-issue FP32の1/32であり、dual-issue FP32の1/32ではない。** 最大GPUクロックもCPU/NPUとの同時持続を保証しない。

WMMA値は[AMDのRadeon FP16 GEMM解説](https://rocm.blogs.amd.com/software-tools-optimization/rdna-fp16-gemm/README.html)でRadeon 8060S、FP16入力・FP16蓄積、59.4 TFLOPSを確認した。FP32蓄積、BF16、他の入力型へ比例換算しない。記事のGEMM実測39.07 TFLOPSは、再取得制限で構成条件を十分確認できなかったため収録していない。

CPUのFLOPSは別SKUのEPYCから転記・推定しない。CPU、GPU、NPUや異なる精度の性能を足し合わせない。広告AI項目は基準倍率の対象外とした。

## CPU実測

[Geekbench Browserの結果13147946](https://browser.geekbench.com/v6/cpu/13147946)を収録した。Geekbench **6.4.0、Windows AVX2**、Framework Desktop FRANMFCP06、非PRO 395、16コア32スレッド、128GB構成（OS認識127.29GB）、Windows 11 Pro、Balanced。投稿日は2025-08-03。

| 測定 | スコア |
| --- | ---: |
| CPU single-core | 2957 |
| CPU multi-core | 22313 |

単一投稿の実測であり、全システムの平均・保証値ではない。Geekbenchの別版、別OS、別命令経路とは同じ指標に混在させない。実行時電力は不明で、55Wで測定したとは記載しない。

## LLM実測

測定者の[公開手順](https://github.com/matnum/local-llm-benchmarks/blob/main/README.md)、[生CSV](https://github.com/matnum/local-llm-benchmarks/blob/main/results/consolidated.csv)、[設定](https://github.com/matnum/local-llm-benchmarks/blob/main/matrix.yaml)を照合した。2026-10-22のrun `run-20261022-2042`（Vulkan）と `run-20261022-2124`（ROCm）から次の8値を収録した。

| モデル / 量子化 | バックエンド | prefill pp2048 (tokens/s) | generation tg512 (tokens/s) |
| --- | --- | ---: | ---: |
| GPT-oss-120B / native MXFP4 | Vulkan | 735.34 | 55.3 |
| GPT-oss-120B / native MXFP4 | ROCm | 882.6 | 50.91 |
| Qwen3-4B / Q8_0 | Vulkan | 1857.91 | 48.89 |
| Qwen3-4B / Q8_0 | ROCm | 2329.53 | 46.83 |

条件: llama.cpp commit `5b59b83f4`、128GB LPDDR5X-8000、CachyOS / kernel 7.2.10、Vulkan Mesa 26.2.4 RADVまたはROCm 7.2.4 HIP。GPU全レイヤーオフロード `-ngl 99`、CPUホスト16スレッド。メモリ構成は1GiB VRAM carveout + 104GiB GTT。各値は3回平均で、CSV記載の標準偏差も結果の注記に保持した。モデル容量はそれぞれ約59GiB / 4GiB。

これは **内蔵GPUを使うLLM測定**で、CPU単独LLMでもNPU実測でもない。CPUのホスト処理を含むが、CPUとGPUの個別速度を足した結果ではない。CPU Geekbenchとは別システム・別OSの測定である。matrixのサーバー用context 8192はllama-bench条件として流用せず、未確定のbatch/ubatchと電力は不明として残した。測定値を自身の用途へ適用する際はログと構成を確認する。

## データと画面への反映

- `data/gpus.json` の `ryzen-ai-max-plus-395` にCPU構成・共有メモリ・電力範囲・9件の公称/算出演算項目・10件の実測/集計結果を追加した。
- CUDA / NVIDIA Tensor CoreとCCは非対応 `x`。AMDのGPU演算はベンダー共通の「GPU FP64/FP32/FP16」「GPU Matrix FP16 / FP16蓄積 Dense」で比較する。旧NVIDIA値は保持し、共通項目へ64件を出典付きで対応付けた。
- 公称値の既存表示順を保ち、APU用のGPU共通演算4項目・CPUコア/スレッド数・NPU/プラットフォームAI TOPSを初回だけ末尾へ追加する。その後は通常どおり非表示・ドラッグ移動できる。「実測値」へ切り替えるとCPU2項目とLLM8項目を選べる。
- 数値範囲フィルタ、CC完全一致、並べ替え、編集、Ctrl+S確認保存でCUDA CCのないAPUを扱えるようにした。CCの空欄は `null` として保存し、架空のバージョンを割り当てない。
- 全17構成、演算性能295レコード（従来222件 + 共通項目への対応64件 + APU9件）、実測10レコード。295件が独立した実測結果という意味ではない。変更前は `data/backups/gpus-before-ryzen395-*` に退避した。

GPU名のCtrl+クリック先は既存方針に合わせ[TechPowerUp Radeon 8060S](https://www.techpowerup.com/gpu-specs/radeon-8060s.c4270)とした。これは内蔵GPUの参照ページで、CPU/NPUの仕様根拠はAMD公式。TPU本文は取得制限があり直接照合できていない。公開URL索引のCU数80はAMD公式40と異なるため採用せず、FP32/FP16もsingle/dual issueの条件を明示して公式レートから求めた。
