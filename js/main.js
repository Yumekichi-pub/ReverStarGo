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
  navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
}

// ===== スタート =====
// セットアップ画面が表示されるのでゲームは startGame() から開始
loadSettings();
promotionExam = loadPromotionExam(); // 昇格試験の復元
updatePlayerNameDisplay();
updateRankDisplay();
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
