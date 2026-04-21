# Transcript Extractor

Microsoft Teams の録画ページや Google Drive の動画ページからトランスクリプトを取得し、テキストファイルとしてダウンロードする Chrome 拡張機能です。

## 主な機能

- Microsoft Teams / SharePoint 上の録画トランスクリプトを取得
- Google Drive 動画の字幕データを取得
- VTT / Google caption pb3 / Teams のDOM表示トランスクリプトをテキスト化
- `Cmd+Shift+S` または `Ctrl+Shift+S` で現在のタブからダウンロード
- タブごとに取得データを分離し、別タブのトランスクリプト混入を防止

## インストール

1. Chrome で `chrome://extensions` を開く
2. 右上の「デベロッパー モード」を有効にする
3. 「パッケージ化されていない拡張機能を読み込む」を押す
4. このリポジトリのディレクトリを選択する

コードを変更した後は、`chrome://extensions` でこの拡張機能を再読み込みしてください。

## 使い方

1. Teams の録画ページ、SharePoint の録画ページ、または Google Drive の動画ページを開く
2. 必要に応じてトランスクリプト/字幕パネルを表示する
3. `Cmd+Shift+S` または `Ctrl+Shift+S` を押す
4. `transcript_YYYY-MM-DD_HH-MM-SS.txt` がダウンロードされる

Teams のDOMスクレイピングでは、仮想スクロールされたトランスクリプト一覧を順に読み込みながら収集します。長い会議では完了まで時間がかかることがあります。

## 開発

依存関係のインストール:

```sh
npm install
```

テスト実行:

```sh
npm test
```

構成:

- `manifest.json`: Chrome 拡張機能の定義
- `background.js`: ショートカット、タブ単位の一時保存、メッセージ処理
- `injected.js`: ページ側の `fetch` / XHR を監視して字幕データを検出
- `content.js`: 取得データの保存依頼、DOMスクレイピング、ダウンロード処理
- `parser.js`: VTT / Google caption pb3 のパースと整形
- `session.js`: ダウンロード実行単位の `requestId` 管理
- `test/`: Jest テスト

## 権限

この拡張機能は、対象ページで字幕・トランスクリプト関連の通信やDOMを読み取るため、以下のホスト権限を使います。

- `*://*.microsoft.com/*`
- `*://*.sharepoint.com/*`
- `*://drive.google.com/*`

取得したトランスクリプトデータはタブ単位で `chrome.storage.local` に一時保存され、ダウンロード後またはタブ終了時に削除されます。外部サーバーへの送信処理はありません。

## 注意点

- Teams 側のUI変更により、DOMスクレイピングが動かなくなる可能性があります。
- スクレイピング中に対象タブを長時間バックグラウンドにすると、Chrome のタイマー制御により処理が遅くなることがあります。
- 現時点では、スクレイプ開始時のスクロール位置によって上部の項目を取りこぼす可能性があります。
