/* ============================================================
   promotion_ui.js — 昇格試験 UI + 雑多なイベント登録
   昇格試験セクションの表示更新（progress, 状態表示）と、
   help/rules モーダル・undo ボタン等の addEventListener。
   依存：records.js（getAvailablePromotion 等）、
          undo.js（undoMove）、settings.js。
   ============================================================ */

// ===== 昇格試験 UI =====
function updatePromotionSection() {
  const section = document.getElementById('promotion-section');
  const promo = getAvailablePromotion();
  const exam = loadPromotionExam();

  if (!promo) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';
  const targetRank = RANKS[promo.targetRank];
  const matchLabel = getMatchLabel(promo.winsNeeded, promo.level);
  document.getElementById('promotion-title').innerHTML = `⚔ ランクアップマッチ → ${rankIcon(promo.targetRank, 22)} ${targetRank.name}`;

  let descText = `${matchLabel}で勝ち越しで昇格`;
  if (promo.careerWins > 0) {
    descText += `\nまたは通算${promo.careerWins}勝で昇格`;
  }
  document.getElementById('promotion-desc').textContent = descText;

  const progressEl = document.getElementById('promotion-progress');
  const career = getPromotionCareer(promo.targetRank);
  let progressText = '';

  if (exam && exam.targetRank === promo.targetRank) {
    const remainingWins = promo.winsNeeded - exam.wins;
    progressText = `今回: ${exam.wins}勝${exam.losses}敗（あと${remainingWins}勝で昇格）`;
  }
  // 通算成績は 10 勝超えてから表示（心理的ハードル配慮）
  if (career.wins > 10 && promo.careerWins > 0) {
    const remaining = promo.careerWins - career.wins;
    progressText += (progressText ? '\n' : '') + `通算: ${career.wins}勝${career.losses}敗（あと${remaining}勝で昇格）`;
    // イベント台帳への通知（通算 10 勝超表示切替）
    try { window.__RSG_EVENT__ && window.__RSG_EVENT__('PRO_012'); } catch(e) {}
  }

  if (progressText) {
    progressEl.style.display = '';
    progressEl.textContent = progressText;
  } else {
    progressEl.style.display = 'none';
  }
}

function getMatchLabel(winsNeeded, level) {
  let base;
  if (winsNeeded === 2) base = '3番勝負';
  else if (winsNeeded === 3) base = '5番勝負';
  else if (winsNeeded === 4) base = '7番勝負';
  else if (winsNeeded === 6) base = '11番勝負';
  else if (winsNeeded === 8) base = '15番勝負';
  else if (winsNeeded === 11) base = '21番勝負';
  else base = `${winsNeeded * 2 - 1}番勝負`;
  // Lv.5 以上の昇格試験は RM プレフィックスを付ける
  return (level !== undefined && level >= 5) ? 'RM ' + base : base;
}

function updatePromotionGameStatus() {
  const statusEl = document.getElementById('promotion-game-status');
  if (!promotionExam) {
    statusEl.style.display = 'none';
    return;
  }
  const targetRank = RANKS[promotionExam.targetRank];
  const matchNum = promotionExam.wins + promotionExam.losses + 1;
  const matchLabel = getMatchLabel(promotionExam.winsNeeded, promotionExam.level);
  statusEl.style.display = '';
  const colorMark = humanColor === 'black' ? '●黒' : '○白';
  statusEl.innerHTML = `⚔ ランクアップマッチ ${rankIcon(promotionExam.targetRank, 18)}${targetRank.name}（${matchLabel}）<br>第${matchNum}試合 ${colorMark}（${promotionExam.wins}勝${promotionExam.losses}敗）`;
}

document.getElementById('play-again-btn').addEventListener('click', () => {
  document.getElementById('result-modal').style.display = 'none';
  if (tutorialMiniGame) {
    tutorialMiniGame = false;
    // notation復元
    if (savedNotationMode !== null) { notationMode = savedNotationMode; savedNotationMode = null; }
    document.getElementById('play-again-btn').textContent = 'もう1局';
    document.getElementById('setup-main').style.display = 'flex';
    updateRankDisplay();
    updateLevelButtons();
  } else {
    // Premium-v109: オンライン対戦の「もう1局」は両者合意で色交代して再戦
    if (typeof olHandlePlayAgain === 'function' && olHandlePlayAgain()) return;
    // Premium-v105: 2人対戦リバースマッチ 1局目終了後 →「2局目へ ▶」で続行
    // （名前は endGame で入れ替え済み。2局目終了後は tpRm=null なのでここには来ない）
    if (typeof tpRm !== 'undefined' && tpRm && tpRm.round === 2 && tpRm.r1) {
      initGame();
      return;
    }
    // Premium-v105: 2人対戦の「もう1局」→ 次のマッチ準備（RM選択中なら新しいRMを開始）
    if (battleMode === 'two' && typeof tpPrepareMatch === 'function') tpPrepareMatch();
    // Reverse Match 1局目終了後：そのまま 2局目へ進む（色反転は endGame で済）
    if (reverseMatch && reverseMatch.round === 2) {
      initGame();
      return;
    }
    // ランクアップマッチ中は白黒を交互にする（v41〜）
    // Lv.5 以上は Reverse Match（セット内で色交代）で自動的にパターンが維持されるため、ここでは Lv.4 以下のみ実行
    if (promotionExam && !reverseMatch && promotionExam.level < 5) {
      humanColor = opp(humanColor);
      cpuColor = opp(humanColor);
      // 設定画面の選択状態も更新
      document.querySelectorAll('[data-color]').forEach(b => b.classList.remove('selected'));
      const colorBtn = document.querySelector(`[data-color="${humanColor}"]`);
      if (colorBtn) colorBtn.classList.add('selected');
    }
    // 新規 Reverse Match 判定（v41〜）
    if (!reverseMatch && shouldUseReverseMatch()) {
      reverseMatch = {
        round: 1,
        round1Result: null,
        initialHumanColor: humanColor
      };
      // 離脱検知用フラグと履歴スタック（v44〜）
      markReverseMatchPending();
      try { history.pushState({reverseMatchActive: true}, '', location.href); } catch(e) {}
      // イベント台帳への通知（RM セット間色継続／新規 RM 開始）
      try { window.__RSG_EVENT__ && window.__RSG_EVENT__('PRO_011'); } catch(e) {}
    }
    initGame();
  }
});

// Premium-v127: 「🏁 これで終了」— 対局をはっきり終わらせてメインへ戻る。
// オンライン対戦中は相手にも退室を通知してから離れる（放置で相手を待たせない）。
function finishSession() {
  const isOnline = (typeof olActive === 'function' && olActive());
  if (isOnline) {
    const oppName = (online && online.oppName) || '相手';
    if (!confirm(`対局を終了して${oppName}さんとの部屋から退出しますか？`)) return;
    if (typeof _olClearSession === 'function') _olClearSession();
    if (typeof olTeardown === 'function') olTeardown(true); // 相手へ退室を通知
    if (typeof _olStatus === 'function') _olStatus('');
    if (typeof olUpdateLobbyButtons === 'function') olUpdateLobbyButtons();
  }
  document.getElementById('result-modal').style.display = 'none';
  // 進行中の状態を片付ける（次に遊ぶときに前の対局が残らないように）
  if (typeof tpRm !== 'undefined') tpRm = null;
  if (typeof reverseMatch !== 'undefined') reverseMatch = null;
  if (typeof clearReverseMatchPending === 'function') clearReverseMatchPending();
  const paBtn = document.getElementById('play-again-btn');
  if (paBtn) { paBtn.textContent = 'もう1局'; paBtn.disabled = false; }
  if (typeof sessionWins !== 'undefined') sessionWins = { black: 0, white: 0, draw: 0 };
  const ss = document.getElementById('session-score');
  if (ss) ss.style.display = 'none';
  showPage('main');
}

// pass-ok のクリックは showCpuPass() 内で動的にハンドリング

document.getElementById('gp-black').addEventListener('click', async () => {
  document.getElementById('gp-modal').style.display = 'none';
  document.getElementById('controls').style.display = '';
  if (pendingMove) {
    let tutFlipCount = 0;
    if (isTutorial) {
      tutFlipCount = getFlippable(...pendingMove, 'black', 'black').length;
    }
    // Premium-v114: オンライン対戦なら選んだ色を相手に通知
    if (typeof olNotifyGpSelect === 'function') olNotifyGpSelect('black');
    if (typeof clockResume === 'function') clockResume(); // Premium-v128
    await executeMove(...pendingMove, 'black'); pendingMove = null;
    if (isTutorial) onTutorialGPCallComplete('black', tutFlipCount);
  }
});

document.getElementById('gp-white').addEventListener('click', async () => {
  document.getElementById('gp-modal').style.display = 'none';
  document.getElementById('controls').style.display = '';
  if (pendingMove) {
    let tutFlipCount = 0;
    if (isTutorial) {
      tutFlipCount = getFlippable(...pendingMove, 'black', 'white').length;
    }
    // Premium-v114: オンライン対戦なら選んだ色を相手に通知
    if (typeof olNotifyGpSelect === 'function') olNotifyGpSelect('white');
    if (typeof clockResume === 'function') clockResume(); // Premium-v128
    await executeMove(...pendingMove, 'white'); pendingMove = null;
    if (isTutorial) onTutorialGPCallComplete('white', tutFlipCount);
  }
});

document.getElementById('undo-btn').addEventListener('click', undoMove);
// Premium-v34: 「1手進む」(redo) ボタン — 「師匠と修行」モードのみ機能
const _redoBtn = document.getElementById('redo-btn');
if (_redoBtn) _redoBtn.addEventListener('click', redoMove);

// ルール説明モーダル
document.getElementById('help-btn').addEventListener('click', () => {
  document.getElementById('rules-modal').style.display = 'flex';
});
document.getElementById('rules-close').addEventListener('click', () => {
  document.getElementById('rules-modal').style.display = 'none';
});
document.getElementById('rules-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('rules-modal')) {
    document.getElementById('rules-modal').style.display = 'none';
  }
});
