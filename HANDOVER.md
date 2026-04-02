# 引き継ぎメモ — transcript-extractor Chrome拡張機能

作成日：2026-04-02

---

## 【1. このチャットの目的】

- Microsoft TeamsとGoogle Driveの動画から、トランスクリプト（文字起こし）を全文テキストファイルとして取得できるChrome拡張機能を作る
- ゴール：`⌘+Shift+S`（Macの場合）を押すだけで、タイムスタンプ・話者名付きのテキストファイルをダウンロードできるようにする
- 出力フォーマット：`HH:MM:SS 話者名: テキスト`（例：`0:03 三宅 凌: だったりとかに対して...`）

---

## 【2. 新しいチャットに切り替える理由】

- 会話が長くなり、動作が重たくなってきた
- 次のチャットでは「Teamsの仮想リスト中間アイテムが取得できない」という残り1つの問題の解決に集中したい

---

## 【3. 背景・前提条件】

**環境**
- Mac使用
- Chrome拡張機能（Manifest V3、unpacked形式、パッケージ化なし）
- 作業フォルダ：`~/transcript-extractor/`
- Gitリポジトリ（ローカルgit管理のみ、リモートなし）

**技術的前提**
- Manifest V3
- `injected.js`：MAIN world、`all_frames: true`。`fetch`/`XHR`をモンキーパッチしてネットワークインターセプト
- `parser.js` + `content.js`：ISOLATED world、`all_frames: true`
- `background.js`：Service Worker、コマンド受信 → `chrome.tabs.sendMessage`
- `chrome.storage.local` でフレーム間データ共有
- `"permissions": ["storage"]`、`host_permissions`: `*.microsoft.com`, `*.sharepoint.com`, `drive.google.com`

**Teams特有の構造**
- Teamsのトランスクリプトパネルは **SharePointのxplatIframe**（`sharepoint.com`ドメイン）内に存在
- DOMセレクタ：
  - 話者：`span[class*="itemDisplayName"]`
  - タイムスタンプ：`span[id^="Header-timestamp-"]`
  - テキスト：`div[id^="sub-entry-"]`
- トランスクリプトリストは **仮想化（Virtualized List）** → 表示範囲外のアイテムはDOMに存在しない
- `aria-setsize="165"`（全165件）、`aria-posinset`で位置管理

**Google Drive**
- ネットワークインターセプトで取得（`timedtext`等のURL）
- フォーマット：`wireMagic: "pb3"` のJSON
- **完璧に動作済み**（ユーザー確認済み）

---

## 【4. ここまでの経緯】

### Phase 1：設計〜基本実装
- ブレインストーミング → 設計ドキュメント作成 → 実装計画 → Subagent-Driven Developmentで実装
- Google Drive（pb3形式）、Teams（VTT形式）の両方に対応した基本構成を実装

### Phase 2：Teams問題の発覚と試行錯誤

1. **最初の問題**：Teamsで「トランスクリプトが見つかりません」エラー
   - 原因：`host_permissions`にSharePointが含まれていなかった
   - 修正：`*.sharepoint.com`追加、`all_frames: true`追加

2. **次の問題**：ダウンロードできるがファイルが文字化け
   - 原因：TeamsのSharePoint CDNがVTTではなくプロプライエタリなバイナリを返す
   - 試したこと：
     - `response.text()` → バイナリ破損
     - `arrayBuffer()` + gzip検出/デコード（DecompressionStream）
     - `isformatjson=true`パラメータを除いてVTT URLを再フェッチ
     - どの形式でもバイナリが返り続け、修復不可能（43.8%がU+FFFD）

3. **方針転換：DOMスクレイピング**
   - ユーザーがTeamsトランスクリプトパネルのDOM構造を提供
   - `TreeWalker`ベースのDOMスクレイパーを実装
   - **成果：先頭部分は取得成功**

4. **仮想化問題の発覚**
   - 165件中、先頭と末尾しか取得できない（中間が欠落）
   - `aria-setsize="165"`、仮想リストであることが確定

### Phase 3：自動スクロール実装（現在進行中）

| 実装 | 問題 |
|---|---|
| `scrollTop = scrollHeight`（一気に最下部） | 仮想リストが中間をレンダリングしない |
| `aria-posinset`チェックでbreak | 末尾アイテムが最初からDOMに存在すると即breakしてしまう |
| `scrollTop += pageSize`（1ページずつ）+ 物理的最下部チェック | スクロール終了前にダウンロードが発生（旧dom形式データを即使用するバグ）、多重スクロール（リスナー重複） |
| 上記 + _scrapingガード + dom形式無視 | ダウンロードタイミングは修正されたが、中間アイテムの欠落は継続 |

**現在の最新コミット：`fe7638b`**

---

## 【5. 決定事項】

- ネットワークインターセプトによるTeamsトランスクリプト取得は**断念**（プロプライエタリバイナリのため修復不可能）
- Teams用はDOMスクレイピング一本に絞る
- Google Driveはネットワークインターセプト（pb3形式）で完動
- 拡張機能はunpackedで使用（パッケージ化不要）
- 出力フォーマット：`timestamp 話者名: テキスト` の1行ずつ改行

---

## 【6. 未解決事項】

### メインバグ：仮想リストの中間アイテムが取得できない

**症状：** `0:03`から一気に`24:07`へジャンプ（約24分分が欠落）

**現在の実装の問題点（未特定）：**

- **候補1**：スクロールコンテナの特定が間違っている
  `firstEntry.parentElement`から上に辿って`overflowY: scroll/auto`な要素を探しているが、Teams/SharePointのCSSが`overflow`ショートハンドを使っていたり、別の単位での指定だと見つからない可能性がある

- **候補2**：スクロール対象は正しいが、仮想リストの実装がscrollTopの直接変更に反応しない
  `scrollTop`を直接変更しても仮想リストのレンダリングが発火しない実装もある

- **候補3**：`pageSize = scroller.clientHeight`が0または極小
  トランスクリプトパネルが描画されていない、またはpanelのclientHeightが正しく取れていない

**次にすべきデバッグ：**
コンソールログで以下を確認する必要がある：
1. `scroller`が正しく見つかっているか（`null`になっていないか）
2. `scroller.clientHeight`の実際の値
3. スクロール中に`scroller.scrollTop`が変化しているか
4. スクロール完了後に`document.querySelectorAll('[id^="sub-entry-"]').length`が増えているか

---

## 【7. 次のチャットで最初に依頼すべき内容】

以下をそのままコピーして貼り付ける：

```
~/transcript-extractor/ のChrome拡張機能のデバッグを続けます。

Teamsのトランスクリプトパネル（SharePoint xplatIframe内）で、仮想リストの全アイテム（165件）を自動スクロールで取得しようとしていますが、中間アイテムが欠落します。

現在のスクロール実装（content.js の scrapeTeamsTranscript 関数）：
- firstEntry.parentElement から上に辿ってoverflowY: scroll/autoなコンテナを探す
- scroller.scrollTop += scroller.clientHeight || 300 を200ms間隔で繰り返す
- scrollTopが変化しなくなったら終了

問題：スクロールは終わってからダウンロードが始まるようになったが、中間アイテムが依然欠落（0:03 → 24:07 にジャンプ）

まずデバッグ用にcontent.jsのスクロール処理にconsole.logを追加して、以下を確認したいです：
1. scraper が正しく見つかっているか（nullでないか）
2. scroller.clientHeight の値
3. scrollTop の変化（スクロール中に動いているか）
4. スクロール完了後の sub-entry-* アイテム数の変化

デバッグ用ログ追加と、その確認結果に基づく修正をお願いします。
引き継ぎメモは ~/transcript-extractor/HANDOVER.md にあります。
```

---

## 【8. 各ファイルの現在の状態】

### manifest.json
```json
{
  "manifest_version": 3,
  "name": "Transcript Extractor",
  "version": "1.0.0",
  "description": "Extract transcripts from Microsoft Teams recordings and Google Drive videos",
  "permissions": ["storage"],
  "host_permissions": [
    "*://*.microsoft.com/*",
    "*://*.sharepoint.com/*",
    "*://drive.google.com/*"
  ],
  "background": { "service_worker": "background.js" },
  "content_scripts": [
    {
      "matches": ["*://*.microsoft.com/*","*://*.sharepoint.com/*","*://drive.google.com/*"],
      "js": ["injected.js"],
      "run_at": "document_start",
      "world": "MAIN",
      "all_frames": true
    },
    {
      "matches": ["*://*.microsoft.com/*","*://*.sharepoint.com/*","*://drive.google.com/*"],
      "js": ["parser.js", "content.js"],
      "run_at": "document_start",
      "world": "ISOLATED",
      "all_frames": true
    }
  ],
  "commands": {
    "extract-transcript": {
      "suggested_key": { "default": "Ctrl+Shift+S", "mac": "Command+Shift+S" },
      "description": "Extract and download transcript"
    }
  }
}
```

### background.js
```javascript
chrome.commands.onCommand.addListener(async function(command) {
  if (command !== 'extract-transcript') return;
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, {action: 'download'}).catch(() => {});
});
```

### content.js（現在の実装・問題箇所あり）

主要ロジック概要：
- `scrapeTeamsTranscript()`：非同期、スクロール→スクレイプ
  - `scroller._scraping`フラグで多重実行防止
  - `scrollTop += clientHeight || 300`を200ms間隔、物理底到達で終了
  - TreeWalkerで`itemDisplayName`/`Header-timestamp-*`/`sub-entry-*`を収集
- iframeの場合：`download`受信 → スクレイプ → `{format:'dom', content:...}`をstorageに書き込み
- トップフレームの場合：
  - format='pb3'/'vtt'のデータがあれば即使用（Google Drive）
  - なければstorageをクリアし500ms間隔でポーリング（Teams）
  - タイムアウト120秒

---

*このメモは `~/transcript-extractor/HANDOVER.md` に保存されています。*
