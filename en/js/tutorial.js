/* ============================================================
   tutorial.js — チュートリアル状態 + 制御
   初心者向け 7 ステップのチュートリアル（見る/体験 モード）。
   ステップ進行、ターゲット表示、ミニゲーム、入力検証など。
   - 状態: isTutorial, tutorialMode, tutorialStep ほか 6 個
   - 定数: TUTORIAL_STEPS（7 ステップの説明テキスト）
   - 関数: startTutorial / next・prev / showMessage / etc.
   依存：state.js（board, current 等）、render.js、setup.js、
          board.js（getValidMoves 等）。
   ============================================================ */

// ===== チュートリアル =====
let isTutorial = false;          // チュートリアル中フラグ
let tutorialMode = null;         // 'play'=体験, 'watch'=見る
let tutorialStep = 0;            // 現在のステップ (0-indexed)
let tutorialAutoTimer = null;    // 見るモード用タイマー
let tutorialTarget = null;       // 体験モード用ターゲットセル [q,r,s]
let tutorialWaiting = false;     // プレイヤー入力待ち
let tutorialMiniGame = false;    // ミニゲーム中フラグ
let tutorialSubStep = 0;         // Step 5用サブステップ(0=自由選択, 1=残り)
let tutorialFirstGPCall = null;  // Step 5で最初に選んだ色

// ===== チュートリアル制御 =====
const TUTORIAL_STEPS = [
  { title: 'Step 1 / 7', message: 'The ReverStarGo board\nis shaped like a star.\nIt has 37 cells in total.\nThe purple cell at the center\nis the Core Point (CP).' },
  { title: 'Step 2 / 7', message: 'You can only place a stone\nwhere you can sandwich\nyour opponent\'s stones.\nYellow dots show valid spots.\nTry placing on the glowing cell!' },
  { title: 'Step 3 / 7', message: 'When you sandwich opponent stones,\nthey flip to your color.\nThere are 6 sandwich directions.\nNow try sandwiching!' },
  { title: 'Step 4 / 7', message: 'ReverStarGo has a special rule\nnot found in Reversi!\nWhen you completely surround\nopponent stones with your own,\nyou can capture them.\nCaptured stones add to your points.\nCaptured cells can be reused.\nNow try surrounding to capture!' },
  { title: 'Step 5 / 7', message: 'The purple cell at the center\nis the Core Point (CP).\nThe CP is special and\ncan be either color.\nWhen you use the CP to sandwich,\nyou must call "Black" or "White"\nright after placing your stone.\nThe call color changes the flip result.\nChoose "Black" or "White"!' },
  { title: 'Step 6 / 7', message: 'There are 3 game-end conditions:\n① All 37 cells are filled\n② Neither player has valid moves\n③ Ko prevents progress\n\nThe winner is decided by total points:\nstones on the board + captured stones.\nThe player with more points wins!' },
  { title: 'Step 7 / 7', message: 'Great job!\nYou\'ve learned all the rules.\nNow practice with a mini-game!\nYour opponent is a very weak Lv.1 CPU.\n\nYellow dots show where\nyou can place stones.\nIf stuck, use the ❓ button\nto review the rules.\n\nEnjoy the game freely!' },
];

function showTutorialChoice() {
  document.getElementById('tutorial-choice').style.display = 'flex';
}
function hideTutorialChoice() {
  document.getElementById('tutorial-choice').style.display = 'none';
}

function startTutorial(mode) {
  tutorialMode = mode;
  isTutorial = true;
  tutorialStep = 0;
  // v61: チュートリアル中の body 下余白を有効化（コール選択ボタンが tutorial-bar に隠れないため）
  document.body.classList.add('tutorial-active');
  hideTutorialChoice();
  document.getElementById('setup-main').style.display = 'none';
  document.getElementById('setup-game').style.display = 'none';

  // ゲーム画面を表示（空の盤面で）
  initTutorialBoard();
  showTutorialStep();
}

let savedNotationMode = null;  // チュートリアル中のnotation退避用

function initTutorialBoard() {
  // notation表示を一時的にオフ
  if (savedNotationMode === null) savedNotationMode = notationMode;
  notationMode = 0;

  // 空の盤面を作成
  board = {};
  for (const [q, r, s] of ALL_CELLS) board[K(q, r, s)] = null;
  captured = { black: 0, white: 0 };
  current = 'black';
  lastMove = null;
  prevBoardSnapshot = null;
  boardHistory = [];
  prevKoException = false;  // コウ例外連続検知フラグもリセット
  undoSnapshot = null;
  isAnimating = false;

  // UI表示
  document.getElementById('game-status-row').style.display = 'flex';
  document.getElementById('board-container').style.display = 'block';
  document.getElementById('controls').style.display = 'none';  // 通常の操作ボタンは非表示
  document.getElementById('score-black').style.display = 'none';
  document.getElementById('score-white').style.display = 'none';
  document.getElementById('session-score').style.display = 'none';
  document.getElementById('result-modal').style.display = 'none';

  showTurn('Tutorial');
  document.getElementById('level-badge').textContent = '';

  render([]);
}

function showTutorialStep() {
  const step = TUTORIAL_STEPS[tutorialStep];
  const bar = document.getElementById('tutorial-bar');
  bar.style.display = 'flex';
  document.getElementById('tutorial-step-info').textContent = step.title;
  document.getElementById('tutorial-message').textContent = step.message;

  // 戻るボタンの制御
  document.getElementById('tutorial-prev-btn').style.display =
    tutorialStep === 0 ? 'none' : 'inline-block';

  // 次へボタンのラベル
  const nextBtn = document.getElementById('tutorial-next-btn');
  if (tutorialStep === TUTORIAL_STEPS.length - 1) {
    nextBtn.textContent = 'Return to Setup';
  } else {
    nextBtn.textContent = 'Next';
  }

  // ステップごとの盤面セットアップ（フェーズ2以降で実装）
  setupTutorialStepBoard(tutorialStep);
}

function setupTutorialStepBoard(step) {
  if (tutorialAutoTimer) { clearTimeout(tutorialAutoTimer); tutorialAutoTimer = null; }
  tutorialTarget = null;
  tutorialWaiting = false;
  document.getElementById('tutorial-feedback').textContent = '';

  // 盤面クリア
  for (const [q, r, s] of ALL_CELLS) board[K(q, r, s)] = null;
  captured = { black: 0, white: 0 };
  current = 'black';
  lastMove = null;
  isAnimating = false;
  capturePending = new Set();
  showPlacedAnim = false;

  // Step 4以降はスコアパネル表示
  document.getElementById('score-black').style.display = step >= 3 ? '' : 'none';
  document.getElementById('score-white').style.display = step >= 3 ? '' : 'none';
  if (step >= 3) {
    document.getElementById('black-role').textContent = '';
    document.getElementById('white-role').textContent = '';
    updateScore();
  }

  if (step === 0) {
    // Step 1: 盤面の説明 — CP強調
    render([]);
    addTutorialCPGlow();

  } else if (step === 1) {
    // Step 2: 石の置き方
    board[K(1,0,-1)] = 'white';
    board[K(2,-1,-1)] = 'black';
    tutorialTarget = [0, 1, -1];

    if (tutorialMode === 'play') {
      tutorialWaiting = true;
      render([[0, 1, -1]]);
      addTutorialTargetPulse(0, 1, -1);
    } else {
      disableTutorialNext();
      render([[0, 1, -1]]);
      addTutorialTargetPulse(0, 1, -1);
      tutorialAutoTimer = setTimeout(() => tutorialAutoMove(0, 1, -1, 'Stone placed!', 3000), 3000);
    }

  } else if (step === 2) {
    // Step 3: ひっくり返す（2個フリップ）
    board[K(-1,2,-1)] = 'black';
    board[K(0,1,-1)] = 'white';
    board[K(1,0,-1)] = 'white';
    tutorialTarget = [2, -1, -1];

    if (tutorialMode === 'play') {
      tutorialWaiting = true;
      render([[2, -1, -1]]);
      addTutorialTargetPulse(2, -1, -1);
    } else {
      disableTutorialNext();
      render([[2, -1, -1]]);
      addTutorialTargetPulse(2, -1, -1);
      tutorialAutoTimer = setTimeout(() => tutorialAutoMove(2, -1, -1, 'Flipped 2 stones!', 5000), 3000);
    }

  } else if (step === 3) {
    // Step 4: 囲んで取る
    // [-2,1,1]に黒を置く → [-1,1,0]白がフリップで黒に → [-1,2,-1]白が完全に囲まれて捕獲
    board[K(-1,2,-1)] = 'white';  // 囲まれて取られる石（6時方向）
    board[K(-1,1,0)]  = 'white';  // フリップで黒になる石（7時方向）
    board[K(0,1,-1)]  = 'black';  // サンドイッチの端（5時方向）
    board[K(0,2,-2)]  = 'black';  // 囲みの一部
    board[K(-1,3,-2)] = 'black';  // 囲みの一部（下端）
    board[K(-2,3,-1)] = 'black';  // 囲みの一部（下端）
    board[K(-2,2,0)]  = 'black';  // 囲みの一部
    tutorialTarget = [-2, 1, 1];
    updateScore();

    if (tutorialMode === 'play') {
      tutorialWaiting = true;
      render([[-2, 1, 1]]);
      addTutorialTargetPulse(-2, 1, 1);
    } else {
      disableTutorialNext();
      render([[-2, 1, 1]]);
      addTutorialTargetPulse(-2, 1, 1);
      tutorialAutoTimer = setTimeout(() => tutorialAutoCapture(-2, 1, 1), 3000);
    }

  } else if (step === 4) {
    // Step 5: CPのルール（サブステップ対応）
    // 白[-1,1,0]（CP左下）、白[1,-1,0]（CP右上手前）、黒[2,-2,0]（CP右上奥）
    board[K(-1,1,0)] = 'white';
    board[K(1,-1,0)] = 'white';
    board[K(2,-2,0)] = 'black';
    tutorialTarget = [-2, 2, 0];
    updateScore();

    setupTutorialStep5UI();

    if (tutorialMode === 'play') {
      tutorialWaiting = true;
      render([[-2, 2, 0]]);
      addTutorialTargetPulse(-2, 2, 0);
      addTutorialCPGlow();
    } else {
      disableTutorialNext();
      render([[-2, 2, 0]]);
      addTutorialTargetPulse(-2, 2, 0);
      addTutorialCPGlow();
      const gpColor = tutorialSubStep === 0 ? 'black' : 'white';
      tutorialAutoTimer = setTimeout(async () => {
        const flipCount = getFlippable(-2, 2, 0, 'black', gpColor).length;
        await executeMove(-2, 2, 0, gpColor);
        const colorLabel = gpColor === 'black' ? 'Black' : 'White';
        if (tutorialSubStep === 0) {
          tutorialFirstGPCall = gpColor;
          showTutorialFeedback(`${colorLabel} call: ${flipCount} stones flipped!`);
          tutorialAutoTimer = setTimeout(() => {
            tutorialSubStep = 1;
            setupTutorialStepBoard(4);
            const otherLabel = gpColor === 'black' ? 'White' : 'Black';
            document.getElementById('tutorial-message').textContent =
              `Now call "${otherLabel}".\nThe call color\nchanges the flip result.`;
            document.getElementById('tutorial-step-info').textContent = `Step 5 / 7 (${otherLabel} call)`;
          }, 4000);
        } else {
          showTutorialFeedback(`${colorLabel} call: ${flipCount} stones flipped!\nThe call color changes the result!`);
          document.getElementById('gp-black').style.display = '';
          document.getElementById('gp-white').style.display = '';
          tutorialSubStep = 0;
          tutorialFirstGPCall = null;
          tutorialAutoTimer = setTimeout(() => tutorialNext(), 5000);
        }
      }, 3000);
    }

  } else if (step === 5) {
    // Step 6: 勝敗のルール — サンプル終了盤面
    const ring1 = [[1,-1,0],[1,0,-1],[0,1,-1],[-1,1,0],[-1,0,1],[0,-1,1]];
    ring1.forEach(([q,r,s], i) => board[K(q,r,s)] = i % 2 === 0 ? 'black' : 'white');
    // ring2
    [[2,-2,0],[2,-1,-1],[0,2,-2],[-2,0,2],[0,-2,2],[1,-2,1]].forEach(c => board[K(...c)] = 'black');
    [[-1,2,-1],[-2,2,0],[-2,1,1],[2,0,-2],[1,1,-2],[-1,-1,2]].forEach(c => board[K(...c)] = 'white');
    // 腕（一部）
    board[K(3,-1,-2)] = 'black'; board[K(3,-2,-1)] = 'black'; board[K(4,-2,-2)] = 'white';
    board[K(-3,1,2)] = 'white'; board[K(-3,2,1)] = 'black'; board[K(-4,2,2)] = 'black';
    board[K(-1,3,-2)] = 'black'; board[K(-2,3,-1)] = 'white'; board[K(-2,4,-2)] = 'white';
    board[K(1,-3,2)] = 'white'; board[K(2,-3,1)] = 'black'; board[K(2,-4,2)] = 'black';
    board[K(-1,-2,3)] = 'black'; board[K(-2,-1,3)] = 'black'; board[K(-2,-2,4)] = 'white';
    board[K(1,2,-3)] = 'white'; board[K(2,1,-3)] = 'black'; board[K(2,2,-4)] = 'white';

    captured = { black: 2, white: 1 };
    updateScore();
    render([]);

    const bBoard = countOnBoard('black');
    const wBoard = countOnBoard('white');
    const bTotal = bBoard + captured.black;
    const wTotal = wBoard + captured.white;
    const winner = bTotal > wTotal ? 'Black wins!' : wTotal > bTotal ? 'White wins!' : 'Draw!';

    showTurn(`${winner} (Black ${bTotal} vs White ${wTotal})`);

    if (tutorialMode === 'watch') {
      disableTutorialNext();
      tutorialAutoTimer = setTimeout(() => {
        playSound(bTotal > wTotal ? 'win' : wTotal > bTotal ? 'lose' : 'draw');
        showTutorialFeedback(`Stones on board + captured = total points\nBlack: ${bBoard}+${captured.black}=${bTotal}　White: ${wBoard}+${captured.white}=${wTotal}\n${winner}`);
        tutorialAutoTimer = setTimeout(() => tutorialNext(), 5000);
      }, 2000);
    } else {
      setTimeout(() => {
        playSound(bTotal > wTotal ? 'win' : wTotal > bTotal ? 'lose' : 'draw');
        showTutorialFeedback(`Stones on board + captured = total points\nBlack: ${bBoard}+${captured.black}=${bTotal}　White: ${wBoard}+${captured.white}=${wTotal}\n${winner}`);
      }, 1500);
    }

  } else if (step === 6) {
    // Step 7: ミニゲームで練習 — ボタンを「ミニゲーム開始」に変更
    render([]);
    addTutorialCPGlow();
    document.getElementById('tutorial-next-btn').textContent = 'Start Mini Game';
  }
}

// CP強調グロー追加
function addTutorialCPGlow() {
  const svg = document.getElementById('board');
  const [cx, cy] = cellToPixel(0, 0);
  const glow = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  glow.setAttribute('cx', cx);
  glow.setAttribute('cy', cy);
  glow.setAttribute('r', '24');
  glow.setAttribute('fill', 'rgba(180, 80, 255, 0.5)');
  glow.classList.add('tutorial-cp-glow');
  svg.appendChild(glow);
}

// ターゲットセル強調パルス追加
function addTutorialTargetPulse(q, r, s) {
  const svg = document.getElementById('board');
  const [cx, cy] = cellToPixel(q, r);
  const pulse = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  pulse.setAttribute('cx', cx);
  pulse.setAttribute('cy', cy);
  pulse.setAttribute('r', HEX_SIZE * 0.7);
  pulse.setAttribute('fill', 'none');
  pulse.setAttribute('stroke', '#ffe040');
  pulse.setAttribute('stroke-width', '3');
  pulse.classList.add('tutorial-target-pulse');
  svg.appendChild(pulse);
}

// 体験モード：クリック処理
async function handleTutorialClick(q, r, s) {
  if (!tutorialWaiting || !tutorialTarget) return;
  if (q !== tutorialTarget[0] || r !== tutorialTarget[1] || s !== tutorialTarget[2]) return;

  tutorialWaiting = false;

  if (tutorialStep === 1) {
    await executeMove(q, r, s, null);
    showTutorialFeedback('Stone placed!');

  } else if (tutorialStep === 2) {
    const flippable = getFlippable(q, r, s, current, null);
    const flipCount = flippable.length;
    await executeMove(q, r, s, null);
    showTutorialFeedback(`Flipped ${flipCount} stones!`);

  } else if (tutorialStep === 3) {
    // Step 4: 囲んで取る（カスタム処理）
    await tutorialCapture(q, r, s);

  } else if (tutorialStep === 4) {
    // Step 5: CPコール → GPモーダルを表示
    pendingMove = [q, r, s];
    document.getElementById('gp-modal').style.display = 'flex';
    document.getElementById('controls').style.display = 'none';
  }
}

// 囲んで取る：石を置いて→フリップ→捕獲アニメーション
async function tutorialCapture(q, r, s) {
  isAnimating = true;
  board[K(q,r,s)] = 'black';
  playSound('place');
  showPlacedAnim = animationsEnabled;
  lastMove = [q, r, s];
  render([]);

  // まずフリップ（挟んでひっくり返す）
  const flipped = getFlippable(q, r, s, 'black', null);
  await animateFlipSequence(flipped, 'black');

  await new Promise(r => setTimeout(r, 500));

  const groups = findCaptureGroups('black');
  let total = 0;
  for (const group of groups) {
    for (const [cq,cr,cs] of group) {
      playSound('capture');
      if (animationsEnabled) {
        capturePending = new Set([K(cq,cr,cs)]);
        render([]);
        await new Promise(r => setTimeout(r, 750));
      }
      board[K(cq,cr,cs)] = null;
      capturePending.clear();
      total++;
      captured.black += 1;
      if (animationsEnabled) {
        render([]);
        await new Promise(r => setTimeout(r, 100));
      }
    }
  }

  updateScore();
  render([]);
  isAnimating = false;
  showTutorialFeedback(`Captured ${total}! +${total} points!`);
}

// 見るモード：自動捕獲
async function tutorialAutoCapture(q, r, s) {
  await tutorialCapture(q, r, s);
  tutorialAutoTimer = setTimeout(() => tutorialNext(), 5000);
}

// 見るモード：自動で手を打つ
async function tutorialAutoMove(q, r, s, feedbackMsg, nextDelay) {
  await executeMove(q, r, s, null);
  showTutorialFeedback(feedbackMsg);
  tutorialAutoTimer = setTimeout(() => tutorialNext(), nextDelay);
}

// Step 5: GPモーダルのボタン制御
function setupTutorialStep5UI() {
  if (tutorialSubStep === 0) {
    // 1回目：両方表示
    document.getElementById('gp-black').style.display = '';
    document.getElementById('gp-white').style.display = '';
  } else {
    // 2回目：最初に選ばなかった方だけ表示
    const other = tutorialFirstGPCall === 'black' ? 'white' : 'black';
    document.getElementById('gp-black').style.display = other === 'black' ? '' : 'none';
    document.getElementById('gp-white').style.display = other === 'white' ? '' : 'none';
  }
}

// Step 5: GPコール後のサブステップ進行
async function onTutorialGPCallComplete(gpColor, flipCount) {
  const colorLabel = gpColor === 'black' ? 'Black' : 'White';
  const otherLabel = gpColor === 'black' ? 'White' : 'Black';

  if (tutorialSubStep === 0) {
    tutorialFirstGPCall = gpColor;
    showTutorialFeedback(`${colorLabel} call: ${flipCount} stones flipped!\nPress "Next" to try the ${otherLabel} call!`);
  } else {
    showTutorialFeedback(`${colorLabel} call: ${flipCount} stones flipped!\nThe call color changes the result!`);
    // GPモーダルボタンを復元
    document.getElementById('gp-black').style.display = '';
    document.getElementById('gp-white').style.display = '';
    tutorialSubStep = 0;
    tutorialFirstGPCall = null;
  }
}

// フィードバックメッセージ表示
function showTutorialFeedback(msg) {
  document.getElementById('tutorial-feedback').textContent = msg;
  // 見るモード：演出完了後に「次へ」を有効化
  document.getElementById('tutorial-next-btn').disabled = false;
}

// 見るモード：演出中は「次へ」を無効化
function disableTutorialNext() {
  if (tutorialMode === 'watch') {
    document.getElementById('tutorial-next-btn').disabled = true;
  }
}

function tutorialNext() {
  if (tutorialAutoTimer) { clearTimeout(tutorialAutoTimer); tutorialAutoTimer = null; }

  // Step 5: 1回目完了後 → 残りのコールへ切り替え
  if (tutorialStep === 4 && tutorialSubStep === 0 && tutorialFirstGPCall) {
    const otherLabel = tutorialFirstGPCall === 'black' ? 'White' : 'Black';
    tutorialSubStep = 1;
    setupTutorialStepBoard(4);
    document.getElementById('tutorial-message').textContent =
      `Now try "${otherLabel}" on the same board!\nThe call color\nchanges the flip result.`;
    document.getElementById('tutorial-step-info').textContent = `Step 5 / 7 (${otherLabel} call)`;
    return;
  }

  // Step 7: ミニゲーム開始
  if (tutorialStep === 6) {
    startTutorialMiniGame();
    return;
  }

  if (tutorialStep < TUTORIAL_STEPS.length - 1) {
    tutorialStep++;
    showTutorialStep();
  } else {
    exitTutorial();
  }
}

function startTutorialMiniGame() {
  // チュートリアルバーを非表示
  document.getElementById('tutorial-bar').style.display = 'none';

  // チュートリアルモード終了（通常ゲームとして動かす）
  isTutorial = false;
  // v61: tutorial-active 解除（普段は body 下余白なし）
  document.body.classList.remove('tutorial-active');
  tutorialMiniGame = true;

  // 強制設定：Lv.1、黒（先手）、ヒントON、notationオフ
  humanColor = 'black';
  cpuColor = 'white';
  cpuLevel = 1;
  hintEnabled = true;
  battleMode = 'cpu';
  notationMode = 0;

  // 通常UI復元
  document.getElementById('controls').style.display = '';
  document.getElementById('score-black').style.display = '';
  document.getElementById('score-white').style.display = '';

  initGame();

  // ミニゲーム開始オーバーレイ表示
  const tm = document.getElementById('turn-modal');
  const msg = document.getElementById('turn-modal-msg');
  const hint = document.getElementById('turn-modal-hint');
  msg.textContent = '🎮 Mini Game Start!';
  hint.textContent = 'Yellow dots show where you can place stones\nEnjoy the game freely!\n\nTap to start';
  hint.style.whiteSpace = 'pre-line';
  tm.style.display = 'flex';
  tm.onclick = () => { tm.style.display = 'none'; tm.onclick = null; hint.style.whiteSpace = ''; };
}

function tutorialPrev() {
  if (tutorialAutoTimer) { clearTimeout(tutorialAutoTimer); tutorialAutoTimer = null; }
  if (tutorialStep > 0) {
    tutorialStep--;
    showTutorialStep();
  }
}

function exitTutorial() {
  if (tutorialAutoTimer) { clearTimeout(tutorialAutoTimer); tutorialAutoTimer = null; }
  isTutorial = false;
  // v61: tutorial-active 解除（普段は body 下余白なし）
  document.body.classList.remove('tutorial-active');
  tutorialMode = null;
  tutorialStep = 0;
  tutorialSubStep = 0;

  // GPモーダルボタン復元
  document.getElementById('gp-black').style.display = '';
  document.getElementById('gp-white').style.display = '';

  // notation復元
  if (savedNotationMode !== null) { notationMode = savedNotationMode; savedNotationMode = null; }

  // チュートリアルバーを非表示
  document.getElementById('tutorial-bar').style.display = 'none';

  // 通常のUI要素を復元
  document.getElementById('controls').style.display = '';
  document.getElementById('score-black').style.display = '';
  document.getElementById('score-white').style.display = '';

  // 設定画面に戻る
  document.getElementById('setup-main').style.display = 'flex';
}
