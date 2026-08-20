/* ============================================================
   main.js — エントリポイント（Service Worker + スタート処理）
   - PWA Service Worker の登録
   - ページロード時の初期化（loadSettings, ランク表示更新等）
   - スマホ戻るボタン検知（popstate）
   - プレイヤー名入力の即時保存 + 開発者モード起動キー
   依存：他すべてのモジュール（最後に読み込み）。
   ============================================================ */

// ===== Service Worker登録 =====
if ('serviceWorker' in navigator) {
  // Premium-v119: 公開版のルートSW(/sw.js)を登録していたため、プレミアム版の
  // ファイルまで公開版のキャッシュ管理下に入り、更新しても古い版が返り続けて
  // いた（スマホPWAで顕著）。プレミアム専用SWに切り替え、古い登録は解除する。
  (async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      // プレミアム配下以外（＝公開版のSW）の登録を解除
      for (const r of regs) {
        const url = (r.active && r.active.scriptURL) || (r.installing && r.installing.scriptURL) || r.scope || '';
        if (url.indexOf('/premium-monitor_ver/') === -1) await r.unregister();
      }
      // 公開版SWが溜め込んだキャッシュも掃除（プレミアムのファイルが混在しているため）
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k.indexOf('reverstargo-') === 0).map(k => caches.delete(k)));
      }
    } catch (e) { /* 解除に失敗しても登録は進める */ }
    try {
      await navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' });
    } catch (e) {}
  })();
}

// ===== スタート =====
// Premium-v54: 戦績データの署名移行（初回のみ。既存ランク維持 + 改ざん検知を有効化）
if (typeof _rsgInit === 'function') _rsgInit();
// Premium-v145.3: 修行コースの 19.4/19.9/25.4/25.9 を昇格試験に切り替えたので、
//   旧条件（ふつうの対局の勝ち数）で既に上がっていた人のランクを引き継ぐ。初回のみ。
if (typeof _migrateTrainingExams === 'function') _migrateTrainingExams();
// Premium-v128: 対局時計の設定を復元
if (typeof loadClockSetting === 'function') loadClockSetting();
// Premium-v120: 中断した対局が保存されていれば「前回の対局に再接続」を出す
if (typeof olUpdateResumeButton === 'function') olUpdateResumeButton();
// セットアップ画面が表示されるのでゲームは startGame() から開始
loadSettings();
promotionExam = loadPromotionExam(); // 昇格試験の復元
updatePlayerNameDisplay();
updateRankDisplay();
updateDailyTileDate();
updateLevelButtons();
// ロック状態の確定後にゲーム設定を復元（v40〜）
loadGameSettings();
// ランクアップマッチ中ならゲーム設定画面に自動復帰
if (promotionExam) {
  showPage('game-setup');
}

// スマホ戻るボタン・スワイプバック検知（v44〜）
// Reverse Match 中は確認ダイアログを表示
window.addEventListener('popstate', function(event) {
  // リバースマッチ中 かつ 結果モーダル非表示 なら警告
  // （結果モーダル表示中 = 試合終了済みなので警告不要）
  const resultModalShown = document.getElementById('result-modal').style.display === 'flex';
  if (reverseMatch && !resultModalShown) {
    // 戻るをキャンセルするため履歴を積み直す
    try { history.pushState({reverseMatchActive: true}, '', location.href); } catch(e) {}
    // 確認ダイアログを表示（リバースマッチ用メッセージ）
    const quitMsg = document.querySelector('.quit-confirm-inner p');
    if (quitMsg) {
      quitMsg.innerHTML = '⚠ リバースマッチを中断しますか？<br><strong>1敗</strong>として記録されます。';
    }
    document.getElementById('quit-confirm').style.display = 'flex';
  }
});

// アカウントページでプレイヤー名変更時に即時保存
document.getElementById('player-name-input').addEventListener('input', function() {
  playerName = this.value.trim().slice(0, 7);
  saveSettings();
  // 開発者モード起動
  if (this.value === 'devstarG') {
    activateDevMode();
    this.value = '';
    playerName = '';
    saveSettings();
    updatePlayerNameDisplay();
  }
});

// ===== v100: 対局中のリロード/離脱前に確認ダイアログを表示 =====
// スマホの「下に引いて更新」誤操作や誤ってタブを閉じた際の、
// 対局が負け扱いになる事故の保険（CSS overscroll-behavior が
// 効かないブラウザ向けの二重対策）。
// 条件: ゲーム進行中 + 対局画面が表示中 + 結果モーダル非表示 + チュートリアル以外
window.addEventListener('beforeunload', function (e) {
  try {
    if (typeof gameStarted === 'undefined' || !gameStarted) return;
    if (typeof isTutorial !== 'undefined' && isTutorial) return;
    if (typeof tutorialMiniGame !== 'undefined' && tutorialMiniGame) return;
    const rm = document.getElementById('result-modal');
    if (rm && rm.style.display === 'flex') return; // 終局結果の表示中は自由に離脱OK
    // いずれかのメニュー画面が表示中なら対局画面にいない → 確認不要
    const pages = document.querySelectorAll('.setup-page');
    for (const p of pages) {
      if (getComputedStyle(p).display !== 'none') return;
    }
    e.preventDefault();
    e.returnValue = ''; // ブラウザ標準の「離れますか?」ダイアログを表示
  } catch (err) {}
});
