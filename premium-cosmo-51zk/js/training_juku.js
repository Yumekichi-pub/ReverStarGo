/* ============================================================
   training_juku.js — リバースターゴ塾（Premium-v15 新規）

   修行コース中、プレイヤーの手を AI で評価して 3 段階の絵文字
   メッセージを表示する「師匠付き」モード。

   仕様:
   - 修行コース中 (isTrainingMode()) のみ動作
   - プレイヤーの手 (current === humanColor) のみ評価
   - negamax 深さ JUKU_DEPTH で全候補手をスコアリング
   - プレイヤーの手の順位を 3 段階に分類:
     - 上位 1/3 → 「いい手！😊」
     - 中位 1/3 → 「それもあり🙂」
     - 下位 1/3 → 「もう一回考えてみよう🤔」
   - move-quality-toast を流用してフェード表示

   依存:
   - state.js: board, humanColor, battleMode, isTutorial, tutorialMiniGame
   - ai.js: withMove, negamax, opp
   - board.js: getValidMoves
   ============================================================ */

// 探索深さ。Premium-v38: 修行コース別に切替（軽さと精度のバランス）。
//   太陽系 (Lv.6/7): D4 — CPU は d1- / depth=1 なので D4 で十分強く、序盤も軽い
//   銀河系 (Lv.9/10): D5 — CPU が depth=3/4 と強いので D5 で CPU 以上の精度を確保
function getJukuDepth() {
  if (typeof trainingLevel !== 'undefined' && (trainingLevel === 9 || trainingLevel === 10)) {
    return 5;
  }
  return 4;
}

// Premium-v29: 絵文字を撤去し、師匠の表情画像（smile/normal/angry）に統一
const JUKU_MESSAGES = {
  good:   ['いい手！', 'お見事！', '冴えてる', '見事な一手！', 'その調子'],
  normal: ['それもあり', 'まあまあ', 'ふむ', '無難な手', '悪くない'],
  bad:    ['もう一回考えてみよう', '別の手はないかな', 'うーん', '練り直そう', '本当にそれで？']
};

// Premium-v29: 師匠の表情画像（西口さん作）
const JUKU_FACES = {
  good:   'cosmo/smile.png',
  normal: 'cosmo/normal.png',
  bad:    'cosmo/angry.png'
};

const JUKU_DISPLAY_MS = 3500;

// Premium-v36: 表示時間を 3.5 秒に安定化するためのタイマー管理。
// 連続して評価が出た時、前回の setTimeout が新しい表示を消してしまう問題対策。
let _jukuToastTimer = null;

/**
 * プレイヤーの手の品質を評価する（修行コース時のみ）。
 * 表示すべきでない場合は null を返す。
 *
 * 重要: この関数は executeMove の冒頭（board[K(q,r,s)] = current より前）で
 * 呼ばれる前提。board の状態は手を打つ前。
 *
 * @param {number} q - cube 座標
 * @param {number} r - cube 座標
 * @param {number} s - cube 座標
 * @param {'black'|'white'} player - 手を打つプレイヤー
 * @returns {'good'|'normal'|'bad'|null}
 */
function evaluateJukuMove(q, r, s, player) {
  // ---- 条件チェック ----
  if (typeof isTrainingMode !== 'function' || !isTrainingMode()) return null;
  // Premium-v20: 「師匠と修行」モードのみ評価。「実戦」モードでは塾評価しない
  if (typeof trainingMode !== 'undefined' && trainingMode !== 'juku') return null;
  if (battleMode !== 'cpu') return null;
  if (player !== humanColor) return null;
  if (isTutorial || tutorialMiniGame) return null;

  const validMoves = getValidMoves(player);
  if (validMoves.length < 2) return null; // 一択なら評価不要

  // 全候補手を負側 negamax でスコアリング
  const scored = validMoves.map(([mq, mr, ms]) => {
    let score;
    try {
      score = withMove(mq, mr, ms, player, () =>
        -negamax(getJukuDepth(), opp(player), -Infinity, Infinity)
      );
    } catch (e) {
      score = -Infinity;
    }
    return { move: [mq, mr, ms], score };
  });

  // 高スコア順にソート
  scored.sort((a, b) => b.score - a.score);

  // プレイヤーの手の順位（0 始まり）
  const playerRank = scored.findIndex(item =>
    item.move[0] === q && item.move[1] === r && item.move[2] === s
  );
  if (playerRank < 0) return null;

  // 候補手数 N を 3 等分。順位を 3 段階に分類
  // 例: N=9 → good[0,1,2] / normal[3,4,5] / bad[6,7,8]
  // 例: N=5 → good[0,1] / normal[2,3] / bad[4]
  const total = scored.length;
  const goodEnd = Math.ceil(total / 3);
  const normalEnd = Math.ceil(total * 2 / 3);

  if (playerRank < goodEnd) return 'good';
  if (playerRank < normalEnd) return 'normal';
  return 'bad';
}

/**
 * 順位に対応する塾メッセージをランダムに返す。
 * @param {'good'|'normal'|'bad'} kind
 * @returns {string|null}
 */
function pickJukuMessage(kind) {
  const pool = JUKU_MESSAGES[kind];
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * 塾トースト表示を実行する。
 * @param {'good'|'normal'|'bad'} kind
 */
/**
 * Premium-v34: 怒った師匠が出た時の進行確認モーダルを表示する。
 * Promise を返し、ユーザーの選択（'undo' | 'continue'）で resolve する。
 * 「師匠と修行」モード中、bad 評価の手を打った直後に setup.js から呼ばれる。
 * 上の塾トースト（師匠評価メッセージ）はそのまま残しつつ、
 * 盤面下に横並び 2 列のボタンバーを出す。
 * @returns {Promise<'undo'|'continue'>}
 */
function showJukuBadConfirmModal() {
  return new Promise(resolve => {
    const modal = document.getElementById('juku-bad-confirm');
    if (!modal) { resolve('continue'); return; }
    modal.style.display = 'flex';
    const undoBtn = document.getElementById('juku-bad-undo-btn');
    const contBtn = document.getElementById('juku-bad-continue-btn');
    const finish = (choice) => {
      modal.style.display = 'none';
      undoBtn.onclick = null;
      contBtn.onclick = null;
      // 上に出していた塾トーストもここで一緒に閉じる
      const toast = document.getElementById('move-quality-toast');
      if (toast) {
        toast.style.display = 'none';
        toast.innerHTML = '';
        toast.style.animation = 'none';
      }
      resolve(choice);
    };
    undoBtn.onclick = () => finish('undo');
    contBtn.onclick = () => finish('continue');
  });
}

function showJukuToast(kind) {
  const msg = pickJukuMessage(kind);
  if (!msg) return;

  const toast = document.getElementById('move-quality-toast');
  if (!toast) return;

  // Premium-v36: 前回のタイマーが残っていたらキャンセル
  //   （新しい表示を前回タイマーが消してしまう不具合の対策）
  if (_jukuToastTimer) {
    clearTimeout(_jukuToastTimer);
    _jukuToastTimer = null;
  }

  // Premium-v29: 師匠の顔画像 + メッセージを横並びで表示
  const facePath = JUKU_FACES[kind] || '';
  toast.className = 'mq-toast mq-juku-' + kind;
  toast.innerHTML = facePath
    ? `<img src="${facePath}" alt="師匠" class="juku-face">` +
      `<span class="juku-msg">${msg}</span>`
    : msg;
  toast.style.display = 'flex';  // 横並びには flex
  toast.style.animation = 'none';
  void toast.offsetWidth;
  // Premium-v34: bad のときは自動で消さない（怒った師匠ポップアップが閉じる時に一緒に消す）
  if (kind === 'bad') {
    toast.style.opacity = '1';
    return;
  }
  toast.style.animation = `mqFadeInOut ${JUKU_DISPLAY_MS / 1000}s ease forwards`;
  _jukuToastTimer = setTimeout(() => {
    toast.style.display = 'none';
    toast.innerHTML = '';  // 次の表示に備えてクリア
    _jukuToastTimer = null;
  }, JUKU_DISPLAY_MS);
}
