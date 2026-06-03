/* ============================================================
   main.js — エントリポイント（Service Worker + スタート処理）
   - PWA Service Worker の登録
   - ページロード時の初期化（loadSettings, ランク表示更新等）
   - スマホ戻るボタン検知（popstate）
   - プレイヤー名入力の即時保存
   - v82: メンテナンスモード起動を URL パラメータ ?m=... に変更
   依存：他すべてのモジュール（最後に読み込み）。
   ============================================================ */

// ===== Service Worker登録 =====
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/en/sw.js', { updateViaCache: 'none' });
}

// ===== スタート =====
// v81: 戦績データの署名移行（初回のみ。既存テスターのランク維持 + 以降の改ざん検知を有効化）
if (typeof _rsgInit === 'function') _rsgInit();
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
  const resultModalShown = document.getElementById('result-modal').style.display === 'flex';
  if (reverseMatch && !resultModalShown) {
    try { history.pushState({reverseMatchActive: true}, '', location.href); } catch(e) {}
    const quitMsg = document.querySelector('.quit-confirm-inner p');
    if (quitMsg) {
      quitMsg.innerHTML = '⚠ Quit Reverse Match?<br>This will be counted as a <strong>loss</strong>.';
    }
    document.getElementById('quit-confirm').style.display = 'flex';
  }
});

// アカウントページでプレイヤー名変更時に即時保存
document.getElementById('player-name-input').addEventListener('input', function() {
  playerName = this.value.trim().slice(0, 7);
  saveSettings();
});

// v82: メンテナンスモード起動を URL パラメータに変更（IIFE で許可フラグを隠蔽）
// 旧トリガー（プレイヤー名入力欄に特定文字列）は廃止。
// 起動方法: URL に ?m=51yumekichi または ?m=yumekichi51 を付けてアクセス
// （アクセス後に履歴から消える → ブックマーク管理推奨）
(function() {
  let _allowed = false;
  // _xmActivate を gate（許可フラグまたは既に起動済みでなければ何もしない）
  const _orig = window._xmActivate;
  if (_orig) {
    window._xmActivate = function() {
      // 未許可 かつ 未起動 なら何もしない（コンソールから直接呼ばれても起動しない）
      if (!_allowed && (typeof _xmOn === 'undefined' || !_xmOn)) return;
      _orig.apply(this, arguments);
    };
  }
  // URL パラメータチェック
  try {
    const p = new URLSearchParams(location.search);
    const m = p.get('m');
    if (m === '51yumekichi' || m === 'yumekichi51') {
      try { history.replaceState({}, '', location.pathname); } catch(e) {}
      _allowed = true;
      window.addEventListener('load', () => {
        if (window._xmActivate) window._xmActivate();
      }, { once: true });
    }
  } catch(e) {}
})();
