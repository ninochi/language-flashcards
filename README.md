# Language Flashcards

台湾語と中国語の単語を学習する、GitHub Pages上のフラッシュカードアプリです。

- 公開URL: https://ninochi.github.io/language-flashcards/
- 収録デッキ: 台湾語、中国語 第1課〜第8課
- 合計カード数: 643
- 表面: 日本語
- 裏面: 台湾語ローマ字、または中国語＋拼音
- 学習方式: `分からなかった` カードをマークし、分からなかったものだけを回してゼロに近づける
- クイズ方式: 既存カードから20問の4択クイズをランダム生成し、前回間違えた問題を記憶

## 重要: 正本は `data/` 以下のJSON

単語データの **Single Source of Truth（正本）** は `data/decks/*.json` です。

- 単語の追加・修正は `data/decks/*.json` を編集する
- デッキの追加・並び順・表示名は `data/manifest.json` を編集する
- `index.html` や `app.js` に単語を直接埋め込まない
- `exports/` は自動生成物なので直接編集しない

このルールにより、GitHub上の直接編集、別のChatGPTセッション、Codex、Claude Codeなど、どのエージェントからでも共通のデータを安全に更新できます。

## リポジトリ構成

```text
language-flashcards/
├── index.html                  # 画面のHTML
├── styles.css                 # 見た目
├── app.js                     # 学習状態、クイズ、JSON読込
├── taigi-rendering.js         # 台湾語の結合文字・言語属性の表示補助
├── data/
│   ├── manifest.json          # デッキ一覧、表示順、互換用storageKey
│   ├── schema.json            # JSON Schema
│   └── decks/                 # 正本の単語データ
│       ├── taigi.json
│       ├── chinese-lesson-01.json
│       └── ... chinese-lesson-08.json
├── scripts/
│   ├── validate_data.py       # データ検証
│   └── build_exports.py       # JSON/YAML/ZIP生成
├── exports/
│   └── language-flashcards-data.zip
└── .github/workflows/
    ├── validate-data.yml      # PR/Push時の検証
    ├── deploy-pages.yml       # 検証後にGitHub Pagesへ公開
    └── build-exports.yml      # JSONからYAMLとZIPを再生成
```

## データ形式

各デッキは次の形式です。

```json
{
  "id": "chinese-lesson-08",
  "language": "zh-CN",
  "title": "中国語 第8課",
  "frontLanguage": "ja",
  "backLanguage": "zh-CN",
  "cardCount": 66,
  "cards": [
    {
      "id": "c8-001",
      "front": "支払う、渡す",
      "back": "付",
      "reading": "fù",
      "lesson": 8,
      "page": null,
      "tags": [],
      "notes": null
    }
  ]
}
```

### フィールド

- `id`: 永続的なデッキID・カードID。既存IDは変更しない
- `front`: 表面の日本語
- `back`: 裏面の台湾語ローマ字または中国語
- `reading`: 中国語の拼音。台湾語は `null`
- `lesson`: 課番号。台湾語は `null`
- `page`: 教科書ページ。現行データは未保持のため多くが `null`
- `tags`: 分類タグ
- `notes`: 補足

## 学習履歴と互換性

学習履歴はブラウザの `localStorage` に保存されます。端末間では自動同期されません。

- カードIDを変更・再利用しない
- `data/manifest.json` の `storageKey` を変更しない
- 既存カードを修正する場合は、原則として同じIDを維持する

保存キーは次の形式です。

```text
language-flashcards:<storageKey>:v3
```

例:

```text
language-flashcards:taigi:v3
language-flashcards:chinese-1:v3
```

`v3` では、旧SRS形式とは分離して新しい学習履歴を保存します。保存する主な情報は、デッキごとの `unknownIds`、`seenIds`、`quizWrongIds` です。

## 学習設計

学習設計の正本は `docs/learning-design.md` です。このアプリは、JSONに格納された既知の単語集合を、分からなかったものをマークして減らしていくことで覚えることを目指します。

カード学習の回答は、答えを見る前の感覚で次の2段階から選びます。

- `分からなかった`: 答えを見るまで出なかった。デッキごとの分からなかったリストに入れます。
- `分かった`: 答えを見る前に思い出せた。分からなかったリストから外します。

`分からなかっただけ` モードでは、分からなかったリストのカードだけを出します。`分かった` を選ぶたびにリストから消えるため、残りがだんだん減ります。

`クイズ` モードでは、該当デッキから20問をランダムに選び、既存カードの裏面から4択を自動生成します。選択肢の順番は毎回ランダムです。間違えた問題は `前回間違えた問題` として記憶します。

## 台湾語ローマ字の表示

台湾語には `a` と結合記号 `◌̍` のように、複数のUnicode文字を重ねて表示する綴りがあります。端末標準フォントによっては記号がずれて表示されるため、次の対策を行っています。

- 台湾語の裏面に `nan-Latn` の言語属性を設定
- 表示前にUnicodeをNFCで正規化
- 台湾語の裏面だけ、Charis SIL、Noto、DejaVu、Times New Romanなど結合記号に対応しやすいフォントを優先
- 台湾語の文字は過度な太字を避けて表示

この処理は `taigi-rendering.js` と `styles.css` にあります。単語データ内の声調記号を別の記号へ置換しないでください。

## 編集手順

1. 対象の `data/decks/*.json` を編集
2. `cardCount` を実際のカード数に合わせる
3. デッキ数やカード数が変わる場合は `data/manifest.json` も更新
4. 検証を実行

```bash
python3 scripts/validate_data.py
```

5. 必要ならエクスポートを再生成

```bash
python3 scripts/build_exports.py
```

6. Commit / Pull Requestを作成

`main` へのPush後、GitHub Actionsが検証、Pages公開、ZIP再生成を行います。

## 新しい中国語課を追加する

1. `data/decks/chinese-lesson-09.json` を追加
2. カードIDを `c9-001` のように一意にする
3. `data/manifest.json` にデッキ情報を追加
4. `manifest.totalCardCount` を更新
5. `python3 scripts/validate_data.py` を実行

`storageKey` は一度公開したら変更しません。新しい第9課なら `chinese-9` を使用します。

## 自動生成物

次は直接編集しません。

- `exports/language-flashcards-data/`
- `exports/language-flashcards-data.zip`

これらは `python3 scripts/build_exports.py` またはGitHub Actionsによって正本JSONから生成されます。

## アプリの動作

- `カード`: 全カードを出題し、分からなかったカードをマークする
- `分からなかっただけ`: 分からなかったカードだけを出題し、分かったらリストから外す
- `クイズ`: 該当デッキから20問をランダムに選び、既存カードから4択を自動生成する
- `前回間違えた問題`: クイズで間違えたカードに表示する
- クイズ中のステータスは現在の20問セッションの `正解数` と `間違えた数` を表示する
- クイズ20問を終えたら結果画面を表示する。全問正解ならconfetti、1問でも間違えたら残念表示にする
- 次のカードへ移動するときは回転を即時リセットし、次の解答が一瞬見えないようにする
- キューを一通り終えた場合は「もう一周する」を表示
- `分からなかった` がゼロになった回答時だけconfettiを表示
- データ読込エラー画面は、通信障害やJSON破損時だけ表示
- 最後に開いた教材を記憶
- 学習履歴は教材ごとに分離
- ダークモード対応

## 画面上の操作

- `出題順をシャッフル`: 優先度付きで出題順を作り直す
- `分からなかった`: 分からなかったカードとして記録する
- `分かった`: 分からなかったリストから外す
- `分からなかっただけ`: 分からなかったカードだけで回す
- `クイズ`: ランダム20問の4択クイズを開始する
- `もう一周する`: 現在のモードでもう一度出題する
- `学習記録をリセット`: どのタイミングでも利用できる。単語データを残したまま、その教材の分からなかったカードとクイズ履歴を初期化する

## エージェント向け注意

- 変更前に `README.md` と `data/manifest.json` を読む
- 正本JSON以外を単語データの編集元にしない
- IDと `storageKey` の互換性を維持する
- 変更後に `python3 scripts/validate_data.py` を必ず実行する
- UI変更時は `index.html` 内のIDと `app.js` の参照先が一致していることを確認する
- `taigi-rendering.js` を変更した場合は、台湾語の `ha̍k-hāu`、`joa̍h`、`se̍k-sāi` などで表示を確認する
- 生成物だけを直して正本を直さない、という変更は禁止
