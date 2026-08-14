/* ============================================================
   undo.js — 1 手戻る（Undo）機能
   1 ゲームに 1 回まで使える「1 手戻る」処理。
   状態: undoSnapshot, undoUsed, gameStarted
   主要関数: saveUndoState, restoreUndoState, updateUndoButton 等
   依存：state.js（board, current, captured, moveHistory 等）、
          render.js（render, updateScore, showTurn）、
          board.js（serializeBoard）、records.js。
   ============================================================ */

let undoSnapshot = null;       // 1手戻る用スナップショット
let undoUsed = false;          // 1ゲームに1回のみ
let gameStarted = false;       // 最初の一手が打たれたか
let lastResultShareText = null; // 結果画面のシェア用テキスト（CPU対戦の終局時に組み立て）

// Premium-v34: 「師匠と修行」モード専用の複数手 undo / redo スタック
//   ゲーム開始まで連続して戻れる + 戻った分だけ進める
//   新しい手を打つと redo スタックは破棄（標準的な undo/redo の挙動）
let jukuUndoStack = [];
let jukuRedoStack = [];

function _isJukuMode() {
  return typeof isTrainingMode === 'function' && isTrainingMode()
    && (typeof trainingMode === 'undefined' || trainingMode === 'juku');
}

function _makeJukuSnapshot() {
  return {
    board: { ...board },
    captured: { ...captured },
    current: current,
    prevBoardSnapshot: prevBoardSnapshot ? { ...prevBoardSnapshot } : null,
    lastMove: lastMove ? [...lastMove] : null,
    boardHistory: boardHistory.map(b => ({ ...b })),
    moveHistory: moveHistory.map(m => ({ ...m }))
  };
}

function _applyJukuSnapshot(snap) {
  board = { ...snap.board };
  captured = { ...snap.captured };
  current = snap.current;
  prevBoardSnapshot = snap.prevBoardSnapshot ? { ...snap.prevBoardSnapshot } : null;
  lastMove = snap.lastMove ? [...snap.lastMove] : null;
  boardHistory = snap.boardHistory.map(b => ({ ...b }));
  moveHistory = snap.moveHistory.map(m => ({ ...m }));
}

function updateRedoButton() {
  const btn = document.getElementById('redo-btn');
  if (!btn) return;
  btn.disabled = !_isJukuMode() || jukuRedoStack.length === 0;
}

// ===== 1手戻る（Undo） =====
function saveUndoState() {
  const inJuku = _isJukuMode();
  if (undoUsed && !inJuku) return; // 既に使用済みなら保存しない（通常・実戦時）

  // Premium-v34: 修行モードはスタックに push、新しい手なので redo は破棄
  if (inJuku) {
    jukuUndoStack.push(_makeJukuSnapshot());
    jukuRedoStack = [];
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) undoBtn.disabled = false;
    updateRedoButton();
    return;
  }

  undoSnapshot = {
    board: { ...board },
    captured: { ...captured },
    current: current,
    prevBoardSnapshot: prevBoardSnapshot,
    boardHistoryLength: boardHistory.length,
    moveHistoryLength: moveHistory.length,
    lastMove: lastMove ? [...lastMove] : null,
  };
  document.getElementById('undo-btn').disabled = false;
}

function undoMove() {
  const inJuku = _isJukuMode();
  if (isAnimating) return;

  // Premium-v34: 修行モードは複数手 undo（jukuUndoStack から pop、redoStack に保存）
  if (inJuku) {
    if (jukuUndoStack.length === 0) return;
    jukuRedoStack.push(_makeJukuSnapshot());
    _applyJukuSnapshot(jukuUndoStack.pop());
    document.getElementById('turn-modal').style.display = 'none';
    document.getElementById('gp-modal').style.display = 'none';
    document.getElementById('controls').style.display = '';
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) {
      undoBtn.disabled = jukuUndoStack.length === 0;
      undoBtn.textContent = '1手戻る';
    }
    updateRedoButton();
    updateScore();
    const validMoves = getValidMoves(current);
    render(validMoves);
    return;
  }

  if (!undoSnapshot) return;
  if (undoUsed) return;
  document.getElementById('turn-modal').style.display = 'none';
  document.getElementById('gp-modal').style.display = 'none';
  document.getElementById('controls').style.display = '';
  board           = { ...undoSnapshot.board };
  captured        = { ...undoSnapshot.captured };
  current         = undoSnapshot.current;
  prevBoardSnapshot = undoSnapshot.prevBoardSnapshot;
  boardHistory    = boardHistory.slice(0, undoSnapshot.boardHistoryLength);
  moveHistory     = moveHistory.slice(0, undoSnapshot.moveHistoryLength);
  lastMove        = undoSnapshot.lastMove;
  undoSnapshot    = null;
  undoUsed = true;
  const btn = document.getElementById('undo-btn');
  btn.disabled = true;
  btn.textContent = '1手戻る（済）';
  updateScore();
  const validMoves = getValidMoves(current);
  render(validMoves);
}

// Premium-v34: 「1手進む」(Redo) — 修行モード専用
function redoMove() {
  if (!_isJukuMode()) return;
  if (isAnimating) return;
  if (jukuRedoStack.length === 0) return;
  jukuUndoStack.push(_makeJukuSnapshot());
  _applyJukuSnapshot(jukuRedoStack.pop());
  document.getElementById('turn-modal').style.display = 'none';
  document.getElementById('gp-modal').style.display = 'none';
  document.getElementById('controls').style.display = '';
  const undoBtn = document.getElementById('undo-btn');
  if (undoBtn) {
    undoBtn.disabled = false;
    undoBtn.textContent = '1手戻る';
  }
  updateRedoButton();
  updateScore();
  const validMoves = getValidMoves(current);
  render(validMoves);
}

// コウ手クリック時の一時メッセージ
function showKoMessage() {
  if (koMessageTimer) clearTimeout(koMessageTimer);
  const el = document.getElementById('turn-info');
  el.innerHTML = 'コウ：その手は打てません <button onclick="showKoHelp()" style="background:none;border:2px solid #e30909;border-radius:50%;width:24px;height:24px;font-size:0.8rem;font-weight:bold;color:#e30909;cursor:pointer;vertical-align:middle;margin-left:4px;">？</button>';
  el.style.color = '#e30909';
  koMessageTimer = setTimeout(() => {
    const icon = current === 'black' ? '●' : '○';
    showTurn(`${icon} ${colorLabel(current)}のターンです`);
    el.style.color = '';
    koMessageTimer = null;
  }, 3000);
}

function showKoHelp() {
  if (koMessageTimer) { clearTimeout(koMessageTimer); koMessageTimer = null; }
  document.getElementById('ko-help-modal').style.display = 'flex';
}

function hideKoHelp() {
  document.getElementById('ko-help-modal').style.display = 'none';
  const el = document.getElementById('turn-info');
  const icon = current === 'black' ? '●' : '○';
  showTurn(`${icon} ${colorLabel(current)}のターンです`);
  el.style.color = '';
}

// 終了処理
function endGame() {
  // 診断ログ（endGame 呼び出し検出用）
  console.log(`[DIAG endGame] called: mv=${moveHistory.length}, stones=${Object.values(board).filter(v => v !== null).length}, cur=${current}`);
  let _dailyCelebrateKind = null; // v83: デイリー達成お祝いの種類 ('day'|'month'|null)
  let _dailyCelebrateMonth = null; // v83: 月コンプ時の月番号（トロフィー登場用）
  // Premium-v128: 終局したら時計を止める
  if (typeof clockStop === 'function') clockStop();
  // Premium-v127: 「これで終了」は完全終局のときだけ出す（既定は表示）
  const _finishBtn = document.getElementById('finish-btn');
  if (_finishBtn) _finishBtn.style.display = '';
  // Premium-v108: 棋譜用に「この対局の黒/白の名前」を控える（この後の自動交代より前に）
  if (battleMode === 'two' && typeof tpMarkGameNames === 'function') tpMarkGameNames();
  // Premium-v102: 2人対戦用の結果ボタン・交代案内はいったん隠す（2人対戦の枝で再表示）
  const _tpResultBtn = document.getElementById('tp-records-result-btn');
  if (_tpResultBtn) _tpResultBtn.style.display = 'none';
  const _tpSwapNote = document.getElementById('tp-swap-note');
  if (_tpSwapNote) _tpSwapNote.style.display = 'none';
  // ゲーム終了時は「1手戻る」を完全に無効化（勝利2重カウント防止）
  undoUsed = true;
  undoSnapshot = null;
  // Premium-v34: 修行モード用スタックもクリアして「1手進む」も無効化
  jukuUndoStack = [];
  jukuRedoStack = [];
  const undoBtnEnd = document.getElementById('undo-btn');
  if (undoBtnEnd) {
    undoBtnEnd.disabled = true;
    undoBtnEnd.textContent = '1手戻る（済）';
  }
  if (typeof updateRedoButton === 'function') updateRedoButton();
  let bCount = 0, wCount = 0;
  for (const [q,r,s] of ALL_CELLS) {
    // Premium-v12: CP セル [0,0,0] は盤面得点に含めない
    if (q === 0 && r === 0 && s === 0) continue;
    const c = board[K(q,r,s)];
    if (c === 'black') bCount++;
    else if (c === 'white') wCount++;
  }
  const bTotal = bCount + captured.black;
  const wTotal = wCount + captured.white;
  let msg;
  let soundType = 'draw';
  // 同点の場合は囲んで取った石の数で勝敗を決める
  let tiebreakWinner = null;
  if (bTotal === wTotal) {
    if (captured.black > captured.white) tiebreakWinner = 'black';
    else if (captured.white > captured.black) tiebreakWinner = 'white';
  }
  if (battleMode === 'two' && typeof tpRm !== 'undefined' && tpRm && tpRm.round === 1) {
    // ============================================
    // Premium-v105: 2人対戦リバースマッチ 1局目終了 → 中間結果を表示して2局目へ
    // ============================================
    tpRm.r1 = { bs: bTotal, ws: wTotal, bc: captured.black, wc: captured.white };
    tpRm.round = 2;
    document.getElementById('result-text').textContent =
      `🔄 リバースマッチ 1局目終了\n` +
      `1局目（${tpRm.aName}⚫）: ${bTotal} — ${wTotal}\n\n` +
      `先手・後手を入れ替えて2局目へ！\n2局の合計で勝敗が決まります`;
    // 2局目に向けて名前を入れ替え（次の initGame でパネルに反映される）
    if (typeof tpSwapNames === 'function') tpSwapNames();
    const _paBtn = document.getElementById('play-again-btn');
    if (_paBtn) _paBtn.textContent = '2局目へ ▶';
    // Premium-v127: まだ対局の途中なので「これで終了」は出さない
    if (_finishBtn) _finishBtn.style.display = 'none';
    // 中間結果では保存・シェア・成績ボタンは出さない
    document.getElementById('back-to-daily-btn').style.display = 'none';
    document.getElementById('kifu-btn-row').style.display = 'none';
    document.getElementById('goto-kifu-btn').style.display = 'none';
    const _shareBtnTp = document.getElementById('share-result-btn');
    if (_shareBtnTp) _shareBtnTp.style.display = 'none';
    document.getElementById('result-modal').style.display = 'flex';
    if (typeof updateRestartBtnState === 'function') updateRestartBtnState();
    playSound('draw');
    return; // 記録・セッションスコアはまだ
  }
  if (battleMode === 'two' && typeof tpRm !== 'undefined' && tpRm && tpRm.round === 2) {
    // ============================================
    // Premium-v105: 2人対戦リバースマッチ 2局目終了 → 合計で勝敗判定
    // （2局目は aName が白、bName が黒）
    // ============================================
    const aTotal = tpRm.r1.bs + wTotal;              // A: 1局目黒 + 2局目白
    const bTotalSum = tpRm.r1.ws + bTotal;           // B: 1局目白 + 2局目黒
    const aCap = tpRm.r1.bc + captured.white;
    const bCap = tpRm.r1.wc + captured.black;
    let _rmR;
    if (aTotal > bTotalSum) _rmR = 'a';
    else if (bTotalSum > aTotal) _rmR = 'b';
    else if (aCap > bCap) _rmR = 'a';
    else if (bCap > aCap) _rmR = 'b';
    else _rmR = 'd';
    // Premium-v106: CPU版リバースマッチと同じ形式（1局目/2局目の内訳 + 罫線 + 合計）
    msg = `🏆 リバースマッチ 結果\n` +
          `1局目（${tpRm.aName}⚫）: ${tpRm.r1.bs} — ${tpRm.r1.ws}\n` +
          `2局目（${tpRm.aName}⚪）: ${wTotal} — ${bTotal}\n` +
          `───────────────\n` +
          `合計：${tpRm.aName} ${aTotal} — ${tpRm.bName} ${bTotalSum}\n\n`;
    // Premium-v107: 合計同点なら勝敗が決まっても引き分けでも、囲んだ石の内訳を必ず表示
    // （なぜその結果になったのか画面から分かるように）
    if (aTotal === bTotalSum) {
      msg += `※合計同点 → 囲んだ石の合計で判定（${tpRm.aName} ${aCap} — ${tpRm.bName} ${bCap}）\n\n`;
    }
    if (_rmR === 'd') { msg += `囲んだ石も同数のため引き分け`; soundType = 'draw'; }
    else { msg += `🎉 ${_rmR === 'a' ? tpRm.aName : tpRm.bName} の勝利！`; soundType = 'win'; }
    if (typeof recordTpRm === 'function') recordTpRm(tpRm.aName, tpRm.bName, aTotal, bTotalSum, _rmR);
    if (_tpResultBtn) _tpResultBtn.style.display = ''; // 成績ボタンは表示（交代案内は不要: 名前は既に交代済み）
    const _paBtn2 = document.getElementById('play-again-btn');
    if (_paBtn2) _paBtn2.textContent = 'もう1局';
    tpRm = null;
  } else if (battleMode === 'two') {
    // Premium-v101: 名前が入っていれば勝敗メッセージにも名前を表示
    const _bn = (typeof tpNameFor === 'function' && tpNameFor('black')) ? `黒・${tpNameFor('black')}` : '黒';
    const _wn = (typeof tpNameFor === 'function' && tpNameFor('white')) ? `白・${tpNameFor('white')}` : '白';
    let _tpResult; // 'b' | 'w' | 'd'（対戦成績の記録用）
    if (bTotal > wTotal) { sessionWins.black++; msg = `⚫${_bn}の勝ち！ (黒${bTotal} vs 白${wTotal})`; soundType = 'win'; _tpResult = 'b'; }
    else if (wTotal > bTotal) { sessionWins.white++; msg = `⚪${_wn}の勝ち！ (黒${bTotal} vs 白${wTotal})`; soundType = 'win'; _tpResult = 'w'; }
    else if (tiebreakWinner === 'black') { sessionWins.black++; msg = `⚫${_bn}の勝ち！ (黒${bTotal} vs 白${wTotal})\n※同点のため取った石の数で判定（黒${captured.black} vs 白${captured.white}）`; soundType = 'win'; _tpResult = 'b'; }
    else if (tiebreakWinner === 'white') { sessionWins.white++; msg = `⚪${_wn}の勝ち！ (黒${bTotal} vs 白${wTotal})\n※同点のため取った石の数で判定（黒${captured.black} vs 白${captured.white}）`; soundType = 'win'; _tpResult = 'w'; }
    else { sessionWins.draw++; msg = `引き分け (黒${bTotal} vs 白${wTotal})`; _tpResult = 'd'; }
    // Premium-v101: 名前つき対局は対戦成績に自動記録（名前未入力なら何もしない）
    if (typeof recordTpMatch === 'function') recordTpMatch(bTotal, wTotal, _tpResult);
    // Premium-v102: 名前つき対局なら結果画面に成績ボタン+交代案内を表示し、
    // 次の1局に向けて先手・後手を自動で入れ替える（記録の後に行うこと）
    const _tpNamed = (typeof tpNameFor === 'function') && tpNameFor('black') && tpNameFor('white');
    if (_tpNamed) {
      if (_tpResultBtn) _tpResultBtn.style.display = '';
      if (_tpSwapNote) _tpSwapNote.style.display = '';
      if (typeof tpAutoSwapAfterGame === 'function') tpAutoSwapAfterGame();
    }
  } else {
    // ============================================
    // Reverse Match 1局目終了時の中間処理（v41〜）
    // ============================================
    if (reverseMatch && reverseMatch.round === 1) {
      // v71: 1局目終了時に局単位で盤面制覇判定（humanColor 入れ替え前）
      const perfectResult1 = (typeof checkPerfectBonus === 'function')
        ? checkPerfectBonus(bTotal, wTotal, bCount, wCount)
        : null;
      // 1局目の結果を保存
      const humanPointsR1 = humanColor === 'black' ? bTotal : wTotal;
      const cpuPointsR1 = humanColor === 'black' ? wTotal : bTotal;
      reverseMatch.round1Result = {
        bTotal, wTotal,
        humanColor,
        humanPoints: humanPointsR1,
        cpuPoints: cpuPointsR1,
        capturedBlack: captured.black,
        capturedWhite: captured.white
      };
      // 色を入れ替えて 2局目へ
      humanColor = opp(humanColor);
      cpuColor = opp(cpuColor);
      reverseMatch.round = 2;
      // イベント台帳への通知（RM 1局目→2局目 色交換）
      try { window.__RSG_EVENT__ && window.__RSG_EVENT__('PRO_010'); } catch(e) {}
      // 中間結果メッセージ
      const r1 = reverseMatch.round1Result;
      msg = `🏆 リバースマッチ — 1局目終了\n` +
            `あなた（${r1.humanColor === 'black' ? '⚫黒' : '⚪白'}）: ${r1.humanPoints}点\n` +
            `CPU（${r1.humanColor === 'black' ? '⚪白' : '⚫黒'}）: ${r1.cpuPoints}点\n\n` +
            `次は色を入れ替えて 2局目へ\n` +
            `あなた：${humanColor === 'black' ? '⚫黒（先手）' : '⚪白（後手）'}\n` +
            `CPU：${cpuColor === 'black' ? '⚫黒（先手）' : '⚪白（後手）'}`;
      // v71: 盤面制覇なら専用音＋演出（通常の中間音はスキップ）
      if (perfectResult1) {
        triggerPerfectBonus(perfectResult1);
      } else {
        soundType = 'draw'; // 中間なので中性的な音
        playSound(soundType);
      }
      document.getElementById('result-text').textContent = msg;
      const playAgainBtn1 = document.getElementById('play-again-btn');
      playAgainBtn1.textContent = '2局目へ ▶';
      // Premium-v127: RM 1局目の中間結果では「これで終了」を出さない
      if (_finishBtn) _finishBtn.style.display = 'none';
      // デイリーボタン・シェアボタン非表示（1局目は中間結果のため）
      document.getElementById('back-to-daily-btn').style.display = 'none';
      // Premium-v41: RM 1局目終了時にも棋譜の保存ボタンを表示する
      //   ボタン押下時の humanColor 問題は saveGameRecord 側で round1Result から取得する
      document.getElementById('kifu-btn-row').style.display = '';
      const _saveBtnR1 = document.getElementById('save-game-btn');
      if (_saveBtnR1) {
        _saveBtnR1.textContent = '⭐ 1局目の棋譜を保存';
        _saveBtnR1.disabled = false;
      }
      document.getElementById('goto-kifu-btn').style.display = 'none';
      const shareBtnR1 = document.getElementById('share-result-btn');
      if (shareBtnR1) shareBtnR1.style.display = 'none';
      document.getElementById('result-modal').style.display = 'flex';
      // v77: RM 進行中なので「ゲーム設定に戻る」を無効化（戻れば負け確定の罠を防ぐ）
      updateRestartBtnState();
      return; // 戦績・昇格試験の記録はまだしない
    }

    // ============================================
    // Reverse Match 2局目終了時の合計判定（v41〜）
    // ============================================
    let smFinalMsg = null;
    if (reverseMatch && reverseMatch.round === 2) {
      const r1 = reverseMatch.round1Result;
      const humanPointsR2 = humanColor === 'black' ? bTotal : wTotal;
      const cpuPointsR2 = humanColor === 'black' ? wTotal : bTotal;
      const humanTotal = r1.humanPoints + humanPointsR2;
      const cpuTotal = r1.cpuPoints + cpuPointsR2;
      const humanName = getPlayerName();
      let smWinner; // 'human' | 'cpu' | 'draw'
      // v85: 合計同点時のタイブレーク表示用（1局目+2局目の囲み合計）
      let smCapTiebreak = false, smHumanCapTotal = 0, smCpuCapTotal = 0;
      if (humanTotal > cpuTotal) { smWinner = 'human'; soundType = 'win'; sessionWins.black++; }
      else if (cpuTotal > humanTotal) { smWinner = 'cpu'; soundType = 'lose'; sessionWins.white++; }
      else {
        // v85: 合計同点 → 1局目+2局目の「囲んで取った石」の合計（あなた vs CPU）で判定。
        // 旧実装は2局目の囲みのみ＆2局目盤面が同点のときしか働かず、ほぼ引き分けになっていた。
        const humanCapR1 = r1.humanColor === 'black' ? r1.capturedBlack : r1.capturedWhite;
        const cpuCapR1   = r1.humanColor === 'black' ? r1.capturedWhite : r1.capturedBlack;
        const humanCapR2 = humanColor === 'black' ? captured.black : captured.white;
        const cpuCapR2   = humanColor === 'black' ? captured.white : captured.black;
        smHumanCapTotal = humanCapR1 + humanCapR2;
        smCpuCapTotal   = cpuCapR1 + cpuCapR2;
        smCapTiebreak = true;
        if (smHumanCapTotal > smCpuCapTotal)      { smWinner = 'human'; soundType = 'win';  sessionWins.black++; }
        else if (smCpuCapTotal > smHumanCapTotal) { smWinner = 'cpu';   soundType = 'lose'; sessionWins.white++; }
        else                                      { smWinner = 'draw';  soundType = 'draw'; sessionWins.draw++; }
      }
      smFinalMsg = `🏆 リバースマッチ 結果\n` +
                   `1局目（あなた${r1.humanColor === 'black' ? '⚫' : '⚪'}）: ${r1.humanPoints} — ${r1.cpuPoints}\n` +
                   `2局目（あなた${humanColor === 'black' ? '⚫' : '⚪'}）: ${humanPointsR2} — ${cpuPointsR2}\n` +
                   `───────────────\n` +
                   `合計：あなた ${humanTotal} — CPU ${cpuTotal}\n\n`;
      if (smCapTiebreak) {
        smFinalMsg += `※合計同点 → 囲んだ石の合計で判定（あなた ${smHumanCapTotal} — CPU ${smCpuCapTotal}）\n\n`;
      }
      if (smWinner === 'human') smFinalMsg += `🎉 ${humanName} の勝利！`;
      else if (smWinner === 'cpu') smFinalMsg += `😢 CPU の勝利`;
      else smFinalMsg += `引き分け`;
      msg = smFinalMsg;
      // SM状態クリア（戦績処理より先にクリアしても影響なし）
      reverseMatch = null;
      // Reverse Match 正常終了なので離脱検知フラグを削除（v44〜）
      clearReverseMatchPending();
    } else {
      // ============================================
      // 通常対戦（非 Reverse Match）の既存処理
      // ============================================
      const blackLabel = humanColor === 'black' ? getPlayerName() : 'CPU';
      const whiteLabel = humanColor === 'white' ? getPlayerName() : 'CPU';
      if (bTotal > wTotal) {
        sessionWins.black++;
        msg = `${blackLabel}の勝ち！ (黒${bTotal} vs 白${wTotal})`;
        soundType = humanColor === 'black' ? 'win' : 'lose';
      } else if (wTotal > bTotal) {
        sessionWins.white++;
        msg = `${whiteLabel}の勝ち！ (黒${bTotal} vs 白${wTotal})`;
        soundType = humanColor === 'white' ? 'win' : 'lose';
      } else if (tiebreakWinner) {
        const winnerLabel = tiebreakWinner === 'black' ? blackLabel : whiteLabel;
        if (tiebreakWinner === 'black') sessionWins.black++; else sessionWins.white++;
        msg = `${winnerLabel}の勝ち！ (黒${bTotal} vs 白${wTotal})\n※同点のため取った石の数で判定（黒${captured.black} vs 白${captured.white}）`;
        soundType = humanColor === tiebreakWinner ? 'win' : 'lose';
      } else { sessionWins.draw++; msg = `引き分け (黒${bTotal} vs 白${wTotal})`; }
    }
    // 戦績を保存
    // Premium-v6: 修行コース (cpuLevel = 11/13/14/21) は戦績/昇格対象外（既知の課題、後で専用 key で記録予定）
    const isTrainingMatch = cpuLevel >= 11;
    // Premium-v19 (v20 改): 修行コースは「実戦」モードのみ専用 key で記録
    //   「師匠と修行」モードは記録対象外（純粋な学びの場）
    const _isTrainingReal = isTrainingMatch
      && (typeof trainingMode !== 'undefined' && trainingMode === 'real');
    if (!tutorialMiniGame && _isTrainingReal) {
      // Premium-v22: ランクアップ前のランクを記録
      const _prevTrainingRanks = (typeof calculateTrainingRank === 'function')
        ? calculateTrainingRank() : null;
      const tRecord = loadTrainingRecord();
      const lvKey = String(cpuLevel);
      if (tRecord[lvKey]) {
        if (soundType === 'win') tRecord[lvKey].win++;
        else if (soundType === 'lose') tRecord[lvKey].lose++;
        else tRecord[lvKey].draw++;
        saveTrainingRecord(tRecord);
      }
      // Premium-v22: ランクアップ判定（戦績更新後）と通知メッセージ追記
      if (_prevTrainingRanks && typeof calculateTrainingRank === 'function') {
        const newRanks = calculateTrainingRank();
        if (newRanks.sunRank > _prevTrainingRanks.sunRank
            && typeof TRAINING_SUN_RANKS !== 'undefined') {
          const r = TRAINING_SUN_RANKS[newRanks.sunRank - 1];
          msg += `\n\n🌟 太陽系ランクアップ！\n${r.rank} ${r.name} 達成！`;
          if (r.unlock) msg += `\n🔓 ${r.unlock}`;
        }
        if (newRanks.galaxyRank > _prevTrainingRanks.galaxyRank
            && typeof TRAINING_GALAXY_RANKS !== 'undefined') {
          const r = TRAINING_GALAXY_RANKS[newRanks.galaxyRank - 1];
          msg += `\n\n🌟 銀河系ランクアップ！\n${r.rank} ${r.name} 達成！`;
          if (r.unlock) msg += `\n🔓 ${r.unlock}`;
        }
      }
    }
    if (!tutorialMiniGame && !isTrainingMatch) {
      const record = loadBattleRecord();
      const lvKey = String(cpuLevel);
      if (soundType === 'win') record[lvKey].win++;
      else if (soundType === 'lose') record[lvKey].lose++;
      else record[lvKey].draw++;
      saveBattleRecord(record);
      // 当日成績も保存
      const dailyRec = loadDailyRecord();
      if (soundType === 'win') dailyRec[lvKey].win++;
      else if (soundType === 'lose') dailyRec[lvKey].lose++;
      else dailyRec[lvKey].draw++;
      saveDailyRecord(dailyRec);
      updateTodayRecordDisplay();
      // デイリーチャレンジ記録（v83: 新規達成時はお祝い演出を仕込む）
      if (soundType === 'win') {
        const dateToMark = dailyChallengeDate || getTodayStr();
        const dailyCompletion = (typeof registerDailyCompletion === 'function')
          ? registerDailyCompletion(dateToMark)
          : (markDailyComplete(dateToMark), null);
        dailyChallengeDate = null;
        if (dailyCompletion) {
          if (dailyCompletion.monthCompleted) {
            msg += `\n\n🏆 ${dailyCompletion.month}月コンプリート！\n全${dailyCompletion.progress.total}日達成 — トロフィー獲得！`;
            _dailyCelebrateKind = 'month';
            _dailyCelebrateMonth = dailyCompletion.month;
          } else {
            msg += `\n\n📅 本日のデイリー達成！（${dailyCompletion.month}月 ${dailyCompletion.progress.completed}/${dailyCompletion.progress.total}日）`;
            _dailyCelebrateKind = 'day';
          }
        }
      }
      // devMode: 通常勝利でランク+1（昇格試験中は除く）
      // 次の昇格試験ランクの1つ手前まで進める（昇格試験は別途挑戦）
      if (devMode && devOverrideRank !== null && soundType === 'win' && !promotionExam) {
        const examRanks = [3, 6, 9, 13, 18, 23, 24, 28, 29];
        const cap = examRanks.find(r => r > devOverrideRank && !hasPassedPromotion(r));
        const maxRank = cap !== undefined ? cap - 1 : 29;
        if (devOverrideRank < maxRank) {
          devOverrideRank++;
        }
      }
      // 昇格試験の結果記録
      let promotionPassed = false;
      if (promotionExam) {
        const matchNum = promotionExam.wins + promotionExam.losses + 1;
        const promoResult = recordPromotionResult(soundType === 'win');
        if (promoResult) {
          if (promoResult.passed) {
            promotionPassed = true;
            // devMode: 昇格試験合格でランクを試験ランクへ
            if (devMode && devOverrideRank !== null) {
              devOverrideRank = promoResult.exam.targetRank;
              if (devOverrideRank > 29) devOverrideRank = 29;
            }
            if (promoResult.careerPass) {
              msg += `\n\n🎉 通算${promoResult.career.wins}勝達成！\nランクアップマッチ 合格！`;
            } else {
              const passLabel = getMatchLabel(promoResult.exam.winsNeeded, promoResult.exam.level);
              msg += `\n\n🎉 ランクアップマッチ 合格！\n${passLabel}: ${promoResult.exam.wins}勝${promoResult.exam.losses}敗`;
            }
          } else {
            const examDef = PROMOTION_EXAMS[promoResult.exam.targetRank];
            let careerMsg = '';
            if (examDef && examDef.careerWins > 0) {
              careerMsg = `\n通算: ${promoResult.career.wins}勝（あと${examDef.careerWins - promoResult.career.wins}勝で昇格）`;
            }
            const failLabel = getMatchLabel(promoResult.exam.winsNeeded, promoResult.exam.level);
            msg += `\n\n😢 ランクアップマッチ 不合格...\n${failLabel}: ${promoResult.exam.wins}勝${promoResult.exam.losses}敗${careerMsg}\nもう一度挑戦できます！`;
          }
        } else {
          // 試験続行中 - 次の試合番号を表示
          const nextMatch = promotionExam.wins + promotionExam.losses + 1;
          const mLabel = getMatchLabel(promotionExam.winsNeeded, promotionExam.level);
          msg += `\n\n⚔ ランクアップマッチ（${mLabel}）\n第${matchNum}試合終了\n${promotionExam.wins}勝${promotionExam.losses}敗（次: 第${nextMatch}試合）`;
        }
      }
      // ランクアップチェック
      const newRank = calculateRank();
      if (newRank > prevRank || promotionPassed) {
        const rankToShow = Math.max(newRank, prevRank + 1);
        lastRankUpPrev = prevRank; // レベル解放判定のため更新前の値を保持
        setTimeout(() => {
          showRankUpModal(rankToShow);
        }, 1800);
        prevRank = newRank;
      }
    }
  }
  // v67/v68: パーフェクト/盤面制覇 判定（通常対戦のみ、CPU/2人対戦両対応）
  const perfectResult = (typeof checkPerfectBonus === 'function')
    ? checkPerfectBonus(bTotal, wTotal, bCount, wCount)
    : null;
  if (perfectResult) {
    triggerPerfectBonus(perfectResult);  // 専用音と演出（通常勝利音はスキップ）
  } else {
    playSound(soundType);
  }
  document.getElementById('result-text').textContent = msg;
  // 結果シェア用テキストを組み立て（CPU対戦のみ。チュートリアルは除外）
  if (battleMode === 'cpu' && !tutorialMiniGame) {
    const shareLv = cpuLevel >= 6 ? LEVEL_NAMES[cpuLevel - 1] : `Lv.${cpuLevel} ${LEVEL_NAMES[cpuLevel - 1]}`;
    lastResultShareText = `【ReverStarGo】vs ${shareLv}\n` +
      `${msg}\n\n` +
      `あなたはFINALを攻略できるか？\n` +
      `${location.origin}/`;
  } else {
    lastResultShareText = null;
  }
  const shareResultBtn = document.getElementById('share-result-btn');
  if (shareResultBtn) shareResultBtn.style.display = lastResultShareText ? '' : 'none';
  // もう一度ボタンのラベル（ランクアップマッチ中は「次の試合へ」）
  const playAgainBtn = document.getElementById('play-again-btn');
  if (promotionExam) {
    playAgainBtn.textContent = '次の試合へ ▶';
  } else if (shouldUseReverseMatch()) {
    // 次も Reverse Match になる場合（v41〜）
    playAgainBtn.textContent = 'もう1試合 ▶';
  } else {
    playAgainBtn.textContent = 'もう1局';
  }
  if (tutorialMiniGame) {
    document.getElementById('result-text').textContent =
      msg + '\n\nチュートリアル完了！\nおめでとうございます！\nReverStarGoの基本ルールを\nマスターしました。\n次は本番ゲームに挑戦してみましょう！';
    playAgainBtn.textContent = '本番ゲームへ';
  }
  // デイリーチャレンジの場合は「デイリーへ戻る」ボタンを表示
  document.getElementById('back-to-daily-btn').style.display = isDailySetup ? '' : 'none';
  // 棋譜ボタン（Premium版で表示、無料版では非表示）
  document.getElementById('kifu-btn-row').style.display = '';
  document.getElementById('save-game-btn').textContent = '⭐ 棋譜の保存';
  document.getElementById('save-game-btn').disabled = false;
  // goto-kifu-btn は保存後に kifu.js が動的に表示するため、ここでは非表示のまま
  document.getElementById('goto-kifu-btn').style.display = 'none';
  document.getElementById('result-modal').style.display = 'flex';
  // v83: 月コンプ時は結果画面にトロフィー画像を「登場」させる（それ以外は隠す）
  const _resultTrophy = document.getElementById('result-trophy');
  if (_resultTrophy) {
    if (_dailyCelebrateKind === 'month' && _dailyCelebrateMonth) {
      _resultTrophy.src = `/trophy/${_dailyCelebrateMonth}.jpg`;
      _resultTrophy.style.display = '';
      _resultTrophy.classList.remove('trophy-appear');
      void _resultTrophy.offsetWidth; // リフローでアニメ再生
      _resultTrophy.classList.add('trophy-appear');
    } else {
      _resultTrophy.style.display = 'none';
      _resultTrophy.classList.remove('trophy-appear');
    }
  }
  // v83: デイリー達成のお祝い演出（パーフェクト演出と重複しないときのみ）
  if (_dailyCelebrateKind && !perfectResult) {
    if (_dailyCelebrateKind === 'month') {
      try { playSound('fanfare'); } catch (e) {}
      if (typeof showFireworks === 'function') showFireworks(4000);
    } else {
      try { playSound('capture-praise'); } catch (e) {}
      if (typeof showConfetti === 'function') showConfetti(2500);
    }
  }
  // v77: 試合終了で「ゲーム設定に戻る」を再有効化（通常終局は戻ってOK）
  updateRestartBtnState();
  if (!tutorialMiniGame) updateSessionScore();
}
