# GPU参照リンクの統一（2026-11-11）

GPU名をCtrl＋クリックした際に開くURLを `reference_url` として登録。16機種中15機種をTechPowerUp GPU Databaseへ統一した。T40のみ対応する同一SKUのページを見つけられなかったため従来の販売元仕様を使用する。

TechPowerUp本体は調査環境のrobots制限で直接閲覧できなかった。URLの対応は[公開URL索引](https://huggingface.co/datasets/Jr23xd23/gpu-database/blob/main/data/all-gpus.json)から取得し、型番・メモリ容量を照合した。URL確認とページ本文・性能値の検証を混同しない。T10はGRID仮想GPU版ではなくTesla T10 16GB、V100/A100は指定のSXM・容量版を選択した。

参照先の数値をデータベースへ転記していない。とくにThorの索引中のクロック値などは既存の公式確認値と異なるため採用しない。既存の性能値、値ごとのsource、公式資料、算出式、欠測理由、価格、購入リンク、実測結果をすべて維持した。

公称・実測の切替や比較指標の変更によらず、GPU名からはこのGPU参照リンクを開く。実測ベンチマーク自体の根拠は各レコードのsourceに保持する。新規GPUなどで `reference_url` が空なら、従来どおり選択指標の出典、次いで表示モードに応じた主な出典へフォールバックする。編集フォームの「GPU名から開く出典URL」で任意に変更できる。

| GPU | GPU名から開く参照リンク |
| --- | --- |
| NVIDIA GeForce RTX 3090 | [仕様ページ](https://www.techpowerup.com/gpu-specs/geforce-rtx-3090.c3622) |
| NVIDIA GeForce RTX 4090 | [仕様ページ](https://www.techpowerup.com/gpu-specs/geforce-rtx-4090.c3889) |
| NVIDIA GeForce RTX 5090 | [仕様ページ](https://www.techpowerup.com/gpu-specs/geforce-rtx-5090.c4216) |
| NVIDIA Tesla V100 16GB SXM2 | [仕様ページ](https://www.techpowerup.com/gpu-specs/tesla-v100-sxm2-16-gb.c3018) |
| NVIDIA Tesla T4 | [仕様ページ](https://www.techpowerup.com/gpu-specs/tesla-t4.c3316) |
| NVIDIA Tesla T10 16GB | [仕様ページ](https://www.techpowerup.com/gpu-specs/tesla-t10-16-gb.c4036) |
| NVIDIA Tesla T40 24GB | [仕様ページ](https://serverflow.ru/catalog/komplektuyushchie/videokarty/videokarta-nvidia-tesla-t40-24-gb/) |
| NVIDIA Quadro RTX 6000 | [仕様ページ](https://www.techpowerup.com/gpu-specs/quadro-rtx-6000.c3307) |
| NVIDIA Quadro RTX 8000 | [仕様ページ](https://www.techpowerup.com/gpu-specs/quadro-rtx-8000.c3306) |
| NVIDIA RTX 4000 Ada | [仕様ページ](https://www.techpowerup.com/gpu-specs/rtx-4000-ada-generation.c4171) |
| NVIDIA RTX 5000 Ada | [仕様ページ](https://www.techpowerup.com/gpu-specs/rtx-5000-ada-generation.c4152) |
| NVIDIA RTX 6000 Ada | [仕様ページ](https://www.techpowerup.com/gpu-specs/rtx-6000-ada-generation.c3933) |
| NVIDIA RTX A4500 | [仕様ページ](https://www.techpowerup.com/gpu-specs/rtx-a4500.c3849) |
| NVIDIA A40 | [仕様ページ](https://www.techpowerup.com/gpu-specs/a40-pcie.c3700) |
| NVIDIA A100 40GB SXM4 | [仕様ページ](https://www.techpowerup.com/gpu-specs/a100-sxm4-40-gb.c3506) |
| NVIDIA Jetson AGX Thor (T5000 128GB) | [仕様ページ](https://www.techpowerup.com/gpu-specs/jetson-t5000.c4370) |

追加照合でV100のURL索引に不整合を発見し、独立したURL引用に基づきc3018へ訂正した。TechPowerUp本文の直接確認は未完了。[全16機種の照合結果](source-audit-2026-11-11.md)を参照。
