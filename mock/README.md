# YuiPath モック

製品 UX を定義するインタラクティブモック。HTML / CSS / JSX で書かれており、ビルド工程なしでブラウザで直接動きます。

## 起動

```bash
cd mock/project
python3 -m http.server 8731
# http://localhost:8731/YuiPath.html を開く
```

ハードリロード（`Cmd+Shift+R`）を CSS / JSX 変更時に推奨。`babel-standalone` のキャッシュ対策です。

## ステータス

**Mock phase 完了**（2026-05-09）。設計・実装 phase に移行する前のスナップショットとして、この実装が "製品 UX 仕様" の役割を果たします。これ以降の機能追加は実装側で行う想定です（モック側の修正は UX 仕様の追従調整に限定）。

## 構成

| パス | 内容 |
|---|---|
| [`project/YuiPath.html`](project/YuiPath.html) | エントリポイント。`<script type="text/babel">` で `*.jsx` を順次ロード |
| [`project/*.jsx`](project/) | アプリ実体（ロード順は次節） |
| [`project/styles.css`](project/styles.css) | 全スタイル（`pw-` プレフィックス） |
| [`project/assets/`](project/assets/) | dev サーバーから読まれるアセット（スマイル SVG コピー） |
| [`chats/issue.md`](chats/issue.md) | 製品の初期構想・市場調査・技術検討（長文） |
| [`chats/chat1.md`](chats/chat1.md) | モック iteration の設計対話 |
| `yuipath-*.svg` | ブランドアセット原本（スマイル静止 / アニメ / ロゴタイプ） |

## ファイルロード順

`project/YuiPath.html` 内で以下の順に読まれます：

```
data.jsx → primitives.jsx → pickers.jsx → tweaks-panel.jsx →
gantt.jsx → screens.jsx → table.jsx → calendar.jsx → auth.jsx → app.jsx
```

各 `.jsx` は global スコープに展開され、末尾で `Object.assign(window, {...})` でコンポーネントを公開します。関数宣言は hoist されるため、依存先が後でロードされても render 時には解決されます。

## 実装ハイライト

詳細なアーキテクチャと規約は [`../CLAUDE.md`](../CLAUDE.md) に集約。要点だけ：

- **状態管理**: 5 つのカスタムストア（tasks / resources / projects / comments / calendars）。`useSyncExternalStore` で各コンポーネントが購読
- **ドロワー**: タスク・リソース・プロジェクト編集はモーダルではなくドロワー（640px 幅）
- **テーマ**: `data-theme="dark"` で全色変数を上書き、`prefers-color-scheme` 追従可能
- **ドラッグ操作**: ガントバー（移動 / 左右リサイズ）、テーブル行（並び替え）、両方 pointer-event ベースで実装
- **CSS prefix**: `pw-` は legacy 命名（"ProjectWeb" 時代）のまま維持。ユーザー非可視のため当面そのまま

## ブランドアセット

`mock/yuipath-*.svg` がオリジナルです。モック内では `<img>` 経由で参照する都合、コピーが [`project/assets/`](project/assets/) にも置かれています（dev サーバーが mock/ 親ディレクトリを serve しないため）。

ロゴタイプの "YuiPath" 文字部分のみ Nunito 800（Google Fonts）を 1 ファイル読みます。それ以外の本文・見出しはすべて OS のシステムフォント（San Francisco / Segoe UI / Hiragino Sans 等）を使い、Web フォント追加ロードは無し（GitHub と同じ方針）。

## 注意事項

- このモックは UX を確認するためのもので、本番品質のコードではありません
- データはメモリ内のみ（リロードでリセット）。デモ用途として `TODAY = "2026-06-12"` を仮の "今日" 扱い
- 認証は完全にモック。ログイン状態は state、ログアウトでログイン画面に戻るだけ
