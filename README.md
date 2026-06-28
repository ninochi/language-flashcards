# Language Flashcards

台湾語と中国語の単語を学習する、GitHub Pages上のフラッシュカードアプリです。

- 公開URL: https://ninochi.github.io/language-flashcards/
- 収録デッキ: 台湾語、中国語 第1課〜第8課
- 合計カード数: 643
- 表面: 日本語
- 裏面: 台湾語ローマ字、または中国語＋拼音
- 復習方式: 常時自動。回答結果に応じて短期再出題または1・3・7・14・30・60日後に再出題

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
├── app.js                     # 学習・自動復習ロジックとJSON読込
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
language-flashcards:<storageKey>:v1
```

例:

```text
language-flashcards:taigi:v1
language-flashcards:chinese-1:v1
```

以前のHTML埋め込み版で作られた進捗も引き継ぎます。旧形式の `wrongCount` と `dueAt` は読み込み時に変換されます。旧版の忘却曲線オン・オフ設定は廃止され、すべてのデッキで自動復習が常時有効になります。

旧版で復習日が設定されていなかった習得済みカードには、移行した日を基準として次回復習日を設定します。カードIDと `storageKey` は変わらないため、既存の習得状態や誤答回数は新しい3段階回答の履歴へ引き継がれます。

## 学習設計

学習設計の正本は `docs/learning-design.md` です。このアプリは、JSONに格納された既知の単語集合を、ノルマとして区切るのではなく、忘れかけ・迷い・未出題の状態に応じて自然に回すことを目指します。

回答は、答えを見る前の感覚で次の3段階から選びます。

- `分からなかった`: 答えを見るまで出なかった。数枚後に再出題します。
- `迷った`: 一部出た、時間がかかった、声調・拼音・綴りなどに不安がある。短めの間隔で復習します。
- `すぐ分かった`: 答えを見る前にすぐ確実に思い出せた。通常の復習間隔を進めます。

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

- 新しいカードには「新しいカード」と表示
- 復習日を迎えたカードには「復習カード」と再出題理由を表示
- 復習予定前にもう一周するカードには「練習カード」と表示
- 「分からなかった」を選んだカードは数枚後に再出題
- 「迷った」を選んだカードは短めの間隔で自動復習
- 「すぐ分かった」を選ぶと、1・3・7・14・30・60日の間隔で自動復習
- 出題順は、復習期限切れ、迷いカード、未出題、長く見ていないカードを優先して自動で並べる
- 次のカードへ移動するときは回転を即時リセットし、次の解答が一瞬見えないようにする
- キューを一通り終えた場合は次回復習日と「もう一周する」を表示
- 全カードを一度見た、または全カードを一度以上「すぐ分かった」にした場合は、マイルストーンとしてconfettiを表示
- データ読込エラー画面は、通信障害やJSON破損時だけ表示
- 最後に開いた教材を記憶
- 学習履歴は教材ごとに分離
- ダークモード対応

## 画面上の操作

- `出題順をシャッフル`: 優先度付きで出題順を作り直す
- `分からなかった`: 思い出せなかったカードとして記録し、数枚後に再出題する
- `迷った`: 迷いカードとして記録し、短めの次回復習日を設定する
- `すぐ分かった`: 確実に思い出せたカードとして記録し、通常の次回復習日を設定する
- `もう一周する`: 復習予定前のカードも含めて優先度付きで再度出題する
- `学習記録をリセット`: 単語データを残したまま、その教材の回答結果・迷いカード・復習予定を初期化する

## エージェント向け注意

- 変更前に `README.md` と `data/manifest.json` を読む
- 正本JSON以外を単語データの編集元にしない
- IDと `storageKey` の互換性を維持する
- 変更後に `python3 scripts/validate_data.py` を必ず実行する
- UI変更時は `index.html` 内のIDと `app.js` の参照先が一致していることを確認する
- `taigi-rendering.js` を変更した場合は、台湾語の `ha̍k-hāu`、`joa̍h`、`se̍k-sāi` などで表示を確認する
- 生成物だけを直して正本を直さない、という変更は禁止
