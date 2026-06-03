/* ============================================================
   ai.js — AI 探索・評価・トランスポジションテーブル
   1 手読み (evaluateMove) → 多手読み (negamax + α-β枝刈り)
   反復深化 + TT による高速化。決定論モードと整合。
   依存: board, ALL_CELLS, K, opp, getValidMoves など。
   ============================================================ */

// ===== トランスポジションテーブル（AI 探索結果のキャッシュ）=====
// 同じ局面・同じ深さで再度探索されたとき、過去の評価結果を再利用する。
// 各ゲーム開始時（initGame）にクリアされる。サイズ上限到達時は古いものから捨てる。
const transTable = new Map();
const TT_MAX_SIZE = 50000;

// ===== AI ロジック =====

// 手のスコアを評価する（フリップ数＋取り除き数）
/**
 * (q,r,s) に player が打つ手の評価値を計算する（1 手読み用）。
 * 挟んでひっくり返す数 + 囲み取りの数 + ポジション重みの合計。
 * @param {number} q - cube 座標 q
 * @param {number} r - cube 座標 r
 * @param {number} s - cube 座標 s
 * @param {'black'|'white'} player - 手番のプレイヤー
 * @returns {number} 手の評価値（高いほど良い）
 */
function evaluateMove(q, r, s, player) {
  const gp = bestGPColor(q, r, s, player);
  const flips = realFlipCount(q, r, s, player, gp);
  const caps = simulateCaptures(q, r, s, player, gp).split('|').filter(x => x).length;
  return flips + caps;
}

// 位置の戦略的価値（角・辺 = 高得点）
/**
 * セル (q,r,s) のポジション重み（戦略的価値）を返す。
 * 中央のコアポイント周辺は高得点、星の腕先端も高め、その他は低め。
 * 評価関数 evaluateBoardFor の構成要素。
 * @param {number} q - cube 座標 q
 * @param {number} r - cube 座標 r
 * @param {number} s - cube 座標 s
 * @returns {number} そのセルのポジション重み
 */
function positionValue(q, r, s) {
  // 腕の先端（角）は最も価値が高い ― オセロの角と同等
  const tips = [[4,-2,-2],[-4,2,2],[-2,4,-2],[2,-4,2],[-2,-2,4],[2,2,-4]];
  if (tips.some(([tq,tr,ts]) => tq===q && tr===r && ts===s)) return 50;
  // 腕の先端直前2マス
  const armNear = [[3,-1,-2],[3,-2,-1],[-3,1,2],[-3,2,1],[-1,3,-2],[-2,3,-1],[1,-3,2],[2,-3,1],[-1,-2,3],[-2,-1,3],[1,2,-3],[2,1,-3]];
  if (armNear.some(([aq,ar,as]) => aq===q && ar===r && as===s)) return 20;
  // 外周ヘクス（ring2）
  const dist = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
  if (dist === 2) return 8;
  // ring1（CP隣接）
  if (dist === 1) return 2;
  return 1;
}

// 盤面を総合評価（playerの視点で正値=有利）
/**
 * 現在の盤面を player 視点で評価する。
 * 自分の石数 - 相手の石数 + ポジション重み + キャプチャ済み石数差。
 * @param {'black'|'white'} player - 評価視点のプレイヤー
 * @returns {number} player 有利なら正、不利なら負の評価値
 */
function evaluateBoardFor(player) {
  const opponent = opp(player);
  let myPos = 0, oppPos = 0;
  for (const [q,r,s] of ALL_CELLS) {
    const c = board[K(q,r,s)];
    if (c === player) myPos += positionValue(q,r,s);
    else if (c === opponent) oppPos += positionValue(q,r,s);
  }
  // モビリティ（有効手数の多さ）
  const myMob  = getValidMoves(player).length;
  const oppMob = getValidMoves(opponent).length;
  // CP囲みボーナス
  const myGP  = DIRS.every(([dq,dr,ds]) => board[K(dq,dr,ds)] === player)   ? 25 : 0;
  const oppGP = DIRS.every(([dq,dr,ds]) => board[K(dq,dr,ds)] === opponent) ? 25 : 0;
  return (myPos - oppPos) + (myMob - oppMob) * 4 + myGP - oppGP;
}

// 仮に手を適用してevalFnを実行し、ボードを完全スナップショットで確実に復元する
/**
 * 仮想的に (q,r,s) へ着手し、その後の盤面で evalFn を実行して結果を返す。
 * 実行後、盤面は元に戻される（破壊的でない評価）。negamax の再帰探索で使用。
 * @param {number} q - 着手位置の cube 座標
 * @param {number} r - 着手位置の cube 座標
 * @param {number} s - 着手位置の cube 座標
 * @param {'black'|'white'} player - 着手するプレイヤー
 * @param {Function} evalFn - 着手後の盤面で実行する評価関数
 * @returns {*} evalFn の戻り値
 */
function withMove(q, r, s, player, evalFn) {
  const snap = Object.assign({}, board); // 全セルの完全コピー
  // Rule 4: snap を pre-board snapshot として再利用
  const preBoardSnap = snap;
  const gpK = K(0,0,0);
  const gpWasAlreadySurrounded = DIRS.every(([dq,dr,ds]) => board[K(dq,dr,ds)] === player);
  const gp = bestGPColor(q, r, s, player);
  board[K(q,r,s)] = player;
  // CP石をフリップ前に配置
  if (gp && board[gpK] === null) board[gpK] = gp;
  const flipped = getFlippable(q,r,s,player,gp);
  for (const [fq,fr,fs] of flipped) {
    board[K(fq,fr,fs)] = player;
  }
  // 自動囲み：今回初めて囲まれた場合のみ
  if (board[gpK] === null && !gpWasAlreadySurrounded &&
      DIRS.every(([dq,dr,ds]) => board[K(dq,dr,ds)] === player)) {
    board[gpK] = opp(player);
  }
  // Rule 4: 既存囲みを除外した実取り除き
  const groups = filterRealCaptures(findCaptureGroups(player), preBoardSnap);
  for (const group of groups) for (const [cq,cr,cs] of group) {
    board[K(cq,cr,cs)] = null;
  }
  if (board[gpK] !== null) board[gpK] = null; // CPリセット
  const result = evalFn();
  Object.assign(board, snap); // 完全復元（差分管理より確実）
  return result;
}

// Negamax with alpha-beta pruning（currentPlayerの視点でスコアを返す）
/**
 * Negamax 探索 + α-β 枝刈りによる最善手評価。
 * 現在のプレイヤーの観点から、再帰的に最善スコアを計算する。
 * @param {number} depth - 残りの探索深さ（0 で評価関数を呼ぶ）
 * @param {'black'|'white'} currentPlayer - 現在の手番
 * @param {number} alpha - α-β 枝刈りの下限
 * @param {number} beta - α-β 枝刈りの上限
 * @returns {number} currentPlayer から見た最善評価値
 */
function negamax(depth, currentPlayer, alpha, beta) {
  if (depth === 0) return evaluateBoardFor(currentPlayer);

  // TT lookup: 同じ局面・同じ手番・同じ深さなら過去の探索結果を再利用
  const ttKey = serializeBoard() + ':' + currentPlayer + ':' + depth;
  const cached = transTable.get(ttKey);
  if (cached !== undefined) return cached;

  const moves = getValidMoves(currentPlayer);
  if (moves.length === 0) {
    // 有効手なし（パス）: ボード変更せず相手番を再帰
    return -negamax(depth - 1, opp(currentPlayer), -beta, -alpha);
  }

  // 候補手を優先度でソート（alpha-beta効率化）
  const ranked = moves.map(([q,r,s]) => ({
    move:[q,r,s],
    pri: positionValue(q,r,s) * 3 + evaluateMove(q,r,s,currentPlayer)
  })).sort((a,b) => b.pri - a.pri);

  let best = -Infinity;
  let cutOff = false;
  for (const {move:[q,r,s]} of ranked) {
    const val = withMove(q, r, s, currentPlayer, () =>
      -negamax(depth - 1, opp(currentPlayer), -beta, -alpha)
    );
    if (val > best) best = val;
    if (best > alpha) alpha = best;
    if (alpha >= beta) { cutOff = true; break; } // alpha-beta枝刈り
  }

  // TT 記録: α-β カットしなかった場合のみ正確値としてキャッシュ
  if (!cutOff) {
    if (transTable.size >= TT_MAX_SIZE) {
      transTable.delete(transTable.keys().next().value);
    }
    transTable.set(ttKey, best);
  }
  return best;
}

// シミュレーション用：手を仮に打った後の盤面スコア差を返す

// CPUの手を選ぶ
/**
 * CPU の手選択ロジック。レベル別に異なる戦略を使う。
 * Lv.1 はランダム、Lv.2+ は1手読み、Lv.3+ は negamax で多手読み。
 * @param {Array<[number,number,number]>} validMoves - 候補手の cube 座標リスト
 * @param {'black'|'white'} player - 手番のプレイヤー
 * @returns {[number,number,number]} 選んだ手の cube 座標 [q, r, s]
 */
function cpuChooseMove(validMoves, player) {
  if (validMoves.length === 0) return null;

  if (cpuLevel === 1) {
    // Lv.1 入門: わざと弱い — 下位の手を優先選択
    const scored = validMoves.map(([q,r,s]) => ({
      move: [q,r,s],
      score: evaluateMove(q,r,s,player)
    }));
    scored.sort((a,b) => a.score - b.score); // 昇順（悪い手が先）
    const pool = scored.slice(0, Math.max(1, Math.ceil(scored.length * 0.5)));
    return pool[Math.floor(nextRandom() * pool.length)].move;
  }

  if (cpuLevel === 2) {
    // Lv.2 初級: 完全ランダム
    return validMoves[Math.floor(nextRandom() * validMoves.length)];
  }

  if (cpuLevel === 3) {
    // Lv.3 中級: ランダム（少しだけ賢い — 上位60%から選択）
    const scored = validMoves.map(([q,r,s]) => ({
      move: [q,r,s],
      score: evaluateMove(q,r,s,player)
    }));
    scored.sort((a,b) => b.score - a.score);
    const pool = scored.slice(0, Math.max(1, Math.ceil(scored.length * 0.6)));
    return pool[Math.floor(nextRandom() * pool.length)].move;
  }

  if (cpuLevel === 4) {
    // Lv.4 上級: フリップ数で最善手を選ぶ（位置戦略なし）
    let bestScore = -Infinity;
    let bestMoves = [];
    for (const [q,r,s] of validMoves) {
      const ev = evaluateMove(q,r,s,player);
      if (ev > bestScore) { bestScore = ev; bestMoves = [[q,r,s]]; }
      else if (ev === bestScore) bestMoves.push([q,r,s]);
    }
    return bestMoves[Math.floor(nextRandom() * bestMoves.length)];
  }

  if (cpuLevel === 5) {
    // Lv.5 強敵: フリップ数＋位置価値で選ぶ
    let bestScore = -Infinity;
    let bestMoves = [];
    for (const [q,r,s] of validMoves) {
      const ev = evaluateMove(q,r,s,player);
      const pv = positionValue(q,r,s);
      const total = ev * 3 + pv;
      if (total > bestScore) { bestScore = total; bestMoves = [[q,r,s]]; }
      else if (total === bestScore) bestMoves.push([q,r,s]);
    }
    return bestMoves[Math.floor(nextRandom() * bestMoves.length)];
  }

  // Lv.6〜7: negamax with alpha-beta（先読み深さをレベルで変える）
  // Lv.6(MAX): 3手先読み(depth=2), Lv.7(FINAL): 6手先読み(depth=5)
  const searchDepth = cpuLevel === 7 ? 5 : 2;

  const ranked = validMoves.map(([q,r,s]) => ({
    move:[q,r,s],
    pri: positionValue(q,r,s) * 4 + evaluateMove(q,r,s,player)
  })).sort((a,b) => b.pri - a.pri);

  let bestScore = -Infinity;
  let bestMoves = [];

  for (const {move:[q,r,s]} of ranked) {
    // 反復深化探索: 浅い深さから順に negamax を呼ぶ。
    // 浅い深さの探索結果は TT に蓄積され、深い探索でキャッシュヒットして
    // 大幅に高速化される（Iterative Deepening + TT の組み合わせ効果）。
    const val = withMove(q, r, s, player, () => {
      let v = 0;
      for (let d = 1; d <= searchDepth; d++) {
        v = -negamax(d, opp(player), -Infinity, Infinity);
      }
      return v;
    });
    if (val > bestScore) { bestScore = val; bestMoves = [[q,r,s]]; }
    else if (val === bestScore) bestMoves.push([q,r,s]);
  }
  return bestMoves.length > 0
    ? bestMoves[Math.floor(nextRandom() * bestMoves.length)]
    : validMoves[0];
}
