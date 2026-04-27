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

// pass-ok のクリックは showCpuPass() 内で動的にハンドリング

document.getElementById('gp-black').addEventListener('click', async () => {
  document.getElementById('gp-modal').style.display = 'none';
  document.getElementById('controls').style.display = '';
  if (pendingMove) {
    let tutFlipCount = 0;
    if (isTutorial) {
      tutFlipCount = getFlippable(...pendingMove, 'black', 'black').length;
    }
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
    await executeMove(...pendingMove, 'white'); pendingMove = null;
    if (isTutorial) onTutorialGPCallComplete('white', tutFlipCount);
  }
});

document.getElementById('undo-btn').addEventListener('click', undoMove);

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
