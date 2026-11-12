# Gaudi2 / MI250 欠測の再調査

両機種の公称51項目を全件点検した。項目別の状態・根拠は [全件監査JSON](accelerator-completion-audit-2026-11-12.json)。確認できない数値を0や他精度の速度で埋めず、`not_supported`（非対応）、`not_applicable`（対象外）、`not_published`（同条件公表値なし）、`not_verified`（未確認）を分離した。前回の [初回登録調査](gaudi2-mi250-research-2026-11-12.md) の追補。

## MI250 非行列FP16

`gpu_fp16` に **90.5216 TFLOPS** を追加した。画面は既存ルールで90.5と表示する。

計算式: **208 CU × 4 SIMD/CU × 16 lanes/SIMD × 2 FP16/lane × 2 FLOPs/FMA × 1.7GHz**。

[AMD MI200 ISA（2022-02-04）§6.7、VOP3P命令表](https://developer.amd.com/wp-content/resources/CDNA2_Shader_ISA_18November2021.pdf)の `V_PK_FMA_F16` は、各32bitレーンで2つの独立した半精度FMAを計算する。[ROCm MI250構造](https://rocm.docs.amd.com/en/docs-10.0.0/reference/gpu-arch/mi250.html)のCU構成と [SKU](https://www.amd.com/en/products/accelerators/instinct/mi200/mi250.html)の208 CU・1.7GHzを用いた。**全SIMDで毎周期packed FMAを発行し最大クロックを維持する場合の参考理論上限**として `derived / architecture_model_max_clock` を記録した。メーカー直接公表値・持続性能保証・実測値ではない。MFMA行列演算362.1 TFLOPSと区別する。

検索結果には旧地域別SKU表のFP16 90.5が残っていたが、実際に開いた現行日本語SKUは362.1で英語と同じだった。検索スニペットを根拠に公表値とは扱っていない。

`vector_bf16` は **x** に訂正した。この指標はネイティブBF16ベクトルFMAであり、ISAの通常VALU・VOP3P表にはBF16 FMAがなく、BF16はMFMA行列命令として定義されている。FP32への変換を伴う実装が可能なこと、BF16行列命令362.1 TFLOPSがあることと、ネイティブVector BF16は別である。

## Gaudi2

[Gaudi2白書p.6](https://cdrdv2-public.intel.com/839363/Intel-Gaudi2-AI-Accelerators-whitepaper.pdf)ではMMEの全入力型をFP32へ蓄積する。したがって **Matrix INT8 → INT32** はその定義に合わずxへ訂正した。TPCのINT8・INT32命令が使えないという意味ではない。

FP16 / TF32 / FP32入力・FP32蓄積は対応確認済みだが、[Intel比較表のGaudi2列](https://cdrdv2-public.intel.com/817486/gaudi-3-ai-accelerator-white-paper.pdf)にはBF16 432・FP8 865のみが公表され、これら3型のSKUピークは見つからなかった。Gaudi3の速度比やBF16速度から転記していない。`supported: true / not_published` と根拠を記録し、公称欄は **—** を維持する。INT4広告値・広告AI TOPSも同条件の値が確認できず数値化しない。

TPC-Cの `float64` は[公式型仕様](https://docs.habana.ai/en/latest/TPC/TPC_C_Language_Spec/Supported_Data_Types.html)で「64要素のFP32ベクトル」を意味し、FP64対応の根拠にはならない。

代わりに、測定者が公開した **FP16 GEMM実測4件** を「実測値」に追加した。

| 形状 M=K=N | eager (TFLOPS) | compiled (TFLOPS) |
| --- | ---: | ---: |
| 8192 | 280.62 | 370.94 |
| 16384 | 283.51 | 335.73 |

出典は[生テキスト](https://github.com/changchinlan/gaudi-benchmark/blob/master/artifacts/07-gemm-gap/compiled-vs-eager.txt)、[測定コード](https://github.com/changchinlan/gaudi-benchmark/blob/master/scripts/09_gemm_compiled.py)、[条件・分析](https://github.com/changchinlan/gaudi-benchmark/blob/master/docs/10-closing-the-gemm-gap.md)、[SDK・PyTorch版](https://github.com/changchinlan/gaudi-benchmark/blob/master/docs/07-dtype-results.md)。GaudiSW1.24.1・PyTorch2.11、HL-225H 1台、FP16入力/出力、FP32蓄積、Dense、1 shape/process。eagerは10 warmup、compiledは25 warmup、各4組×15回、同期後の時刻計測。コードは各組の平均時間の**最小値**を採る。生テキストの「median」と表記が食い違うため、コードで確認した集計方法を条件欄に明記した。compiledは `torch.compile(backend="hpu_backend")`。

600Wは設定上限で、実際の測定電力・クロック・測定日は未確定。素朴なFP32 APIの86.63 TFLOPS等も見つかったが、内部TF32利用を排除できず、IEEE FP32ピーク・TF32ピークの代わりには登録していない。FP16 432を「公表ピーク」とする二次的な表記もメーカー自身の公表根拠をたどれず採用しなかった。

## 表の読み方・公開反映

- 数字、—、xの既存表記と数値だけのセル表示は維持する。欠測セルのホバー説明で「型対応済み・公表値なし」「対象外」「非対応」や個別根拠・確認日を読める。
- 公称51項目×2機種の値/状態を監査JSONへ記録。OAM占有スロット数は対象外、購入価格・購入リンクは条件未指定の未登録で、演算性能の未調査とは区別した。
- Gaudi2の公開実測は19件、全体31件。公称レコードは364件（比較用の同値の対応付けを含む）。既存の他機種の値は変更していない。
- 追加FP16実測4項目は、既存の実測表示順を維持して初回だけ末尾へ追加する。
- GitHub Pagesにも反映する。端末内に編集データを保存している場合は、JSON出力で必要な編集を退避してから「公開データに戻す」で更新後の原本へ切り替えられる。

**全欄を数値化できたわけではない。** 対応していても未公表のGaudi2ピークは—のままとし、上記の出典・理由を持つ調査済みの欠測として残した。
