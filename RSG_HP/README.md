# RSG_HP — 公式ホームページ（reverstargo.com）の保管用コピー

このフォルダは **公式ホームページ reverstargo.com のHTMLの控え** です。
ゲーム本体（play.reverstargo.com＝リポジトリのルート）とは別物です。

## 大事なこと

**ここを更新しても reverstargo.com は変わりません。**
reverstargo.com は GitHub ではなく **WADAX のレンタルサーバー**で動いています。
公開するには、ここのファイルをダウンロードして、WADAX の管理画面から
アップロードしてください。

- ここ（GitHub）＝ 編集と履歴の保管場所
- WADAX ＝ 実際に公開される場所（reverstargo.com）
- デスクトップの `RSG_HP` ＝ 手元の作業用コピー

2026-08-14 時点で、この3か所の中身は一致している。

## 中身

| ファイル | ページ |
|---|---|
| `index.html` | トップ |
| `features.html` | 機能紹介 |
| `guide.html` | 遊び方 |
| `en/index.html` | Home（英語） |
| `en/features.html` | Features（英語） |
| `en/guide.html` | Guide（英語） |

まだ入っていないページ: `rules.html` `ranks.html` `faq.html` `privacy.html`
と画像類（`logo.png` `bg.jpg` `favicon.png` `ogp.jpg` `icon/` `trophy/` `report/`）。
必要になったときに追加してください。

## 検索避けについて

各ファイルの `<head>` に `<meta name="robots" content="noindex, nofollow">` を
入れてあります。この控えが play.reverstargo.com/RSG_HP/ として配信されても、
検索結果で本家 reverstargo.com と食い合わないようにするためです。
**サーバーへ上げる前にこの1行を消してください。**

## 履歴

- 2026-08-14 v132: オンライン対戦・対局時計の紹介を追加して初回登録
  （このとき WADAX 側とデスクトップ側が完全一致していることを確認済み）
