# 0004: Apache License 2.0 + TRADEMARKS.md でブランド保護

- Status: Accepted
- Date: 2026-05-08

## Context

YuiPath を OSS として公開する。要件:

- ✅ 無償で配布したい
- ✅ 改変・商用利用 OK（コピーレフト強制はしたくない）
- ✅ ただし **「YuiPath」の名前とロゴは消さないでほしい**
- 個人 (n-guitar) 名義で開始、将来法人化／財団化の可能性

検討した選択肢:

| Option | 帰属 | SaaS開示 | 商用化 | 商標条項 | 評価 |
|---|---|---|---|---|---|
| MIT | △ (短文) | ❌ | ✅ | ❌ | 商標保護を別途必要 |
| **Apache 2.0** | **✅ NOTICE** | **❌** | **✅** | **✅ §6** | **採用** |
| BSD 3-Clause | ✅ | ❌ | ✅ | △ (派生宣伝制限) | OK だが Apache の方が明確 |
| MPL 2.0 | ✅ | △ (改変ファイル) | ✅ | ✅ | やや複雑 |
| GPLv3 | ✅ | ❌ | ✅ | ❌ | コピーレフト過剰 |
| AGPLv3 | ✅ | ✅ | △ | ❌ | SaaS フリーライド防止には強いが、本要件と不一致 |
| BSL 1.1 | - | - | △ (期限付商用制限) | - | 「無償でいい」と矛盾 |
| **CPAL 1.0** (ProjectLibre) | ✅ | ✅ | △ | ✅ | SaaS 改変開示が制約大、避けたい |

決定的な要素:
1. **コードは Apache 2.0**（無償・自由・特許防御条項あり・商標保護を明記）
2. **ブランド（名前 + ロゴ）は商標として別管理**（TRADEMARKS.md）

「コードは OSS、ブランドは商標で守る」は Kubernetes / Docker / Terraform / Mozilla / Linux など主要 OSS の業界標準形。

## Decision

### コードライセンス: Apache License 2.0

理由:
- 無償・改変・商用利用すべて許可
- NOTICE ファイルを派生物にも保持させる仕組み（§4）
- §6 Trademarks で「ライセンサーの商標は別」と明文化
- 特許条項 (§3) で訴訟リスク低減
- 業界標準（K8s / Docker / Terraform 旧版 / Anthropic SDK 等）

### ブランド保護: TRADEMARKS.md

`YuiPath` の名前と ロゴ は商標として保護。具体ルール:

**自由 (許可不要)**
- 言及・リンク・"YuiPath compatible" 等の正確な記述
- 公式ロゴをそのまま貼って **紹介**する（改変なし、リンク付き）

**事前承諾必要**
- フォーク・派生物に「YuiPath」を**含む名前**を付ける（例: "YuiPath Pro" は NG）
- ロゴを自社ブランディングに使う、ロゴを改変する

**禁止**
- 配布バイナリ／ソース内から **YuiPath の名前やロゴを削除**
- スプラッシュ・About 画面・タイトルバーから YuiPath ブランドを除去

**フォーク時のルール**
- フォーク名は YuiPath を含まない別名（例: "MyPath" OK、"YuiPath+" NG）
- README に "Based on YuiPath" 推奨
- ロゴは自分で別のものを作る

### リポジトリ構成

```
YuiPath/
├── LICENSE              ← Apache License 2.0 全文
├── NOTICE               ← Copyright + 商標表記
├── TRADEMARKS.md        ← 商標ポリシー
├── README.md            ← License + Trademark 明記
└── src/                 ← 各ファイルに SPDX-License-Identifier ヘッダ
```

NOTICE ファイル例:
```
YuiPath
Copyright 2026 n-guitar

This product includes software developed at n-guitar.

YuiPath, the YuiPath logo, and related visual identity
are trademarks of n-guitar (or successor).
For trademark usage policy, see TRADEMARKS.md.
```

各ソースファイルのヘッダ:
```
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 n-guitar
```

## Consequences

### Accepted (positive)
- 誰でも自由に使える、商用利用可、フォーク可
- NOTICE で著作権表示の維持を **法的に強制**できる
- §6 によりライセンスでの商標保護根拠あり
- TRADEMARKS.md で「ロゴ・名前を消すな」を明文化（違反者には商標権侵害として法的対応可能）
- 業界標準のため、ユーザー／contributors に説明不要

### Accepted (negative)
- AGPL のような「SaaS フリーライド防止」は得られない（他社が YuiPath を別ブランドで SaaS 提供することは可能、ただしブランド保護は効く）
- TRADEMARKS.md の運用（違反者対応）は人的リソースを要する
- 商標出願していない段階では「未登録商標」扱い、登録した方が圧倒的に強い

## Risks

### 商標未登録リスク
- 立ち上げ期は未登録のまま、TRADEMARKS.md で実態的保護
- 認知拡大したら J-PlatPat / USPTO に出願（個人 12,000円 + 28,200円）
- 第三者に先取りされるリスクは低いが、ゼロではない

### ブランド除去フォーク
- 技術的には誰でもバイナリからロゴを除去できる
- 法的には商標権侵害として対応可、ただし発見・追跡コストあり
- 大半の OSS 開発者はライセンスを尊重するため、明文化だけで実効性は高い

### 個人名義ゆえの責任
- Apache 2.0 §7 の "AS IS / NO WARRANTY" 条項で訴訟リスクは大幅低減
- 日本の消費者契約法で完全免責は無効化されうる（ただし B2B/開発者向けOSS では基本効く）
- 法人化前は不安なら個人事業主届け出 + 賠償保険検討

## Revisit when

- 認知拡大して商標出願タイミング（個人 → 法人譲渡を見据えて）
- 商用 SaaS 提供を始めるタイミング（ライセンス違反対応の体制整備）
- フォーク・OSS 派生物との衝突が発生
- 法人化（既存合同会社 #93 へ譲渡 or 専用法人新設）

## 関連
- 個人 vs 法人（issue #128 で議論）
- GitHub Sponsors 設定（FUNDING.yml）
