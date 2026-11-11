# GPU出典照合（2026-11-11）

## 結論と検証範囲

16機種すべてについて、登録した型番・容量・CC・コア数・帯域・電力・接続形式・CUDA精度別性能を参照先の公開索引と照合し、差異をNVIDIA一次資料や販売元の記載で再検討した。**「TechPowerUpの現行本文と全項目が一致」とは判定していない。** 本体のページ取得が制限されているため、索引の値は間接資料として扱った。特にV100とThorの索引には、公式仕様との大きな不整合がある。

Tensorの各入力精度・蓄積精度・Dense/Sparse値は索引に揃っていない。したがって、全212性能レコードの参照ID・種別・欠測状態を確認したことと、TechPowerUp本文で212値すべてを検証したことは別である。既存の公式白書・データシートの精度別表、算出式、条件付き推定、未確認の区分を維持した。価格・購入リンク・実測値は今回の性能照合の対象外であり変更していない。

## 再照合（同日・現行ページ本文と一次資料の直接確認）

前回未取得だったTechPowerUp現行ページ15件の本文をブラウザで直接取得し、NVIDIAの白書・データシート・製品ページ・CUDA資料も再取得して全機種を照合した。**下記の機種別表のうち「索引」に基づく記述（V100の1130GB/s・16.35、Thorの2525MHz・12.93など）は旧索引の値で、現行ページには存在しない。** 現行ページとの関係は各GPUの `reference_audit` を正とする。

### 修正・追加した項目

| 対象 | 変更 | 根拠 |
| --- | --- | --- |
| A100 40GB SXM4 | Tensor FP16（FP16蓄積）Dense 312 / Sparse 624 を追加（未公表扱いだった） | A100白書の仕様比較表に直接掲載 |
| V100 16GB SXM2 | Tensor FP16（FP16蓄積）125 を derived → published | 同表のV100列に直接掲載 |
| RTX 6000 Ada | 広告AI TOPS 1457 を追加 | 製品ページ「1457 AI TOPS（Theoretical FP8 TOPS using the sparsity feature）」 |
| RTX 4090 | 広告AI TOPS 1321 の出典を白書 → 製品ページへ訂正 | Blackwell白書のFP4 AI TOPS行は4090をN/Aとしている |
| RTX 3090 / A4500 / A40 / 4090 / RTX 4000・5000・6000 Ada | Tensor FP64 Dense を「未公表」→「非対応」 | CUDA Programming Guide Table 36（CC 8.6/8.9にFP64なし）、Ampere GA102白書の明記 |
| RTX 5090 | Tensor INT4 Dense/Sparse を「未公表」→「非対応」 | Table 36（CC 12.xにINT4なし） |
| RTX A4500 | CC 8.6 の確認状態を published → inferred | NVIDIA公式CC一覧にA4500の行がない |
| Tesla T4 | 帯域 300 → 320 GB/s（300は `bandwidth_datasheet_gbs` に保持） | Ada白書Appendix D、256bit×10Gbps、TechPowerUp現行ページが320 |
| 3090 / 4090 / 5090 / T4 / RTX 4000・5000・6000 Ada / V100 | 占有スロット数・冷却方式の空欄を補完 | 製品ページ・白書・データシート（3090のスロット数のみTechPowerUp） |
| T10・T40・Thor以外の13機種 | Boostクロックを追加 | 白書掲載値。掲載のない機種はTechPowerUp（確認状態 reference_database） |
| Quadro RTX 6000/8000 | Tensor FP16の蓄積精度の根拠を補足 | 元資料は蓄積精度を明記せず、同一構成TITAN RTXのAmpere白書値が両蓄積とも130.5 |

性能レコードは212件 → 215件（下記の追補でさらに222件）。既存の数値の変更はT4の帯域のみ。

### 残る相違（公式値を維持）

- **V100 SXM2**: TechPowerUpはTDP 250W、NVIDIAデータシートのSXM2列は300W。
- **Thor**: TechPowerUpはFP64 4.032 TFLOPS（1:2）・TDP 120W・FP4 1032.2。公式はCC 11.0のFP32:FP64 = 64:1（0.126）、40～130W、FP4 Dense 1035。Tensorコア数は公式ブログ/Technical Briefが96、TRMの構成（20 SM × 4）とTechPowerUpが80。
- **Quadro RTX 6000/8000**: TechPowerUp 260WはTGP、登録295WはTBP。
- **RTX 4000 Ada**: 製品ページ427.6とPDF 327.6。FP32 26.7 × 16 = 427に整合する427.6を維持。

### 比較時の注意：NVIDIA資料間の換算規約差

同じGA102/AD102でも、プロ向け資料（A40データシート、RTX PRO Blackwell白書）は TF32 = FP32×2、FP16/BF16（FP32蓄積）= FP32×4 で掲載し、GeForce白書（3090/4090）は TF32 = FP32×1、FP16/BF16（FP32蓄積）= FP32×2 で掲載する。A4500・A40・RTX 4000/5000/6000 Adaは前者、3090/4090/5090は後者に従うため、これら3項目を両グループ間で比べると同一チップでも2倍の差が出る。FP16蓄積・INT8・FP8（FP16蓄積）は両規約で一致するため、グループをまたぐ比較にはこちらが適する。各GPUのメモに同じ注意を記載した。

### 今回も未確認のもの

T10の所有者報告ページ・GPU-Z画像、T40のeBay販売元説明、Thor TRM/PTX/SOLARに基づく推定値の前提は再取得していない（T40のServerflowページとThorのブログ・製品ページ・電力モード表・フォーラム回答は再確認済み）。T10/T40にNVIDIA公式のSKU資料がない点、T40の250/260W、ThorのCUDA FP16は未解決のまま。

### 追補：参照ページに掲載があるのに未登録だった値

再照合の初回抽出では、TechPowerUpページの「Theoretical Performance（非Tensor）」と「Matrix Performance（Tensor）」に同名の `FP16` があるのを区別せず、行列側の値で上書きして読んでいた。このためThorの非Tensor FP16を見落とした。セクションを区別して15ページを取り直し、「ページに値があるのにDBが未登録（—）」の項目を全機種・全指標で洗い直した。

| 対象 | 追加した値 | 区分 |
| --- | --- | --- |
| Jetson AGX Thor | CUDA FP16 8.064 TFLOPS（FP32と1:1） | TechPowerUp掲載値。NVIDIA公式の直接公表は未確認 |
| RTX 4000 Ada | Tensor INT4 Dense 427.6 / Sparse 855.2 TOPS | DenseはTechPowerUp掲載値、Sparseは×2の算出 |
| RTX 5000 Ada | Tensor INT4 Dense 1044.5 / Sparse 2089.0 TOPS | 同上 |
| RTX 6000 Ada | Tensor INT4 Dense 1457.0 / Sparse 2914.0 TOPS | 同上 |

これらは `source: techpowerup`、`confidence: third_party_database` を付け、NVIDIA一次資料の公表値と区別している。

洗い直しの結果、非Tensor FP16/FP32/FP64と行列側の各値は、上記以外すべて登録済みの値と丸め差の範囲で一致した（ThorのFP64のみ既述の相違）。値が未登録のまま残るのは、どの出典にも掲載がない項目だけである：広告AI TOPS（4090・5090・RTX 6000 Ada以外）、RTX 5090のTensor FP64、T10/T40のTensor FP16（FP32蓄積）、T10/T40の蓄積精度未公表FP16（T10はTechPowerUpが79.99を掲載するが、DBの算出値と同じ理論計算値のため重複登録せず理由欄に記載。T40はページなし）。TechPowerUpが掲載するFP6（5090: 838、Thor: 516.1）はDBに対応する指標がないため未収録。

## 前回の照合で実施した修正

- V100 16GB SXM2の参照URLを、矛盾を含む索引のc3471から、[独立したSXM2 16GBのURL引用](https://github.com/gmasse/gpu-specs/blob/main/data/specs.json)にあるc3018へ訂正。現在のリンク先本文は直接未確認。公式SXM2の性能値は維持した。
- RTX 4000/5000 AdaのCUDA FP16は、製品ページに直接掲載された値ではなくCC 8.9のレート比からの算出値なので、`published` から `derived` へ訂正。RTX 6000 Adaの同値は直接掲載のPRO白書へsourceを訂正。いずれも数値自体は変更していない。
- Quadro RTX 6000/8000のTBP 295WとTGP 260Wを別フィールドで記録し、power_scopeを明記。比較用power_wは従来の295Wを維持した。
- Thorの「FP64/INT4は未確定」という古い注記を、現在のFP64算出済み・Tensor FP64/INT4非対応という状態へ更新。A40のFP16蓄積精度に関する古い説明も現レコードに合わせて訂正した。
- 各GPUのreference_auditと本レポートに確認状態・差異・限界を記録した。**212件の性能数値は一切変更していない。**

## 機種別の結果

「整合」は下記の比較可能な範囲を指す。未掲載項目を一致扱いにはしていない。TechPowerUp索引は[公開データセット](https://huggingface.co/datasets/Jr23xd23/gpu-database/blob/main/data/all-gpus.json)を利用し、採取データのSHA-256と比較値は[機械可読の照合記録](source-audit-2026-11-11.json)に残した。

| GPU | 参照ページ | 判定・相違・採用理由 |
| --- | --- | --- |
| NVIDIA GeForce RTX 3090 | [リンク](https://www.techpowerup.com/gpu-specs/geforce-rtx-3090.c3622) | 帯域936と索引936.2、CUDA FP32/FP16 35.6と35.58は公称丸め・Boost計算差。容量・CC・コア数・電力は一致。TensorはBlackwell白書Appendix Aの入力/蓄積別表を保持。 |
| NVIDIA GeForce RTX 4090 | [リンク](https://www.techpowerup.com/gpu-specs/geforce-rtx-4090.c3889) | 帯域1008と索引1010、CUDA 82.6と82.58は桁数差。Tensor FP16→FP32 165.2とFP16→FP16 330.3は別項目であり混同しない。 |
| NVIDIA GeForce RTX 5090 | [リンク](https://www.techpowerup.com/gpu-specs/geforce-rtx-5090.c4216) | 帯域1792と索引1790は丸め差。CC 12.0・32GB・21760 cores・575W・CUDA FP32/FP16 104.8は整合。Tensor FP4 3352はSparseでありDense 1676と区別。 |
| NVIDIA Tesla V100 16GB SXM2 | [リンク](https://www.techpowerup.com/gpu-specs/tesla-v100-sxm2-16-gb.c3018) | 旧索引の1130GB/s・250W・FP32 16.35は、公式SXM2の900GB/s・300W・15.7と不一致。旧c3471を独立したSXM2 16GB URL引用のc3018へ訂正。リンク本文は直接未確認。索引値へ数値を置き換えない。 |
| NVIDIA Tesla T4 | [リンク](https://www.techpowerup.com/gpu-specs/tesla-t4.c3316) | 索引FP16 65.13はCUDA FP16 16.2として転記不可。公式データシートの65はTensor混合FP16/FP32。帯域はMAR19データシート300、Ada白書320で公式資料自体に差があり300を維持。容量・CC・コア数・70Wは整合。 |
| NVIDIA Tesla T10 16GB | [リンク](https://www.techpowerup.com/gpu-specs/tesla-t10-16-gb.c4036) | 16GB・3584 cores・1395MHz・403.2GB/s・CUDA FP32約10/FP16約20は索引と実機公開画像で整合。GRID仮想GPU版と区別。150Wは所有者報告であり、SKU公式保証のTDPを確認したという意味ではない。 |
| NVIDIA Tesla T40 24GB | [リンク](https://serverflow.ru/catalog/komplektuyushchie/videokarty/videokarta-nvidia-tesla-t40-24-gb/) | 直接取得できた販売元の24GB・4608 cores・1560MHz・FP32 14.38は登録の14.37696と整合。販売元説明のTensor世代はTuringの公式第2世代と矛盾するが採用していない。250/260Wの出典間相違は未解決のためpower_wはnullを維持。帯域624は別売主のクロックからの換算。 |
| NVIDIA Quadro RTX 6000 | [リンク](https://www.techpowerup.com/gpu-specs/quadro-rtx-6000.c3307) | 24GB・CC 7.5・4608/576 cores・672GB/s・FP32 16.3は整合。索引260WはTGP、登録295WはVirtualLink込みTBP。公式資料は両方を掲載し、数値誤りではない。別フィールドと電力範囲を追加。 |
| NVIDIA Quadro RTX 8000 | [リンク](https://www.techpowerup.com/gpu-specs/quadro-rtx-8000.c3306) | 48GB・CC 7.5・4608/576 cores・672GB/s・FP32 16.3は整合。260W(TGP)/295W(TBP)は仕様範囲の違い。NVIDIA公式データシートも追加して両方を記録。 |
| NVIDIA RTX 4000 Ada | [リンク](https://www.techpowerup.com/gpu-specs/rtx-4000-ada-generation.c4171) | 20GB・6144 cores・360GB/s・130Wのフルハイト版と整合。製品ページTensor 427.6と同社PDF 327.6は資料間不整合（427.6採用）。非Tensor FP16 26.7はFP32からの算出であるためpublished→derivedへ訂正。 |
| NVIDIA RTX 5000 Ada | [リンク](https://www.techpowerup.com/gpu-specs/rtx-5000-ada-generation.c4152) | 32GB・12800 cores・576GB/s・250W・FP32 65.3は索引と公称丸め内で整合。Tensor 1044.4はFP8 Sparse。非Tensor FP16 65.3をpublished→derivedへ訂正。 |
| NVIDIA RTX 6000 Ada | [リンク](https://www.techpowerup.com/gpu-specs/rtx-6000-ada-generation.c3933) | 48GB・18176 cores・960GB/s・300W・CUDA 91.1は索引と公称丸め内で整合。非Tensor FP16のsourceを直接掲載のPRO白書へ訂正。Tensor 364/728とFP8 728.5/1457の丸め差を維持。 |
| NVIDIA RTX A4500 | [リンク](https://www.techpowerup.com/gpu-specs/rtx-a4500.c3849) | デスクトップ20GB・7168 cores・640GB/s・200Wで整合。CUDA FP32 23.7と索引23.65は丸め差。元のPDFファイル名はA5000だが本文がA4500であることを確認済み。16GBモバイル版と区別。 |
| NVIDIA A40 | [リンク](https://www.techpowerup.com/gpu-specs/a40-pcie.c3700) | 48GB・10752 cores・300W・FP32 37.4は整合。帯域696対695.8は丸め差。FP16→FP32は別資料の条件からのderivedであり、以前の「代入しない」という古いGPUメモと現データの説明を整合させた。 |
| NVIDIA A100 40GB SXM4 | [リンク](https://www.techpowerup.com/gpu-specs/a100-sxm4-40-gb.c3506) | 40GB・6912 cores・400W・FP32 19.5は整合。帯域1555対索引1560、CUDA FP16 78対77.97は丸め差。索引PCIe 4.0 x16はホストI/O情報で、SXM4モジュール形状をPCIeカードへ置き換える根拠にしない。 |
| NVIDIA Jetson AGX Thor (T5000 128GB) | [リンク](https://www.techpowerup.com/gpu-specs/jetson-t5000.c4370) | 索引2525MHz・CUDA FP32 12.93・FP64 6.46・FP16 51.71・40Wは、公式MAXN 1575MHz・FP32 8.064・CC 11.0 FP64比64:1・40～130Wと不整合。公式確認値を保持。Tensor数80対96は既知の資料差で未解消。条件付きTensor推定を保証値とみなさない。古い未確認説明を訂正。 |

## 差異の主な根拠

### V100：SKUを混在させない

[NVIDIAデータシート](https://images.nvidia.com/content/technologies/volta/pdf/volta-v100-datasheet-update-us-1165301-r5.pdf)のSXM2列を確認した。900GB/s、300W、FP32 15.7、FP64 7.8、Tensor 125が対象。旧索引の1130GB/s、250W、FP32 16.35はこの列に一致せず、V100S系に近い値が混在する。これを同一SKUの更新値とは解釈しない。URL引用に使った別データベースの性能分類も誤りを含むため、同サイトから性能値は採用していない。

### T4：Tensor FP16をCUDA FP16へ入れない

[NVIDIA T4データシート](https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/tesla-t4/t4-tensor-core-datasheet-951643.pdf)は混合FP16/FP32のTensor性能65 TFLOPSを掲載している。これを非TensorのCUDA FP16へ転記しない。非Tensor FP16は[CUDA 12.6のCC 7.5命令レート](https://docs.nvidia.com/cuda/archive/12.6.0/cuda-c-programming-guide/index.html#arithmetic-instructions)でFP32の2倍として算出する。帯域300/320GB/sは公式資料間に差があるため、その差も維持して記録する。

### Quadro：電力の対象範囲をそろえる

[NVIDIA RTX 6000データシート](https://www.nvidia.com/content/dam/en-zz/Solutions/design-visualization/quadro-product-literature/quadro-rtx-6000-us-nvidia-704093-r4-web.pdf)と[RTX 8000データシート](https://www.nvidia.com/content/dam/en-zz/Solutions/design-visualization/quadro-product-literature/quadro-rtx-8000-us-nvidia-876688-r5-web.pdf)はボード全体295Wとグラフィックス部分260Wを区別している。一律に260へ修正する必要はない。

### Ada：公称値・算出値・資料間相違を区別する

[RTX 4000製品ページ](https://www.nvidia.com/en-us/products/workstations/rtx-4000/)のTensor値427.6と、同ページからリンクされる[PDF](https://www.nvidia.com/content/dam/en-zz/Solutions/products/workstations/nvidia-rtx-4000-datasheet.pdf)の327.6は一致しない。製品ページと既存line cardの427.6を採用した状態を維持する。[RTX 5000製品ページ](https://www.nvidia.com/en-us/products/workstations/rtx-5000/)の65.3はFP32であり、同ページのFP16直接公表と扱わない。

[RTX PRO Blackwell白書V1.1](https://www.nvidia.com/content/dam/en-zz/Solutions/design-visualization/quadro-product-literature/pdf/NVIDIA-RTX-Blackwell-PRO-GPU-Architecture-v1_1.pdf) Appendix AにはRTX 6000 Adaの非Tensor FP16と蓄積精度別のTensor性能が直接記載される。GeForce各世代の対応値は[RTX Blackwell白書V1.1](https://images.nvidia.com/aem-dam/Solutions/geforce/blackwell/nvidia-rtx-blackwell-gpu-architecture.pdf) Appendix Aの比較表を維持する。

### Thor：公開索引の数値を採用できない

索引の2525MHzから計算されたFP32 12.93や、FP64 6.46は、[NVIDIAのMAXN FP32回答](https://forums.developer.nvidia.com/t/performance-benchmarking-on-jetson-thor/349494/5)、[電力モード別クロック](https://docs.nvidia.com/jetson/archives/r38.2/DeveloperGuide/SD/PlatformPowerAndPerformance/JetsonThor.html)、[CC 11.0のFP32:FP64比64:1](https://docs.nvidia.com/cuda/cuda-programming-guide/05-appendices/compute-capabilities.html)と一致しない。40Wだけの表示も、[公式製品仕様](https://www.nvidia.com/en-us/autonomous-machines/embedded-systems/jetson-thor/)の40～130Wレンジ全体や130W上限を表さない。

Tensorコア数80/96の資料差、CUDA FP16未確認、蓄積精度別Tensor値の仮定は[Thor調査記録](thor-research-2026-11-11.md)を参照。未解決事項を「矛盾なし」に変更していない。

### T10/T40：実機報告・販売元報告の限界

T10のGPU-Z画像とT40の販売元記載は[既存の調査記録](t10-t40-research-2026-11-11.md)と照合した。[T40の直接参照先](https://serverflow.ru/catalog/komplektuyushchie/videokarty/videokarta-nvidia-tesla-t40-24-gb/)は24GB、4608 cores、1560MHz、FP32 14.38を示す一方、Tensor世代に誤った説明を含む。各欄を個別に評価し、販売ページ全体を公式保証値として扱わない。250/260Wの違い、帯域換算の前提、蓄積精度別Tensorピークの未確認は残る。

## 未完了とした範囲

TechPowerUp現行本文そのものの全数・全項目一致、元ページにない精度別性能の検証、T40の公式SKU仕様、Thorの未公表命令レートや資料間差は未確定。TechPowerUpが参照先であっても、根拠未確認の値へデータを合わせてはいない。
