/* ============================================================
   events.js — クリック処理 + 初期化 + イベント + 開発者メニュー
   - クリック処理: pixelToCell, handleBoardClick, handleGPModalClick
   - 初期化: initGame, initBoard, resetSession
   - 各種イベントリスナー登録
   - 開発者メニュー: 隠しコマンド（タイトル長押し等）、各種テスト機能
   依存：state.js、board.js、render.js、ai.js、records.js、
          settings.js、setup.js、tutorial.js、effects.js 等。
   ============================================================ */

// ===== クリック処理 =====

// ピクセル座標 → cube座標 (pointy-top)
function pixelToCell(px, py) {
  const q = (SQRT3/3 * px - 1/3 * py) / HEX_SIZE;
  const r = (2/3 * py) / HEX_SIZE;
  const s = -q - r;
  // cube round
  let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  else rs = -rq - rr;
  return [rq, rr, rs];
}

/**
 * 人間プレイヤーがセルをクリックしたときの手処理。コウルール ②③④ 判定、
 * GP コール必要時のモーダル表示（color 選択待ち）、executeMove の呼び出しを担当。
 * リプレイ中・アニメ中・チュートリアル中はクリック無効。
 * @param {number} q - クリックされたセルの cube 座標 q
 * @param {number} r - クリックされたセルの cube 座標 r
 * @param {number} s - クリックされたセルの cube 座標 s
 */
async function onCellClick(q, r, s) {
  if (replayMode) return; // リプレイ中はクリック無効
  if (isAnimating) return;
  if (isTutorial) { handleTutorialClick(q, r, s); return; }
  if (isCpuTurn()) return;
  if (!isOnBoard(q,r,s)) return;
  if (board[K(q,r,s)] !== null) return;
  const allValid = getValidMoves(current);
  const valid = filterKoMoves(allValid, current);
  // コウルール ②③④ の完全実装
  const needsKoException = valid.length === 0 && allValid.length > 0;

  // ルール④: 連続コウ例外を検出して終局
  // showPassModal を呼ばない（自動テストで詰まる原因を回避）
  if (needsKoException && prevKoException) {
    console.log('[KO-RULE-④] 連続コウ例外で終局 (onCellClick)');
    endGame();
    return;
  }

  // ルール③: 直前にコウ例外があれば自分は例外を使えない
  const koException = needsKoException && !prevKoException;

  // コウ手を踏んだ場合：有効手だがコウで禁止されている
  const isKoCell = allValid.some(([vq,vr,vs]) => vq===q && vr===r && vs===s)
                && !valid.some(([vq,vr,vs]) => vq===q && vr===r && vs===s);
  if (isKoCell && !koException) { showKoMessage(); return; }
  const playable = koException ? allValid : valid;
  if (!playable.some(([vq,vr,vs]) => vq===q && vr===r && vs===s)) return;

  // GPモーダル経由でも反映されるよう、手を打つ前にフラグ更新
  prevKoException = koException;

  saveUndoState();
  if (needsGPCall(q,r,s,current)) {
    pendingMove = [q,r,s];
    // 自分が置いた場所にマーカーを表示してからGP選択モーダルを出す
    pendingMoveMarker = [q,r,s];
    lastMove = null; // 相手の前の手のマーカーを消す
    render([]);
    // コウになるCPコール色を無効化
    const nonKoColors = getNonKoGPColors(q, r, s, current);
    const gpBlack = document.getElementById('gp-black');
    const gpWhite = document.getElementById('gp-white');
    const gpNote = document.getElementById('gp-ko-note');
    // 例外: 両方ともコウ → 両方有効（コウ例外ルール）
    const bothKo = nonKoColors.length === 0;
    const blackAllowed = bothKo || nonKoColors.includes('black');
    const whiteAllowed = bothKo || nonKoColors.includes('white');
    gpBlack.disabled = !blackAllowed;
    gpWhite.disabled = !whiteAllowed;
    gpBlack.title = blackAllowed ? '' : 'コウのため選択できません';
    gpWhite.title = whiteAllowed ? '' : 'コウのため選択できません';
    if (gpNote) {
      if (!blackAllowed && whiteAllowed) {
        gpNote.textContent = '※ 黒コールはコウのため選択できません';
        gpNote.style.display = '';
      } else if (!whiteAllowed && blackAllowed) {
        gpNote.textContent = '※ 白コールはコウのため選択できません';
        gpNote.style.display = '';
      } else {
        gpNote.style.display = 'none';
      }
    }
    document.getElementById('gp-modal').style.display = 'flex';
    document.getElementById('controls').style.display = 'none';
  } else {
    executeMove(q,r,s, bestGPColor(q,r,s,current));
  }
}

// SVG全体のクリックハンドラー（座標変換で確実にセルを検出）
document.getElementById('board').addEventListener('click', (e) => {
  const svg = document.getElementById('board');
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse());
  const [q, r, s] = pixelToCell(svgPt.x, svgPt.y);
  onCellClick(q, r, s);
});

// ===== 初期化 =====

function initGame() {
  board = {};
  captured = { black: 0, white: 0 };
  current = 'black';
  pendingMove = null;
  passState = 0;
  moveHistory = [];
  ALL_CELLS.forEach(([q,r,s]) => board[K(q,r,s)] = null);

  // 初期配置：GP周囲6マスに黒白交互（白が0,2,4番目）
  const ring1 = [[1,-1,0],[1,0,-1],[0,1,-1],[-1,1,0],[-1,0,1],[0,-1,1]];
  ring1.forEach(([q,r,s], i) => board[K(q,r,s)] = i % 2 === 0 ? 'white' : 'black');

  capturePending = new Set();
  isAnimating = false;
  lastMove = null;
  showPlacedAnim = false;
  prevBoardSnapshot = null; // コウ判定リセット
  boardHistory = [];        // スーパーコウ履歴リセット
  prevKoException = false;  // コウ例外連続検知フラグもリセット
  transTable.clear();       // 前ゲームの探索キャッシュを破棄
  undoSnapshot = null;      // Undoリセット
  undoUsed = false;         // Undo使用済みリセット
  gameStarted = false;      // ゲーム開始フラグリセット
  const undoBtn = document.getElementById('undo-btn');
  undoBtn.disabled = true;
  undoBtn.textContent = '1手戻る';
  if (battleMode === 'two') {
    document.getElementById('black-role').textContent = '';
    document.getElementById('white-role').textContent = '';
    document.getElementById('level-badge').style.display = 'none';
  } else {
    const rIdx = calculateRank();
    document.getElementById('black-role').innerHTML = humanColor === 'black' ? `${rankIcon(rIdx, 18)} ${getPlayerName()}` : 'CPU';
    document.getElementById('white-role').innerHTML = humanColor === 'white' ? `${rankIcon(rIdx, 18)} ${getPlayerName()}` : 'CPU';
    document.getElementById('level-badge').style.display = '';
    let badgeText = cpuLevel >= 6 ? LEVEL_NAMES[cpuLevel-1] : `Lv.${cpuLevel}`;
    // Reverse Match 中は 1/2 or 2/2 の表示を追加（v41〜）
    if (reverseMatch) {
      badgeText += ` 🏆 ${reverseMatch.round}/2`;
    }
    document.getElementById('level-badge').textContent = badgeText;
  }
  updateScore();
  document.getElementById('result-modal').style.display = 'none';
  document.getElementById('pass-modal').style.display = 'none';
  document.getElementById('turn-modal').style.display = 'none';
  document.getElementById('gp-modal').style.display = 'none';
  document.getElementById('controls').style.display = '';
  updateTodayRecordDisplay();
  updatePromotionGameStatus();
  updateGame();
}

let lastRankUpIndex = 0; // ランクアップ時のランクindexを保持
let lastRankUpPrev = 0;  // ランクアップ前のランクindexを保持（レベル解放判定用）

function showRankUpModal(rankIdx) {
  lastRankUpIndex = rankIdx;
  const rank = RANKS[rankIdx];
  document.getElementById('rankup-icon').innerHTML = rankIcon(rankIdx, 48);
  document.getElementById('rankup-name').textContent = `ランク${rankIdx + 1}：${rank.name}`;
  document.getElementById('rankup-condition').textContent = rank.condition;
  document.getElementById('rankup-modal').style.display = 'flex';
  launchFireworks(4000);
}

// ===== イベント =====

document.getElementById('rankup-ok-btn').addEventListener('click', () => {
  document.getElementById('rankup-modal').style.display = 'none';
  updateLevelButtons();
  // レベル解放チェック
  const unlockedLevel = checkLevelUnlock(lastRankUpIndex);
  if (unlockedLevel > 0) {
    showLevelUnlock(unlockedLevel);
  } else {
    // レベル解放がなければ昇格試験案内チェック
    const promo = getAvailablePromotion();
    if (promo && !promotionExam) {
      showPromoAnnounce(promo);
    }
  }
});

// ===== 開発者メニュー =====
let devMode = false;
let devOverrideRank = null;
function activateDevMode() {
  document.getElementById('dev-menu').style.display = 'flex';
  if (!devMode) {
    const currentRank = calculateRank();
    devMode = true;
    devOverrideRank = currentRank;
  }
  document.getElementById('dev-mode-toggle-btn').textContent = '🟢 開発者モード ON';
  document.getElementById('dev-mode-indicator').style.display = '';
}

function toggleDevMode() {
  if (!devMode) {
    // ON にする前に通常ランクを取得
    const currentRank = calculateRank();
    devMode = true;
    devOverrideRank = currentRank;
  } else {
    devMode = false;
    devOverrideRank = null;
  }
  const btn = document.getElementById('dev-mode-toggle-btn');
  btn.textContent = devMode ? '🟢 開発者モード ON' : '🔴 開発者モード OFF';
  document.getElementById('dev-mode-indicator').style.display = devMode ? '' : 'none';
  updateRankDisplay();
  updateLevelButtons();
}

function devSetRank(rankIdx) {
  devOverrideRank = rankIdx;
  // 設定ランク以下の昇格試験を自動的に合格済みにする
  const examRanks = [3, 6, 9, 13, 18, 23, 24, 28, 29];
  for (const er of examRanks) {
    if (er <= rankIdx) savePromotion(er);
  }
  // 進行中の昇格試験をクリア
  clearPromotionExam();
  promotionExam = null;
  updateRankDisplay();
  updateLevelButtons();
  updateAccountRankDisplay();
  if (typeof updatePromotionSection === 'function') updatePromotionSection();
  closeRankList();
  closeDevMenu();
  alert(`ランク${rankIdx + 1}：${RANKS[rankIdx].name} に変更しました`);
}

function closeDevMenu() {
  document.getElementById('dev-menu').style.display = 'none';
}

function devResetAll() {
  if (confirm('全データをリセットしますか？')) {
    localStorage.removeItem(BATTLE_RECORD_KEY);
    localStorage.removeItem(DAILY_RECORD_KEY);
    localStorage.removeItem(PROMOTION_KEY);
    localStorage.removeItem(PROMOTION_EXAM_KEY);
    localStorage.removeItem(PROMOTION_CAREER_KEY);
    localStorage.removeItem(DAILY_KEY);
    // devOverrideRank と進行中の試験もリセット
    promotionExam = null;
    sessionWins = { black: 0, white: 0, draw: 0 };
    if (devMode) devOverrideRank = 0;
    closeDevMenu();
    updateRankDisplay();
    updateLevelButtons();
    updateTodayRecordDisplay();
    if (typeof updatePromotionSection === 'function') updatePromotionSection();
    alert('全データをリセットしました');
  }
}

function devResetBattle() {
  if (confirm('戦績をリセットしますか？')) {
    localStorage.removeItem(BATTLE_RECORD_KEY);
    localStorage.removeItem(DAILY_RECORD_KEY);
    sessionWins = { black: 0, white: 0, draw: 0 };
    if (devMode) devOverrideRank = 0;
    closeDevMenu();
    updateRankDisplay();
    updateLevelButtons();
    updateTodayRecordDisplay();
    alert('戦績をリセットしました');
  }
}

function devResetPromotions() {
  if (confirm('ランクアップマッチの記録をリセットしますか？')) {
    localStorage.removeItem(PROMOTION_KEY);
    localStorage.removeItem(PROMOTION_EXAM_KEY);
    localStorage.removeItem(PROMOTION_CAREER_KEY);
    promotionExam = null;
    closeDevMenu();
    updateRankDisplay();
    updateLevelButtons();
    if (typeof updatePromotionSection === 'function') updatePromotionSection();
    alert('ランクアップマッチをリセットしました');
  }
}

function devToggleDaily(dateStr, setComplete) {
  const data = loadDailyData();
  if (setComplete) {
    data[dateStr] = true;
  } else {
    delete data[dateStr];
  }
  saveDailyData(data);
  renderCalendar();
  renderTrophies();
}

function devResetDaily() {
  if (confirm('デイリー記録をリセットしますか？')) {
    localStorage.removeItem(DAILY_KEY);
    closeDevMenu();
    alert('デイリー記録をリセットしました');
  }
}

function showPromoAnnounce(promo) {
  const targetRank = RANKS[promo.targetRank];
  const matchLabel = getMatchLabel(promo.winsNeeded, promo.level);
  document.getElementById('promo-announce-title').textContent = `🎉 ${promo.label}への挑戦権を獲得！`;
  document.getElementById('promo-announce-desc').textContent = `${targetRank.name} ランクアップマッチ（${matchLabel}）に挑戦できます！`;
  // 初回のランクアップマッチのみヘルプを自動展開（以降は？ボタンで確認可能）
  const helpSeen = localStorage.getItem('rankupHelpSeen');
  if (!helpSeen) {
    document.getElementById('promo-announce-help').style.display = '';
    localStorage.setItem('rankupHelpSeen', '1');
  } else {
    document.getElementById('promo-announce-help').style.display = 'none';
  }
  document.getElementById('promo-announce-modal').style.display = 'flex';
}

document.getElementById('promo-announce-ok-btn').addEventListener('click', () => {
  document.getElementById('promo-announce-modal').style.display = 'none';
  showPage('game-setup');
});

document.getElementById('promo-announce-start-btn').addEventListener('click', () => {
  document.getElementById('promo-announce-modal').style.display = 'none';
  // showPage('game-setup') を削除（v40 から続いていたバグ修正）
  // showPage('game-setup') を呼ぶと updatePromotionSection が走り、
  // 何かが restart-btn を誤発火させて backToSetupPage に飛んでいた。
  // startPromotionExam が setup-game / setup-main を非表示にする処理を持っているので、
  // showPage('game-setup') は本来不要。
  startPromotionExam();
});

document.getElementById('promo-announce-help-toggle').addEventListener('click', () => {
  const helpEl = document.getElementById('promo-announce-help');
  helpEl.style.display = helpEl.style.display === 'none' ? '' : 'none';
});

document.getElementById('restart-btn').addEventListener('click', () => {
  // ゲーム終了後（結果表示中）はそのまま戻る
  if (document.getElementById('result-modal').style.display !== 'none') {
    backToSetupPage();
    return;
  }
  // ゲームがまだ始まっていない場合はそのまま戻る
  if (!gameStarted) {
    backToSetupPage();
    return;
  }
  // 開発者モード中は警告なしでそのまま戻る（負け記録もしない）
  if (devMode) {
    backToSetupPage();
    return;
  }
  // v62: プレイヤーがまだ自分の石を1手も置いていない場合は、警告なしで即座に戻る。
  // 白番で「ゲーム開始」を押すと CPU が即座に黒の1手目を置くため、設定変更したくても
  // 「中断＝負け」モーダルに阻まれるという問題を解消する。CPU 対戦時のみ適用。
  if (battleMode === 'cpu') {
    const playerNotMoved = !moveHistory.some(m => m.player === humanColor);
    if (playerNotMoved) {
      backToSetupPage();
      return;
    }
  }
  // ゲーム中は確認ポップアップを表示（対戦モードでメッセージ切り替え）
  const quitMsg = document.querySelector('.quit-confirm-inner p');
  if (battleMode === 'two') {
    quitMsg.innerHTML = '⚠ 対戦を中止しますか？';
  } else {
    quitMsg.innerHTML = '⚠ ゲームを中断すると<br><strong>負け</strong>になります。<br>よろしいですか？';
  }
  document.getElementById('quit-confirm').style.display = 'flex';
});

function confirmQuit() {
  document.getElementById('quit-confirm').style.display = 'none';
  // Reverse Match 中ならフラグをクリア（v44〜）
  clearReverseMatchPending();
  reverseMatch = null;
  // 負けとして記録（CPU対戦・チュートリアル以外、開発者モード以外）
  if (battleMode === 'cpu' && !isTutorial && !tutorialMiniGame && !devMode) {
    const record = loadBattleRecord();
    const lvKey = String(cpuLevel);
    record[lvKey].lose++;
    saveBattleRecord(record);
    // 当日成績も記録
    const dailyRec = loadDailyRecord();
    dailyRec[lvKey].lose++;
    saveDailyRecord(dailyRec);
    // ランクアップマッチ中なら1敗として記録
    if (promotionExam) {
      recordPromotionResult(false);
    }
  }
  backToSetupPage();
}

function cancelQuit() {
  document.getElementById('quit-confirm').style.display = 'none';
}

function backToDaily() {
  document.getElementById('result-modal').style.display = 'none';
  isDailySetup = false;
  dailyChallengeDate = null;
  showPage('daily');
}

function backToSetupPage() {
  document.getElementById('result-modal').style.display = 'none';
  if (isDailySetup) {
    isDailySetup = false;
    showPage('daily');
  } else if (promotionExam) {
    // ランクアップマッチ中はゲーム設定画面に直接戻す
    showPage('game-setup');
  } else {
    showPage('game-setup');
  }
}
