/* ============================================================
   setup.js — テーマ・背景色 + ゲーム設定 UI + startGame
   THEMES / BG_COLORS 定義、各種選択ボタンのハンドラ、
   ゲーム開始処理（startGame）を集約。
   依存：state.js（humanColor, cpuLevel 等）, records.js,
          settings.js（saveSettings 等）, navigation.js, sound.js。
   ============================================================ */

const THEMES = {
  green: { bg:'#f5edd8', boardBg:'#e8d8a8', boardBorder:'#c0a858',
           cellFill:'#2d7a45', cellValid:'#48a865', cellStroke:'#1a5c32',
           starStroke:'#4a9a60', starGlow:'rgba(100,200,120,0.25)', notation:'rgba(50,35,10,0.80)' },
  blue:  { bg:'#d8e8f5', boardBg:'#b0c8e8', boardBorder:'#4880c0',
           cellFill:'#1a5a8a', cellValid:'#2a7aaa', cellStroke:'#0a3a6a',
           starStroke:'#2a7ab0', starGlow:'rgba(60,140,220,0.30)',  notation:'rgba(10,30,80,0.85)'  },
  brown: { bg:'#f0e0c0', boardBg:'#d8b880', boardBorder:'#a07030',
           cellFill:'#7a5028', cellValid:'#9a7048', cellStroke:'#5a3010',
           starStroke:'#9a6838', starGlow:'rgba(180,130,60,0.30)',  notation:'rgba(60,35,10,0.85)'  },
  night:  { bg:'#1a1a2e', boardBg:'#20203a', boardBorder:'#3a3a70',
            cellFill:'#1e2850', cellValid:'#2e3870', cellStroke:'#3a3a80',
            starStroke:'#5a5ab0', starGlow:'rgba(90,90,190,0.40)',   notation:'rgba(180,180,255,0.85)'},
  pink:   { bg:'#fde8f2', boardBg:'#f8c8de', boardBorder:'#e070a0',
            cellFill:'#b84878', cellValid:'#d868a0', cellStroke:'#902858',
            starStroke:'#d868a0', starGlow:'rgba(220,100,160,0.30)', notation:'rgba(80,15,40,0.85)'  },
  orange: { bg:'#fef2e0', boardBg:'#fad898', boardBorder:'#e09030',
            cellFill:'#c06020', cellValid:'#e08838', cellStroke:'#984010',
            starStroke:'#e08838', starGlow:'rgba(230,140,40,0.30)',  notation:'rgba(70,30,5,0.85)'   },
  red:    { bg:'#fde8e8', boardBg:'#f8b8b8', boardBorder:'#d04040',
            cellFill:'#9a1818', cellValid:'#c02828', cellStroke:'#780808',
            starStroke:'#c02828', starGlow:'rgba(210,50,50,0.30)',   notation:'rgba(70,8,8,0.85)'    },
  gray:   { boardBg:'#ebebeb', boardBorder:'#c0c0c0',
            cellFill:'#808080', cellValid:'#a0a0a0', cellStroke:'#585858',
            starStroke:'#a8a8a8', starGlow:'rgba(180,180,180,0.30)', notation:'rgba(30,30,30,0.85)'  },
  dark:   { boardBg:'#c8c8c8', boardBorder:'#909090',
            cellFill:'#484848', cellValid:'#686868', cellStroke:'#282828',
            starStroke:'#686868', starGlow:'rgba(100,100,100,0.30)', notation:'rgba(20,20,20,0.85)'  },
};
let currentTheme = THEMES.green;
let currentThemeKey = 'green';

// ===== 背景色設定（星の周りエリア = --board-bg を変更）=====
const BG_COLORS = {
  cream:   '#e8d8a8',  // クリーム（デフォルト）
  ivory:   '#f0ead8',  // アイボリー
  lime:    '#c8e8b8',  // ライム
  sky:     '#b8d8f0',  // スカイ
  lavender:'#d8c8f0',  // ラベンダー
  peach:   '#f0c8d8',  // ピーチ
  yellow:  '#f0e898',  // イエロー
  orange:  '#f0d090',  // オレンジ
  darkbg:  '#252540',  // ダーク
};
let currentBgColor = BG_COLORS.cream;
let currentBgKey = 'cream';
let playerName = ''; // プレイヤー名（空なら「あなた」）
let prevRank = 0; // ゲーム開始前のランク（ランクアップ判定用）

function selectBgColor(name) {
  currentBgKey = name;
  currentBgColor = BG_COLORS[name] || BG_COLORS.cream;
  document.querySelectorAll('[data-bg]').forEach(b => b.classList.remove('selected'));
  document.querySelector(`[data-bg="${name}"]`).classList.add('selected');
  // 星の周りエリア（ボードコンテナ背景）を変更
  document.documentElement.style.setProperty('--board-bg', currentBgColor);
}

function selectSpeed(sp) {
  document.querySelectorAll('[data-speed]').forEach(b => b.classList.remove('selected'));
  document.querySelector(`[data-speed="${sp}"]`).classList.add('selected');
  cpuSpeedLevel = sp;
}
function selectAnim(on) {
  animationsEnabled = on;
  document.querySelectorAll('[data-anim]').forEach(b => b.classList.remove('selected'));
  document.querySelector(`[data-anim="${on ? 1 : 0}"]`).classList.add('selected');
}
function selectTheme(name) {
  currentThemeKey = name;
  currentTheme = THEMES[name] || THEMES.green;
  document.querySelectorAll('[data-theme]').forEach(b => b.classList.remove('selected'));
  document.querySelector(`[data-theme="${name}"]`).classList.add('selected');
  applyTheme();
}
function applyTheme() {
  const s = document.documentElement.style;
  // --board-bg は背景色設定が担当、テーマはボーダー色のみ変更
  s.setProperty('--board-border', currentTheme.boardBorder);
}
function selectNotation(mode) {
  notationMode = mode;
  document.querySelectorAll('[data-notation]').forEach(b => b.classList.remove('selected'));
  document.querySelector(`[data-notation="${mode}"]`).classList.add('selected');
}
function selectHint(enabled) {
  hintEnabled = enabled;
  document.querySelectorAll('[data-hint]').forEach(b => b.classList.remove('selected'));
  document.querySelector(`[data-hint="${enabled ? 'on' : 'off'}"]`).classList.add('selected');
}
function selectBattleMode(mode) {
  battleMode = mode;
  document.querySelectorAll('[data-battle]').forEach(b => b.classList.remove('selected'));
  document.querySelector(`[data-battle="${mode}"]`).classList.add('selected');
  document.getElementById('cpu-level-section').style.display = mode === 'two' ? 'none' : '';
}
function selectSound(enabled) {
  soundEnabled = enabled;
  document.querySelectorAll('[data-sound]').forEach(b => b.classList.remove('selected'));
  document.querySelector(`[data-sound="${enabled ? 'on' : 'off'}"]`).classList.add('selected');
}

// セットアップ画面の選択
function selectColor(color) {
  document.querySelectorAll('[data-color]').forEach(b => b.classList.remove('selected'));
  document.querySelector(`[data-color="${color}"]`).classList.add('selected');
  humanColor = color;
  cpuColor = opp(color);
}
let lockHintTimer = null;
function selectLevel(lv) {
  if (!isLevelUnlocked(lv)) {
    // ロック中のヒントを一時表示
    const btn = document.querySelector(`[data-level="${lv}"]`);
    if (btn) {
      const orig = btn.textContent;
      btn.innerHTML = getLevelUnlockHint(lv);
      btn.style.fontSize = '0.7rem';
      if (lockHintTimer) clearTimeout(lockHintTimer);
      lockHintTimer = setTimeout(() => {
        btn.textContent = orig;
        btn.style.fontSize = '';
      }, 2500);
    }
    return;
  }
  cpuLevel = lv;
  document.querySelectorAll('[data-level]').forEach(b => b.classList.remove('selected'));
  document.querySelector(`[data-level="${lv}"]`).classList.add('selected');
}
/**
 * ゲーム開始処理。盤面・棋譜・履歴のリセット、Reverse Match 適用判定、
 * 昇格試験の引き継ぎ、UI 表示の切り替えなどを一括で行う。
 */
function startGame() {
  saveSettings();
  // 前回の Reverse Match 途中離脱を検知 → 1敗として記録（v44〜）
  handlePendingReverseMatchOnStart();
  prevRank = calculateRank(); // ランクアップ判定用
  // Reverse Match 初期化（v41〜）
  if (shouldUseReverseMatch()) {
    reverseMatch = {
      round: 1,
      round1Result: null,
      initialHumanColor: humanColor
    };
    // 離脱検知用フラグと履歴スタック（v44〜）
    markReverseMatchPending();
    try { history.pushState({reverseMatchActive: true}, '', location.href); } catch(e) {}
  } else {
    reverseMatch = null;
  }
  document.getElementById('setup-game').style.display = 'none';
  initGame();
}

// +N がスコアボックスへ飛んでいくアニメーション
function animateScoreFly(total, player, onArrive) {
  return new Promise(resolve => {
    if (!animationsEnabled) {
      if (onArrive) onArrive();
      resolve();
      return;
    }
    const scoreBox = document.getElementById(player === 'black' ? 'score-black' : 'score-white');
    const boardEl  = document.getElementById('board');
    const boardRect = boardEl.getBoundingClientRect();
    const scoreRect = scoreBox.getBoundingClientRect();

    const startX = boardRect.left + boardRect.width  * 0.5;
    const startY = boardRect.top  + boardRect.height * 0.25;
    const endX   = scoreRect.left + scoreRect.width  * 0.5;
    const endY   = scoreRect.top  + scoreRect.height * 0.5;

    const el = document.createElement('div');
    el.className = 'score-fly';
    el.textContent = `+${total}`;
    el.style.left = `${startX}px`;
    el.style.top  = `${startY}px`;
    document.body.appendChild(el);

    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.left      = `${endX}px`;
      el.style.top       = `${endY}px`;
      el.style.transform = 'translate(-50%, -50%) scale(0.5)';
      el.style.opacity   = '0';
    }));

    const flyDur = 680;
    setTimeout(() => {
      if (onArrive) onArrive(); // 到着と同時にスコア更新
      scoreBox.classList.add('score-hit');
      setTimeout(() => scoreBox.classList.remove('score-hit'), 300);
      el.remove();
      resolve();
    }, flyDur);
  });
}

// 石を1枚ずつ順番にくるっとひっくり返すアニメーション
async function animateFlipSequence(flipped, player) {
  if (!animationsEnabled) {
    // アニメーションOFF：即座に反映
    for (const [fq,fr,fs] of flipped) {
      board[K(fq,fr,fs)] = player;
    }
    render([]);
    return;
  }
  const svg = document.getElementById('board');
  const halfDur = 90; // 片側90ms × 2 = 1枚180ms

  for (const [fq, fr, fs] of flipped) {
    playSound('flip');
    const [cx, cy] = cellToPixel(fq, fr);
    const oldColor = board[K(fq, fr, fs)];

    // オーバーレイ円（元の石の上に重ねて表示）
    const ov = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ov.setAttribute('cx', cx);
    ov.setAttribute('cy', cy);
    ov.setAttribute('r', HEX_SIZE * 0.58);
    ov.setAttribute('fill', oldColor === 'black' ? '#111' : '#f4f4f4');
    ov.setAttribute('stroke', oldColor === 'black' ? '#555' : '#aaa');
    ov.setAttribute('stroke-width', '1.5');
    ov.style.pointerEvents = 'none';
    ov.style.transformBox = 'fill-box';
    ov.style.transformOrigin = 'center';
    ov.style.animation = `flipHalf1 ${halfDur}ms ease-in forwards`;
    svg.appendChild(ov);

    await new Promise(r => setTimeout(r, halfDur));

    // 色を新しい色に切り替えて反対側に展開
    ov.setAttribute('fill', player === 'black' ? '#111' : '#f4f4f4');
    ov.setAttribute('stroke', player === 'black' ? '#555' : '#aaa');
    ov.style.animation = 'none';
    ov.getBoundingClientRect(); // リフロー強制（アニメーションリセット）
    ov.style.animation = `flipHalf2 ${halfDur}ms ease-out forwards`;

    await new Promise(r => setTimeout(r, halfDur));

    // ボード状態を更新（オーバーレイはそのまま残して正しい色を表示）
    board[K(fq, fr, fs)] = player;
  }

  // 全ひっくり返し完了後にrenderで確定表示（オーバーレイも消去）
  render([]);
}

// 手を実行する（取り除きアニメーション付き）
/**
 * 手を実際に盤面へ反映する。石を置く・ひっくり返す・囲み取り・棋譜記録・
 * boardHistory 更新（スーパーコウ用）・current 切替・updateGame 再呼出までを担当。
 * アニメーションも同期的に await する（animationsEnabled=false のときは即時）。
 * @param {number} q - 着手位置 cube 座標
 * @param {number} r - 着手位置 cube 座標
 * @param {number} s - 着手位置 cube 座標
 * @param {'black'|'white'|null} gpColor - GP コール色（CP 経由時、それ以外は null）
 */
async function executeMove(q, r, s, gpColor) {
  isAnimating = true;
  gameStarted = true;         // ゲームが開始された
  pendingMoveMarker = null;   // GP選択中の仮マーカーをクリア
  lastMove = [q, r, s];       // 置いた場所を記録
  showPlacedAnim = true;      // 次のrenderでポップ＆グローを発火
  try {
    // コウ判定用：手を打つ前のボード状態を記録
    prevBoardSnapshot = serializeBoard();

    // Rule 4: 既存囲み保護用に手を打つ前のボード状態を保存
    const preBoardSnap = snapshotBoardForCapture();
    // 手を打つ前にCPが既に囲まれていたか記録（今の手で初めて囲まれた場合のみ自動配置）
    const gpWasAlreadySurrounded = DIRS.every(([dq,dr,ds]) => board[K(dq,dr,ds)] === current);

    // a. 石を置く
    board[K(q,r,s)] = current;
    playSound('place');
    showPlacedAnim = animationsEnabled;
    render([]);

    // b. コールがあればCP石をフリップ前に配置
    const gpK = K(0,0,0);
    if (gpColor && board[gpK] === null) board[gpK] = gpColor;

    // c. フリップ（CP参加）
    const flipped = getFlippable(q,r,s,current,gpColor);
    await animateFlipSequence(flipped, current);

    // d. フリップ後、CPが空で新たに囲まれた場合 → 相手石を自動配置
    if (board[gpK] === null && !gpWasAlreadySurrounded &&
        DIRS.every(([dq,dr,ds]) => board[K(dq,dr,ds)] === current)) {
      board[gpK] = opp(current);
      render([]);
    }

    // e. 取り除き判定（CP参加 / Rule 4 で既存囲みを除外）
    const groups = filterRealCaptures(findCaptureGroups(current), preBoardSnap);

    if (groups.length > 0) {
      const allCaptured = groups.flat();
      let total = 0;

      for (const [cq,cr,cs] of allCaptured) {
        playSound('capture');
        if (animationsEnabled) {
          capturePending = new Set([K(cq,cr,cs)]);
          render([]);
          await new Promise(r => setTimeout(r, 750));
        }
        board[K(cq,cr,cs)] = null;
        capturePending.clear();
        total++;
        if (animationsEnabled) {
          render([]);
          await new Promise(r => setTimeout(r, 100));
        }
      }

      // +N がスコアへ飛んでいく演出（到着時にスコア加算＆表示更新）
      if (total > 0) await animateScoreFly(total, current, () => {
        if (current === 'black') captured.black += total;
        else captured.white += total;
        updateScore();
      });
    }

    // f. CPにまだ石が残っていたらリセット
    if (board[gpK] !== null) board[gpK] = null;

    // g. スーパーコウ判定用：局面を履歴に追加
    boardHistory.push(serializeBoard());  // ポジショナル式（盤面のみ）

    // 安全装置 — 100 手超えは異常ループとみなして強制終局
    // （盤面は 37 マス、通常 30〜50 手で終局。100 手 = 明らかに異常）
    if (boardHistory.length > SAFETY_MAX_BOARD_HISTORY) {
      console.warn('[SAFETY] boardHistory > 100 手 — 強制終局');
      isAnimating = false;
      endGame();
      return;
    }

    // 棋譜記録（gpCallは実際にCP選択が必要だった場合のみtrue）
    const moveNum = moveHistory.filter(m => m.type === 'move').length + 1;
    const wasGPCall = gpColor !== null && gpWasAlreadySurrounded === false
      && DIRS.every(([dq,dr,ds]) => board[K(dq,dr,ds)] !== null);
    moveHistory.push({
      num: moveNum, player: current, q, r, s, gpColor,
      gpCall: gpColor !== null && !gpWasAlreadySurrounded,
      type: 'move',
      boardAfter: serializeBoard(),
      capturedAfter: { black: captured.black, white: captured.white },
      flipped: flipped.length,
      captured: groups.length > 0 ? groups.flat().filter(([cq,cr,cs]) => !(cq === 0 && cr === 0 && cs === 0 && gpWasAlreadySurrounded)).length : 0
    });

    current = opp(current);
    await updateGame(true);
  } finally {
    isAnimating = false;
  }
}

// 現在のプレイヤーがCPUかどうか
function isCpuTurn() {
  return battleMode === 'cpu' && current === cpuColor;
}

// プレイヤー色ラベル
function colorLabel(color) {
  const name = color === 'black' ? '黒' : '白';
  if (battleMode === 'two') return name;
  return color === cpuColor ? `${name}（CPU）` : name;
}

// 2人対戦用ターン交代オーバーレイ（画面タップで続行）
function showTurnModal() {
  return new Promise(resolve => {
    const icon = current === 'black' ? '⚫' : '⚪';
    const name = current === 'black' ? '黒' : '白';
    document.getElementById('turn-modal-msg').textContent = `次は${icon}${name}の番です。`;
    const modal = document.getElementById('turn-modal');
    modal.style.display = 'flex';
    const handler = () => {
      modal.style.display = 'none';
      modal.removeEventListener('click', handler);
      resolve();
    };
    modal.addEventListener('click', handler);
  });
}

// CPUのターンを実行
/**
 * CPU の手番処理。コウルール ②③④ の判定、思考時間（速度設定連動）、
 * 最善手選択（cpuChooseMove）、executeMove までを一括で担当。
 * 安全弁（moveHistory > SAFETY_MAX_MOVES）と診断ログも内蔵。
 */
async function cpuPlay() {
  // 安全弁①（cpuPlay 冒頭） — moveHistory ベース
  // boardHistory は pass を含まない & executeMove 内でしかチェックしないため、
  // パス混じりのコウループで閾値に届きにくい。moveHistory は pass も含むので堅い。
  if (moveHistory.length > SAFETY_MAX_MOVES) {
    console.warn(`[SAFETY] cpuPlay: moveHistory=${moveHistory.length} > 80 — 強制終局`);
    isAnimating = false;
    endGame();
    return;
  }
  // 診断ログ（20 手ごと）
  if (moveHistory.length > 0 && moveHistory.length % DIAG_LOG_INTERVAL === 0) {
    console.log(`[DIAG cpuPlay] move=${moveHistory.length}, boardHist=${boardHistory.length}, prevKoEx=${prevKoException}, current=${current}`);
  }
  const allValid = getValidMoves(current);
  const nonKo = filterKoMoves(allValid, current);
  // コウルール ②③④ の完全実装
  // ② 例外:    通常手がないがコウ手があれば例外として全手から選ぶ
  // ③ 例外後:  直前にコウ例外があれば自分は例外を使えない
  // ④ 終局:    自分にコウ例外必要 + 直前もコウ例外 → 連続コウ例外で終局
  const needsKoException = nonKo.length === 0 && allValid.length > 0;

  // ルール④: 連続コウ例外を検出して終局
  // showPassModal を呼ばない（自動テストで詰まる原因を回避）
  if (needsKoException && prevKoException) {
    console.log('[KO-RULE-④] 連続コウ例外で終局 (cpuPlay)');
    endGame();
    return;
  }

  // ルール③: 直前にコウ例外があれば自分は例外を使えない
  const koException = needsKoException && !prevKoException;

  const validMoves = koException ? allValid : nonKo;
  // 有効手なし → updateGameのパス処理に委ねる
  if (validMoves.length === 0) {
    console.log(`[DIAG cpuPlay] validMoves=0, delegating to updateGame: cur=${current}, mv=${moveHistory.length}, prevKoEx=${prevKoException}`);
    // パス時に prevKoException をリセットしない（ルール④ の連鎖検知のため）
    await updateGame();
    console.log(`[DIAG cpuPlay] updateGame returned (from validMoves=0 branch): cur=${current}, mv=${moveHistory.length}`);
    return;
  }

  // 思考中表示
  showTurn(`${colorLabel(current)} 考え中...`);
  render([]); // ヒント非表示

  // 思考時間（速度設定に連動）
  // animationsEnabled=false（自動テスト想定）のときは思考待ちを 0 に。
  // これが無いと 1 手 350-550ms × 60-70 手 で 30 秒タイムアウトに抵触する。
  const thinkTime = !animationsEnabled ? 0
                  : cpuSpeedLevel === 3 ? 350 + nextRandom() * 200
                  : cpuSpeedLevel === 1 ? 2500 + nextRandom() * 1000
                  :                       1000 + nextRandom() * 500;
  if (thinkTime > 0) await new Promise(r => setTimeout(r, thinkTime));

  // 今回の手がコウ例外だったかを executeMove の前に記録（両者連続検知用）
  // （executeMove 内で updateGame → 次ターン cpuPlay が起動するため、先に設定しないと内部で古い値を見る）
  prevKoException = koException;

  try {
    const chosen = cpuChooseMove(validMoves, current);
    const [q, r, s] = chosen || validMoves[0]; // フォールバック
    const gp = pickNonKoGPColor(q, r, s, current);
    await executeMove(q, r, s, gp);
  } catch(e) {
    console.error('CPU手選択エラー:', e);
    // エラー時はランダムな有効手でフォールバック
    const [q, r, s] = validMoves[Math.floor(nextRandom() * validMoves.length)];
    const gp = pickNonKoGPColor(q, r, s, current);
    await executeMove(q, r, s, gp);
  }
}

// CPUのCPコール色選択（コウにならない色を優先）
function pickNonKoGPColor(q, r, s, player) {
  const defaultColor = bestGPColor(q, r, s, player);
  if (!prevBoardSnapshot) return defaultColor;
  if (!needsGPCall(q, r, s, player)) return defaultColor;
  const nonKo = getNonKoGPColors(q, r, s, player);
  // 両方コウ（例外ルールで許可） → 通常の最適色
  if (nonKo.length === 0) return defaultColor;
  // デフォルト色が非コウに含まれていればそれを使用
  if (nonKo.includes(defaultColor)) return defaultColor;
  // そうでなければ非コウの色を選ぶ
  return nonKo[0];
}

// パス表示（人間もCPUも同じモーダルで確認）
function showPassModal(message) {
  return new Promise(resolve => {
    const pm = document.getElementById('pass-modal');
    pm.querySelector('p').textContent = message;
    document.getElementById('pass-ok').textContent = 'OK';
    pm.style.display = 'flex';
    document.getElementById('controls').style.display = 'none';
    const handler = () => {
      pm.style.display = 'none';
      document.getElementById('controls').style.display = '';
      document.getElementById('pass-ok').removeEventListener('click', handler);
      resolve();
    };
    document.getElementById('pass-ok').addEventListener('click', handler);
  });
}

/**
 * 1 ターンごとの状態更新と終局判定を行う。
 * コウルール ②（例外）③（例外後）④（連続終局）の中核判定、
 * 両者打てない時の終局、片方のみパス時の処理、CPU/人間ターンへの分岐を担当。
 * @param {boolean} [showTurnChange=false] - 2人対戦モードで「次は◯のターンです」を表示するか
 */
async function updateGame(showTurnChange = false) {
  if (isTutorial) { render([]); return; }

  // 安全弁②（updateGame 冒頭） — moveHistory ベース
  // cpuPlay を経由しないパスループでも確実に止める
  if (moveHistory.length > SAFETY_MAX_MOVES) {
    console.warn(`[SAFETY] updateGame: moveHistory=${moveHistory.length} > 80 — 強制終局`);
    isAnimating = false;
    endGame();
    return;
  }

  const allValidNow = getValidMoves(current);
  const validNow = filterKoMoves(allValidNow, current);
  const allValidOpp = getValidMoves(opp(current));
  const validOpp = filterKoMoves(allValidOpp, opp(current));

  // コウルール ②③④ の完全実装
  // ② 例外: 通常手がないがコウ手がある場合はコウ手を許可
  // ③ 例外後: 直前にコウ例外があれば、現プレイヤーは例外を使えない
  // ④ 終局:  自分にコウ例外必要 + 直前もコウ例外 → 連続コウ例外で終局
  const needsKoExceptionNow = validNow.length === 0 && allValidNow.length > 0;
  const needsKoExceptionOpp = validOpp.length === 0 && allValidOpp.length > 0;

  // ルール④: 連続コウ例外を検出して終局
  // showPassModal を呼ばない（自動テストで詰まる原因を回避）。endGame の結果モーダルで十分
  if (needsKoExceptionNow && prevKoException) {
    console.log('[KO-RULE-④] 連続コウ例外で終局 (updateGame)');
    render([]);
    endGame();
    return;
  }

  // ルール③: 直前にコウ例外があれば自分は例外を使えない
  const koExceptionNow = needsKoExceptionNow && !prevKoException;
  const koExceptionOpp = needsKoExceptionOpp;  // 相手側は次ターンで再判定
  const effectiveNow = koExceptionNow ? allValidNow : validNow;
  const effectiveOpp = koExceptionOpp ? allValidOpp : validOpp;

  if (effectiveNow.length === 0 && effectiveOpp.length === 0) {
    console.log(`[DIAG updateGame] both-pass branch: mv=${moveHistory.length}, cur=${current}, stones=${Object.values(board).filter(v => v !== null).length}`);
    render([]);
    // 盤面が埋まっている場合はパス表示なしで即終了
    const boardFull = ALL_CELLS.every(([q,r,s]) =>
      (q===0 && r===0 && s===0) || board[K(q,r,s)] !== null
    );
    if (!boardFull) {
      console.log(`[DIAG updateGame] both-pass: showing 1st passModal (${colorLabel(current)})`);
      // 空きマスあり → 順番にパス表示してから終了
      await showPassModal(`${colorLabel(current)}は置けません`);
      console.log(`[DIAG updateGame] both-pass: 1st passModal resolved`);
      current = opp(current);
      render([]);
      console.log(`[DIAG updateGame] both-pass: showing 2nd passModal (${colorLabel(current)})`);
      await showPassModal(`${colorLabel(current)}は置けません`);
      console.log(`[DIAG updateGame] both-pass: 2nd passModal resolved`);
    }
    console.log(`[DIAG updateGame] both-pass: calling endGame()`);
    endGame();
    return;
  }
  if (effectiveNow.length === 0) {
    console.log(`[DIAG updateGame] one-pass branch: mv=${moveHistory.length}, cur=${current}, effectiveOpp=${effectiveOpp.length}, prevKoEx=${prevKoException}`);
    // 片方だけ置けない → パス表示 → 次へ
    // パス時に prevKoException をリセットしない
    // 理由: ルール④「コウ例外しか打てない状態が"続く"」を検知するには、
    //       パスを挟んでも前のコウ例外フラグを保持する必要がある
    render([]);
    // 棋譜にパス記録
    moveHistory.push({
      num: 0, player: current, q: 0, r: 0, s: 0, gpColor: null,
      type: 'pass',
      boardAfter: serializeBoard(),
      capturedAfter: { black: captured.black, white: captured.white }
    });
    console.log(`[DIAG updateGame] one-pass: showing passModal (${colorLabel(current)})`);
    await showPassModal(`${colorLabel(current)}は置けません`);
    console.log(`[DIAG updateGame] one-pass: passModal resolved, switching to ${colorLabel(opp(current))}`);
    current = opp(current);
    await updateGame(true);
    return;
  }

  if (battleMode === 'two' && showTurnChange) {
    await showTurnModal();
  }

  if (isCpuTurn()) {
    await cpuPlay();
  } else {
    // 3色ドットシステム: 黄=通常, オレンジ=CPコール制限, 赤=コウブロック
    const koRestrictedSet = new Set();
    for (const [vq, vr, vs] of validNow) {
      if (needsGPCall(vq, vr, vs, current)) {
        const nonKo = getNonKoGPColors(vq, vr, vs, current);
        if (nonKo.length < 2) koRestrictedSet.add(K(vq, vr, vs));
      }
    }
    // コウでブロックされたセル（赤ドット）
    const koBlockedMoves = allValidNow.filter(([vq,vr,vs]) =>
      !validNow.some(([q,r,s]) => q===vq && r===vr && s===vs)
    );
    render(koExceptionNow ? allValidNow : validNow, koRestrictedSet, koBlockedMoves);
  }
}

// セッション勝敗カウント表示
function updateSessionScore() {
  const el = document.getElementById('session-score');
  el.style.display = 'flex';
  if (battleMode === 'two') {
    document.getElementById('session-black').textContent = `⚫黒 ${sessionWins.black}勝`;
    document.getElementById('session-white').textContent = `⚪白 ${sessionWins.white}勝`;
  } else {
    const youColor = humanColor;
    const cpuColor2 = opp(humanColor);
    document.getElementById('session-black').textContent =
      `${youColor === 'black' ? getPlayerName() : 'CPU'} ${sessionWins[youColor]}勝`;
    document.getElementById('session-white').textContent =
      `${cpuColor2 === 'white' ? 'CPU' : getPlayerName()} ${sessionWins[cpuColor2]}勝`;
  }
}
