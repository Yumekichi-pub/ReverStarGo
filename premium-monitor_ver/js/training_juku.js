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
  // Premium-v145.4: 探索は師匠専用の正確版を使う（下の _jukuNegamax 参照）。
  //   ai.js の negamax は置換表に上界を正確値として保存してしまい、
  //   対称なはずの手に違う値が付くことがある。評価値ラボと同じ数字にする。
  const scored = validMoves.map(([mq, mr, ms]) => {
    let score;
    try {
      score = withMove(mq, mr, ms, player, () =>
        -_jukuNegamax(getJukuDepth(), opp(player), -Infinity, Infinity)
      );
    } catch (e) {
      score = -Infinity;
    }
    return { move: [mq, mr, ms], score };
  });

  // プレイヤーが打った手の点数
  const mine = scored.find(item =>
    item.move[0] === q && item.move[1] === r && item.move[2] === s
  );
  if (!mine) return null;

  /* Premium-v145.4: 同点は同じ順位にする（評価値ラボと同じ数え方）。

     v145.3 までは sort した並び順の「何番目か」で 3 等分していた。
     リバースターゴは同点の手が非常に多く、たとえば初期局面の D4 では
     9 手のうち 8 手が同じ点になる。並び順で切ると、まったく同じ価値の
     手なのに、前の方は「いい手！」、後ろの方は「もう一回考えてみよう」
     になってしまう。対称な場所で師匠の表情が食い違う原因がこれ。 */
  const better = scored.filter(item => item.score > mine.score).length;
  const rank = better + 1;   // 1 始まり。全部同点なら全員 1 位

  // 候補手数 N を 3 等分して 3 段階に分類
  // 例: N=9 → 1〜3位 いい手 / 4〜6位 それもあり / 7位以下 考え直そう
  const total = scored.length;
  const goodEnd = Math.ceil(total / 3);
  const normalEnd = Math.ceil(total * 2 / 3);

  if (rank <= goodEnd) return 'good';
  if (rank <= normalEnd) return 'normal';
  return 'bad';
}

/* ============================================================
   Premium-v145.4: 師匠専用の探索（置換表を正しく使う版）

   ai.js の negamax は、β カットが起きなくても「best が最初の alpha
   以下だった」場合の値まで正確値として置換表に保存してしまう。それは
   本当の値ではなく上界（これ以下であることは確か）にすぎないので、
   あとで別の枝がその値を引くと、本当より甘い評価が返ることがある。

   初期局面（120°回転対称）で実際に確認できる:
     置換表あり : B2=-24  B6=-24  BX=-16   ← 対称なのに揃わない
     置換表なし : B2=-24  B6=-24  BX=-24   ← 揃う

   評価値ラボ (lab_search.js) の labNegamaxFixed と同じ実装。
   値と一緒に「正確値か・上界か・下界か」を持たせるだけで、評価関数も
   手順も枝刈りも ai.js と同じ。CPU の指し手には一切触らないので、
   師匠の顔だけが正確になり、対戦相手の強さは変わらない。
   ============================================================ */
const _JUKU_TT = new Map();
const _JUKU_TT_MAX = 120000;
const _JUKU_EXACT = 0, _JUKU_LOWER = 1, _JUKU_UPPER = 2;

function _jukuNegamax(depth, player, alpha, beta) {
  if (depth === 0) return evaluateBoardFor(player);

  const alphaOrig = alpha, betaOrig = beta;
  const key = serializeBoard() + ':' + player + ':' + depth;
  const hit = _JUKU_TT.get(key);
  if (hit !== undefined) {
    if (hit.flag === _JUKU_EXACT) return hit.value;
    if (hit.flag === _JUKU_LOWER && hit.value > alpha) alpha = hit.value;
    else if (hit.flag === _JUKU_UPPER && hit.value < beta) beta = hit.value;
    if (alpha >= beta) return hit.value;
  }

  const moves = getValidMoves(player);
  if (moves.length === 0) {
    // パス：盤面はそのままで手番だけ渡す
    return -_jukuNegamax(depth - 1, opp(player), -beta, -alpha);
  }

  // 手順は ai.js と同一（枝刈り効率を揃えるため）
  const ranked = moves.map(([q, r, s]) => ({
    move: [q, r, s],
    pri: positionValue(q, r, s) * 3 + evaluateMove(q, r, s, player)
  })).sort((a, b) => b.pri - a.pri);

  let best = -Infinity;
  for (const { move: [q, r, s] } of ranked) {
    const val = withMove(q, r, s, player, () =>
      -_jukuNegamax(depth - 1, opp(player), -beta, -alpha)
    );
    if (val > best) best = val;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }

  const flag = best <= alphaOrig ? _JUKU_UPPER
             : best >= betaOrig  ? _JUKU_LOWER
             : _JUKU_EXACT;
  if (_JUKU_TT.size >= _JUKU_TT_MAX) _JUKU_TT.delete(_JUKU_TT.keys().next().value);
  _JUKU_TT.set(key, { value: best, flag });
  return best;
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
