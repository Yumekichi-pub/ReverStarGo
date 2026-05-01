/* ============================================================
   move_quality.js — プレイヤーの「いい手」評価＆表示 (v63 新規)

   仕様:
   - cpuLevel ≥ 3 のみ
   - CPU 対戦 (battleMode === 'cpu') のみ
   - プレイヤーの手 (current === humanColor) のみ
   - 両者合計手数 ≥ 12
   - |黒合計 - 白合計| < 10（接戦時のみ）
   - 候補手数 ≥ 5
   - プレイヤーの手の順位:
       1位 → 1位メッセージ
       2位 → 2位メッセージ
       3位 → 3位メッセージ（候補手 ≥ 7 の時のみ）
   - Lv.3-4: B評価（evaluateMove）
   - Lv.5+:  C評価（negamax 1手読み）

   依存: state (board, captured, humanColor, cpuLevel, battleMode, moveHistory),
         board.js (ALL_CELLS, K, getValidMoves, opp),
         ai.js (evaluateMove, negamax, withMove, bestGPColor)
   ============================================================ */

// ===== メッセージプール =====
const MOVE_QUALITY_MESSAGES = {
  1: ['素晴らしい！', 'お見事！', '最高！', '妙手！', '美しい一手！'],
  2: ['いいね', 'ナイス', 'グッド', '見事', '巧み'],
  3: ['OK', '良い手', 'なかなか', '良し', '堅実']
};

// ===== 定数 =====
// v64: 表示頻度を上げる調整
//   - 石差: 10 → 12（少し開いた接戦も含める）
//   - 候補手による段階制御:
//       3+ → 1位のみ
//       4+ → 1位・2位
//       6+ → 1位・2位・3位
const MQ_MIN_LEVEL = 3;          // この cpuLevel 以上で動作
const MQ_MIN_MOVES = 12;         // 両者合計手数の下限
const MQ_MAX_DIFF  = 12;         // 石差の上限（これ以上開いたら表示しない）
const MQ_MIN_VALID = 3;          // 候補手数の下限（3未満なら全く表示しない）
const MQ_RANK2_VALID = 4;        // 2位を表示するための候補手数下限
const MQ_RANK3_VALID = 6;        // 3位を表示するための候補手数下限

/**
 * プレイヤーの手の品質を評価し、順位を返す。
 * 表示すべきでない場合は null を返す。
 *
 * 重要: この関数は executeMove の冒頭（board[K(q,r,s)] = current より前）で
 * 呼ばれる前提。board の状態は手を打つ前。
 *
 * @param {number} q
 * @param {number} r
 * @param {number} s
 * @param {'black'|'white'} player - 手を打つプレイヤー
 * @returns {number|null} 1, 2, 3 のいずれか、または null
 */
function evaluateMoveQuality(q, r, s, player) {
  // ---- 条件チェック ----
  if (battleMode !== 'cpu') return null;
  if (player !== humanColor) return null;
  if (cpuLevel < MQ_MIN_LEVEL) return null;
  if (isTutorial || tutorialMiniGame) return null;  // チュートリアル中は表示しない

  // 両者合計手数（moveHistory.length）
  if (moveHistory.length < MQ_MIN_MOVES) return null;

  // 合計スコア計算（盤面の石数 + 取った石数）
  let bBoard = 0, wBoard = 0;
  for (const [cq, cr, cs] of ALL_CELLS) {
    const c = board[K(cq, cr, cs)];
    if (c === 'black') bBoard++;
    else if (c === 'white') wBoard++;
  }
  const bTotal = bBoard + captured.black;
  const wTotal = wBoard + captured.white;
  if (Math.abs(bTotal - wTotal) >= MQ_MAX_DIFF) return null;

  // 候補手取得
  const validMoves = getValidMoves(player);
  if (validMoves.length < MQ_MIN_VALID) return null;

  // 全候補手のスコアリング（Lv に応じて B / C 評価）
  const useC = cpuLevel >= 5;
  const scored = validMoves.map(([mq, mr, ms]) => {
    let score;
    try {
      if (useC) {
        // C評価: 1手読み negamax（深さ1で軽量）
        score = withMove(mq, mr, ms, player, () =>
          -negamax(1, opp(player), -Infinity, Infinity)
        );
      } else {
        // B評価: 既存の evaluateMove（フリップ数 + キャプチャ数）
        score = evaluateMove(mq, mr, ms, player);
      }
    } catch (e) {
      score = -Infinity;  // 評価失敗時は最低評価
    }
    return { move: [mq, mr, ms], score };
  });

  // スコア降順でソート
  scored.sort((a, b) => b.score - a.score);

  // プレイヤーの手の順位を判定
  const playerRank = scored.findIndex(item =>
    item.move[0] === q && item.move[1] === r && item.move[2] === s
  ) + 1;  // 1-indexed

  if (playerRank <= 0 || playerRank > 3) return null;

  // v64: 候補手数による段階制御
  //   3個 → 1位のみ
  //   4-5個 → 1位・2位
  //   6個以上 → 1位・2位・3位
  if (validMoves.length < MQ_RANK2_VALID && playerRank === 2) return null;
  if (validMoves.length < MQ_RANK3_VALID && playerRank === 3) return null;

  return playerRank;
}

/**
 * 順位に対応するメッセージをランダムに返す。
 * @param {number} rank - 1, 2, 3
 * @returns {string|null}
 */
function pickMoveQualityMessage(rank) {
  const pool = MOVE_QUALITY_MESSAGES[rank];
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * 「いい手」トースト表示を実行する。
 * 1.5秒のフェード、盤面の中央上に位置。
 * 効果音 'praise' を控えめに鳴らす。
 *
 * @param {number} rank - 1, 2, 3
 */
function showMoveQuality(rank) {
  const msg = pickMoveQualityMessage(rank);
  if (!msg) return;

  // トースト要素（index.html で事前に定義）
  const toast = document.getElementById('move-quality-toast');
  if (!toast) return;

  // ランクごとに class を切り替え（CSS でスタイル変更）
  toast.className = 'mq-toast mq-rank-' + rank;
  toast.textContent = msg;
  toast.style.display = 'block';

  // 効果音（鳴らす）
  try { playSound('praise'); } catch (e) {}

  // フェードアニメーション（CSS の animation で制御）
  // animation-fill-mode: forwards で最後の状態保持 → 1.5秒後に display:none
  toast.style.animation = 'none';
  // リフロー強制（アニメーション再開のため）
  void toast.offsetWidth;
  toast.style.animation = 'mqFadeInOut 1.5s ease forwards';

  // 1.5秒後に非表示
  setTimeout(() => {
    toast.style.display = 'none';
  }, 1500);
}
