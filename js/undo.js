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

// ===== 1手戻る（Undo） =====
function saveUndoState() {
  if (undoUsed) return; // 既に使用済みなら保存しない
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
  if (!undoSnapshot || isAnimating || undoUsed) return;
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
  undoUsed        = true; // 使用済みにする
  const btn = document.getElementById('undo-btn');
  btn.disabled = true;
  btn.textContent = '1手戻る（済）';
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
  // ゲーム終了時は「1手戻る」を完全に無効化（勝利2重カウント防止）
  undoUsed = true;
  undoSnapshot = null;
  const undoBtnEnd = document.getElementById('undo-btn');
  if (undoBtnEnd) {
    undoBtnEnd.disabled = true;
    undoBtnEnd.textContent = '1手戻る（済）';
  }
  let bCount = 0, wCount = 0;
  for (const [q,r,s] of ALL_CELLS) {
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
  if (battleMode === 'two') {
    if (bTotal > wTotal) { sessionWins.black++; msg = `⚫黒の勝ち！ (黒${bTotal} vs 白${wTotal})`; soundType = 'win'; }
    else if (wTotal > bTotal) { sessionWins.white++; msg = `⚪白の勝ち！ (黒${bTotal} vs 白${wTotal})`; soundType = 'win'; }
    else if (tiebreakWinner === 'black') { sessionWins.black++; msg = `⚫黒の勝ち！ (黒${bTotal} vs 白${wTotal})\n※同点のため取った石の数で判定（黒${captured.black} vs 白${captured.white}）`; soundType = 'win'; }
    else if (tiebreakWinner === 'white') { sessionWins.white++; msg = `⚪白の勝ち！ (黒${bTotal} vs 白${wTotal})\n※同点のため取った石の数で判定（黒${captured.black} vs 白${captured.white}）`; soundType = 'win'; }
    else { sessionWins.draw++; msg = `引き分け (黒${bTotal} vs 白${wTotal})`; }
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
      // 棋譜ボタン・デイリーボタン非表示
      document.getElementById('back-to-daily-btn').style.display = 'none';
      document.getElementById('kifu-btn-row').style.display = 'none';
      document.getElementById('goto-kifu-btn').style.display = 'none';
      document.getElementById('result-modal').style.display = 'flex';
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
      if (humanTotal > cpuTotal) { smWinner = 'human'; soundType = 'win'; sessionWins.black++; }
      else if (cpuTotal > humanTotal) { smWinner = 'cpu'; soundType = 'lose'; sessionWins.white++; }
      else {
        // 合計同点: 2局目の取った石の数で判定
        if (tiebreakWinner) {
          const tbHuman = (tiebreakWinner === humanColor);
          if (tbHuman) { smWinner = 'human'; soundType = 'win'; sessionWins.black++; }
          else         { smWinner = 'cpu';   soundType = 'lose'; sessionWins.white++; }
        } else { smWinner = 'draw'; soundType = 'draw'; sessionWins.draw++; }
      }
      smFinalMsg = `🏆 リバースマッチ 結果\n` +
                   `1局目（あなた${r1.humanColor === 'black' ? '⚫' : '⚪'}）: ${r1.humanPoints} — ${r1.cpuPoints}\n` +
                   `2局目（あなた${humanColor === 'black' ? '⚫' : '⚪'}）: ${humanPointsR2} — ${cpuPointsR2}\n` +
                   `───────────────\n` +
                   `合計：あなた ${humanTotal} — CPU ${cpuTotal}\n\n`;
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
    if (!tutorialMiniGame) {
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
      // デイリーチャレンジ記録
      if (soundType === 'win') {
        const dateToMark = dailyChallengeDate || getTodayStr();
        markDailyComplete(dateToMark);
        dailyChallengeDate = null;
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
  // 棋譜ボタン（プレミアム機能として将来復活予定のため、現在は常に非表示）
  document.getElementById('kifu-btn-row').style.display = 'none';
  document.getElementById('save-game-btn').textContent = '⭐ 棋譜の保存';
  document.getElementById('save-game-btn').disabled = false;
  document.getElementById('goto-kifu-btn').style.display = 'none';
  document.getElementById('result-modal').style.display = 'flex';
  if (!tutorialMiniGame) updateSessionScore();
}
