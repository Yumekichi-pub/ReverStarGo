/* ============================================================
   navigation.js — ページ切替
   showPage(name) で各画面（main / game / settings / daily /
   account / rules / rank / kifu 等）を一括切替。
   依存：DOM、renderCalendar / renderTrophyList / renderKifuList
          / updateBattleRecordDisplay 等の描画関数。
   ============================================================ */

// ===== ページナビゲーション =====
/**
 * 画面（ページ）の切り替えを行う。各ページの表示/非表示を一括管理。
 * @param {string} page - 切り替え先ページ名（'main', 'game', 'settings', 'daily', 'account', 'rules', 'rank' など）
 */
function showPage(page) {
  // ランクアップマッチ中でも画面移動は自由（進捗は localStorage に保持される）
  // 対戦中の離脱のみ 1 敗扱い（REVERSE_MATCH_PENDING_KEY で管理）
  document.getElementById('setup-main').style.display = 'none';
  document.getElementById('setup-game').style.display = 'none';
  document.getElementById('setup-custom').style.display = 'none';
  document.getElementById('setup-account').style.display = 'none';
  document.getElementById('setup-daily').style.display = 'none';
  document.getElementById('setup-trophies').style.display = 'none';
  document.getElementById('setup-rules').style.display = 'none';
  document.getElementById('setup-kifu').style.display = 'none';
  if (page === 'main') {
    document.getElementById('setup-main').style.display = 'flex';
    updatePlayerNameDisplay();
    updateRankDisplay();
  } else if (page === 'game-setup') {
    document.getElementById('setup-game').style.display = 'flex';
    updateLevelButtons();
    const titleEl = document.getElementById('game-setup-title');
    // v57.1〜: tutorial-btn は v38 で削除済み。getElementById は null を返すため
    // 「.style」アクセスで TypeError が発生していた。これが showPage 全体の
    // 処理中断を引き起こし、updatePromotionSection が呼ばれず ランクアップマッチ
    // セクションが非表示になっていた真犯人。null チェックを追加。
    const tutBtn = document.getElementById('tutorial-btn');
    const backBtn = document.getElementById('game-setup-back');
    const battleSection = document.getElementById('battle-mode-section');
    const promoSection = document.getElementById('promotion-section');
    if (isDailySetup && dailyChallengeDate) {
      const parts = dailyChallengeDate.split('-');
      const m = parseInt(parts[1]);
      const d = parseInt(parts[2]);
      titleEl.textContent = '📅 デイリー - ' + m + '月' + d + '日';
      if (tutBtn) tutBtn.style.display = 'none';
      battleSection.style.display = 'none';
      promoSection.style.display = 'none';
      backBtn.textContent = 'デイリーへ戻る';
      backBtn.onclick = function() { isDailySetup = false; showPage('daily'); };
    } else {
      titleEl.textContent = '🎮 ゲーム設定';
      if (tutBtn) tutBtn.style.display = '';
      battleSection.style.display = '';
      backBtn.textContent = 'メインへ戻る';
      backBtn.onclick = function() { showPage('main'); };
      // 昇格試験の表示
      updatePromotionSection();
    }
  } else if (page === 'custom') {
    document.getElementById('setup-custom').style.display = 'flex';
  } else if (page === 'account') {
    document.getElementById('player-name-input').value = playerName;
    updateAccountRankDisplay();
    updateBattleRecordDisplay();
    document.getElementById('setup-account').style.display = 'flex';
  } else if (page === 'daily') {
    document.getElementById('setup-daily').style.display = 'flex';
    renderCalendar();
    renderTrophies();
  } else if (page === 'trophies') {
    document.getElementById('setup-trophies').style.display = 'flex';
    renderTrophyList();
  } else if (page === 'rules') {
    document.getElementById('setup-rules').style.display = 'flex';
  } else if (page === 'kifu') {
    document.getElementById('setup-kifu').style.display = 'flex';
    renderKifuList();
  }
}
