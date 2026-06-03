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
  btn.textContent = 'Undo (used)';
  updateScore();
  const validMoves = getValidMoves(current);
  render(validMoves);
}

// コウ手クリック時の一時メッセージ
function showKoMessage() {
  if (koMessageTimer) clearTimeout(koMessageTimer);
  const el = document.getElementById('turn-info');
  el.innerHTML = 'Ko: That move is not allowed <button onclick="showKoHelp()" style="background:none;border:2px solid #e30909;border-radius:50%;width:24px;height:24px;font-size:0.8rem;font-weight:bold;color:#e30909;cursor:pointer;vertical-align:middle;margin-left:4px;">?</button>';
  el.style.color = '#e30909';
  koMessageTimer = setTimeout(() => {
    const icon = current === 'black' ? '●' : '○';
    showTurn(`${icon} ${colorLabel(current)}'s turn`);
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
  showTurn(`${icon} ${colorLabel(current)}'s turn`);
  el.style.color = '';
}

// 終了処理
function endGame() {
  // 診断ログ（endGame 呼び出し検出用）
  console.log(`[DIAG endGame] called: mv=${moveHistory.length}, stones=${Object.values(board).filter(v => v !== null).length}, cur=${current}`);
  let _dailyCelebrateKind = null; // v83: デイリー達成お祝いの種類 ('day'|'month'|null)
  let _dailyCelebrateMonth = null; // v83: 月コンプ時の月番号（トロフィー登場用）
  // ゲーム終了時は「1手戻る」を完全に無効化（勝利2重カウント防止）
  undoUsed = true;
  undoSnapshot = null;
  const undoBtnEnd = document.getElementById('undo-btn');
  if (undoBtnEnd) {
    undoBtnEnd.disabled = true;
    undoBtnEnd.textContent = 'Undo (used)';
  }
  let bCount = 0, wCount = 0;
  for (const [q,r,s] of ALL_CELLS) {
    // v79: CP セル [0,0,0] は盤面得点に含めない
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
  if (battleMode === 'two') {
    if (bTotal > wTotal) { sessionWins.black++; msg = `⚫Black wins! (Black ${bTotal} vs White ${wTotal})`; soundType = 'win'; }
    else if (wTotal > bTotal) { sessionWins.white++; msg = `⚪White wins! (Black ${bTotal} vs White ${wTotal})`; soundType = 'win'; }
    else if (tiebreakWinner === 'black') { sessionWins.black++; msg = `⚫Black wins! (Black ${bTotal} vs White ${wTotal})\n* Tiebreak by captured stones (Black ${captured.black} vs White ${captured.white})`; soundType = 'win'; }
    else if (tiebreakWinner === 'white') { sessionWins.white++; msg = `⚪White wins! (Black ${bTotal} vs White ${wTotal})\n* Tiebreak by captured stones (Black ${captured.black} vs White ${captured.white})`; soundType = 'win'; }
    else { sessionWins.draw++; msg = `Draw (Black ${bTotal} vs White ${wTotal})`; }
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
      msg = `🏆 Reverse Match — Round 1 ended\n` +
            `You (${r1.humanColor === 'black' ? '⚫Black' : '⚪White'}): ${r1.humanPoints}\n` +
            `CPU (${r1.humanColor === 'black' ? '⚪White' : '⚫Black'}): ${r1.cpuPoints}\n\n` +
            `Now swapping colors for Round 2\n` +
            `You: ${humanColor === 'black' ? '⚫Black (1st)' : '⚪White (2nd)'}\n` +
            `CPU: ${cpuColor === 'black' ? '⚫Black (1st)' : '⚪White (2nd)'}`;
      // v71: 盤面制覇なら専用音＋演出（通常の中間音はスキップ）
      if (perfectResult1) {
        triggerPerfectBonus(perfectResult1);
      } else {
        soundType = 'draw'; // 中間なので中性的な音
        playSound(soundType);
      }
      document.getElementById('result-text').textContent = msg;
      const playAgainBtn1 = document.getElementById('play-again-btn');
      playAgainBtn1.textContent = 'Round 2 ▶';
      // 棋譜ボタン・デイリーボタン非表示
      document.getElementById('back-to-daily-btn').style.display = 'none';
      document.getElementById('kifu-btn-row').style.display = 'none';
      document.getElementById('goto-kifu-btn').style.display = 'none';
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
      smFinalMsg = `🏆 Reverse Match Result\n` +
                   `Round 1 (You ${r1.humanColor === 'black' ? '⚫' : '⚪'}): ${r1.humanPoints} — ${r1.cpuPoints}\n` +
                   `Round 2 (You ${humanColor === 'black' ? '⚫' : '⚪'}): ${humanPointsR2} — ${cpuPointsR2}\n` +
                   `───────────────\n` +
                   `Total: You ${humanTotal} — CPU ${cpuTotal}\n\n`;
      if (smWinner === 'human') smFinalMsg += `🎉 ${humanName} wins!`;
      else if (smWinner === 'cpu') smFinalMsg += `😢 CPU wins`;
      else smFinalMsg += `Draw`;
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
        msg = `${blackLabel} wins! (Black ${bTotal} vs White ${wTotal})`;
        soundType = humanColor === 'black' ? 'win' : 'lose';
      } else if (wTotal > bTotal) {
        sessionWins.white++;
        msg = `${whiteLabel} wins! (Black ${bTotal} vs White ${wTotal})`;
        soundType = humanColor === 'white' ? 'win' : 'lose';
      } else if (tiebreakWinner) {
        const winnerLabel = tiebreakWinner === 'black' ? blackLabel : whiteLabel;
        if (tiebreakWinner === 'black') sessionWins.black++; else sessionWins.white++;
        msg = `${winnerLabel} wins! (Black ${bTotal} vs White ${wTotal})\n* Tiebreak by captured stones (Black ${captured.black} vs White ${captured.white})`;
        soundType = humanColor === tiebreakWinner ? 'win' : 'lose';
      } else { sessionWins.draw++; msg = `Draw (Black ${bTotal} vs White ${wTotal})`; }
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
      // デイリーチャレンジ記録（v83: 新規達成時はお祝い演出を仕込む）
      if (soundType === 'win') {
        const dateToMark = dailyChallengeDate || getTodayStr();
        const dailyCompletion = (typeof registerDailyCompletion === 'function')
          ? registerDailyCompletion(dateToMark)
          : (markDailyComplete(dateToMark), null);
        dailyChallengeDate = null;
        if (dailyCompletion) {
          const _mn = ['January','February','March','April','May','June','July','August','September','October','November','December'];
          if (dailyCompletion.monthCompleted) {
            msg += `\n\n🏆 ${_mn[dailyCompletion.month-1]} Complete!\nAll ${dailyCompletion.progress.total} days cleared — Trophy unlocked!`;
            _dailyCelebrateKind = 'month';
            _dailyCelebrateMonth = dailyCompletion.month;
          } else {
            msg += `\n\n📅 Daily Challenge cleared! (${_mn[dailyCompletion.month-1]} ${dailyCompletion.progress.completed}/${dailyCompletion.progress.total})`;
            _dailyCelebrateKind = 'day';
          }
        }
      }
      // _xmOn: 通常勝利でランク+1（昇格試験中は除く）
      // 次の昇格試験ランクの1つ手前まで進める（昇格試験は別途挑戦）
      if (_xmOn && _xmOvr !== null && soundType === 'win' && !promotionExam) {
        const examRanks = [3, 6, 9, 13, 18, 23, 24, 28, 29];
        const cap = examRanks.find(r => r > _xmOvr && !hasPassedPromotion(r));
        const maxRank = cap !== undefined ? cap - 1 : 29;
        if (_xmOvr < maxRank) {
          _xmOvr++;
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
            // _xmOn: 昇格試験合格でランクを試験ランクへ
            if (_xmOn && _xmOvr !== null) {
              _xmOvr = promoResult.exam.targetRank;
              if (_xmOvr > 29) _xmOvr = 29;
            }
            if (promoResult.careerPass) {
              msg += `\n\n🎉 ${promoResult.career.wins} cumulative wins!\nRank-Up Match Passed!`;
            } else {
              const passLabel = getMatchLabel(promoResult.exam.winsNeeded, promoResult.exam.level);
              msg += `\n\n🎉 Rank-Up Match Passed!\n${passLabel}: ${promoResult.exam.wins}W ${promoResult.exam.losses}L`;
            }
          } else {
            const examDef = PROMOTION_EXAMS[promoResult.exam.targetRank];
            let careerMsg = '';
            if (examDef && examDef.careerWins > 0) {
              careerMsg = `\nCumulative: ${promoResult.career.wins}W (${examDef.careerWins - promoResult.career.wins} more to promote)`;
            }
            const failLabel = getMatchLabel(promoResult.exam.winsNeeded, promoResult.exam.level);
            msg += `\n\n😢 Rank-Up Match Failed...\n${failLabel}: ${promoResult.exam.wins}W ${promoResult.exam.losses}L${careerMsg}\nYou can try again!`;
          }
        } else {
          // 試験続行中 - 次の試合番号を表示
          const nextMatch = promotionExam.wins + promotionExam.losses + 1;
          const mLabel = getMatchLabel(promotionExam.winsNeeded, promotionExam.level);
          msg += `\n\n⚔ Rank-Up Match (${mLabel})\nGame ${matchNum} ended\n${promotionExam.wins}W ${promotionExam.losses}L (Next: Game ${nextMatch})`;
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
  // もう一度ボタンのラベル（ランクアップマッチ中は「Next Game ▶」）
  const playAgainBtn = document.getElementById('play-again-btn');
  if (promotionExam) {
    playAgainBtn.textContent = 'Next Game ▶';
  } else if (shouldUseReverseMatch()) {
    // 次も Reverse Match になる場合（v41〜）
    playAgainBtn.textContent = 'Next Match ▶';
  } else {
    playAgainBtn.textContent = 'Play Again';
  }
  if (tutorialMiniGame) {
    document.getElementById('result-text').textContent =
      msg + '\n\nTutorial Complete!\nCongratulations!\nYou have mastered the basic rules of ReverStarGo.\nNow try the real game!';
    playAgainBtn.textContent = 'To the Real Game';
  }
  // デイリーチャレンジの場合は「デイリーへ戻る」ボタンを表示
  document.getElementById('back-to-daily-btn').style.display = isDailySetup ? '' : 'none';
  // 棋譜ボタン（プレミアム機能として将来復活予定のため、現在は常に非表示）
  document.getElementById('kifu-btn-row').style.display = 'none';
  document.getElementById('save-game-btn').textContent = '⭐ Save Record';
  document.getElementById('save-game-btn').disabled = false;
  document.getElementById('goto-kifu-btn').style.display = 'none';
  document.getElementById('result-modal').style.display = 'flex';
  // v83: 月コンプ時は結果画面にトロフィー画像を「登場」させる（それ以外は隠す）
  const _resultTrophy = document.getElementById('result-trophy');
  if (_resultTrophy) {
    if (_dailyCelebrateKind === 'month' && _dailyCelebrateMonth) {
      _resultTrophy.src = `trophy/${_dailyCelebrateMonth}.jpg`;
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
