/* ============================================================
   board.js — 盤面・ルール（基本）
   挟み判定・フリップ計算・囲み取り判定・CP コール処理。
   グローバル: board, DIRS, CELL_SET, K, isOnBoard, opp に依存。
   ============================================================ */

// ===== ゲームロジック =====

// 指定マスに player が置いたとき裏返せる石のリストを返す
/**
 * (q,r,s) に player の石を置いたとき、挟んでひっくり返せる石のリストを返す。
 * 6 方向それぞれで「相手の石が連続→自分の石」のパターンを検出する。
 * @param {number} q - cube 座標 q
 * @param {number} r - cube 座標 r
 * @param {number} s - cube 座標 s
 * @param {'black'|'white'} player - 手番のプレイヤー
 * @param {'black'|'white'|null} gpColor - CP コール色（CP 経由時のみ）
 * @returns {Array<[number,number,number]>} ひっくり返せる石の座標リスト
 */
function getFlippable(q, r, s, player, gpColor) {
  const result = [];
  for (const [dq,dr,ds] of DIRS) {
    const line = [];
    let [nq,nr,ns] = [q+dq, r+dr, s+ds];
    while (isOnBoard(nq,nr,ns)) {
      let c = board[K(nq,nr,ns)];
      if (nq===0 && nr===0 && ns===0 && c===null) c = gpColor;
      if (c === opp(player)) {
        line.push([nq,nr,ns]);
      } else if (c === player) {
        result.push(...line);
        break;
      } else {
        break;
      }
      nq+=dq; nr+=dr; ns+=ds;
    }
  }
  return result;
}

// GP自体を除外した「実際に裏返る石」のセット文字列
function flipSet(q, r, s, player, gpColor) {
  return getFlippable(q,r,s,player,gpColor)
    .map(c => c.join(',')).sort().join('|');
}

// 裏返し枚数（CP単体挟みも有効）
/**
 * (q,r,s) に着手した時に「実際にひっくり返る石」の数を返す。
 * getFlippable から得たリストの長さと同じだが、評価関数で頻用するため別関数化。
 * @param {number} q - cube 座標 q
 * @param {number} r - cube 座標 r
 * @param {number} s - cube 座標 s
 * @param {'black'|'white'} player - 手番
 * @param {'black'|'white'|null} gpColor - GP コール色
 * @returns {number} ひっくり返る石数
 */
function realFlipCount(q, r, s, player, gpColor) {
  return getFlippable(q,r,s,player,gpColor).length;
}

// 取り除き結果をシミュレーション（ボードを変更せず結果だけ返す）
/**
 * (q,r,s) に player の石を置いた後の囲み取り（捕獲）を計算する。
 * 自分の石だけで完全に囲まれた相手の石を検出（壁は使えない）。
 * Rule ④「既存の囲みは保護される」も考慮し、新たに完成した囲みのみ取る。
 * @param {number} q - 着手位置の cube 座標
 * @param {number} r - 着手位置の cube 座標
 * @param {number} s - 着手位置の cube 座標
 * @param {'black'|'white'} player - 手番のプレイヤー
 * @param {'black'|'white'|null} gpColor - CP コール色
 * @returns {Set<string>} 取られる石の座標（K() 形式の文字列）の Set
 */
function simulateCaptures(q, r, s, player, gpColor) {
  const saved = new Map();
  const save = (k) => { if (!saved.has(k)) saved.set(k, board[k]); };

  // Rule 4: 既存囲み保護用に手を打つ前のボード状態を保存
  const preBoardSnap = snapshotBoardForCapture();
  // 石を置く前にCPが既に囲まれていたか記録
  const gpWasAlreadySurrounded = DIRS.every(([dq,dr,ds]) => board[K(dq,dr,ds)] === player);

  save(K(q,r,s));
  board[K(q,r,s)] = player;

  // CP石をフリップ前に配置
  const gpK = K(0,0,0);
  save(gpK);
  if (gpColor && board[gpK] === null) board[gpK] = gpColor;

  const flipped = getFlippable(q,r,s,player,gpColor);
  for (const [fq,fr,fs] of flipped) {
    save(K(fq,fr,fs)); board[K(fq,fr,fs)] = player;
  }

  // 自動囲み：CPが空で「今回初めて」囲まれた場合のみ相手石を配置
  if (board[gpK] === null && !gpWasAlreadySurrounded &&
      DIRS.every(([dq,dr,ds]) => board[K(dq,dr,ds)] === player)) {
    board[gpK] = opp(player);
  }

  // Rule 4: 既存囲みを除外した実取り除きのみを返す
  const groups = filterRealCaptures(findCaptureGroups(player), preBoardSnap);
  const result = groups.flat().map(c => c.join(',')).sort().join('|');

  // ボードを元に戻す
  for (const [k, v] of saved) board[k] = v;
  return result;
}

// 手を仮実行した最終盤面スナップショット（CPリセット後）を返す
/**
 * (q,r,s) に着手し、ひっくり返し→囲み取りまで完了した最終盤面のスナップショットを返す。
 * 実際の盤面を変更せずに、コピーを使ってシミュレーションする（コウ判定や AI 評価で使用）。
 * @param {number} q - 着手位置の cube 座標
 * @param {number} r - 着手位置の cube 座標
 * @param {number} s - 着手位置の cube 座標
 * @param {'black'|'white'} player - 手番
 * @param {'black'|'white'|null} gpColor - GP コール色
 * @returns {Object} 着手後の盤面オブジェクト（コピー）
 */
function simulateFinalSnapshot(q, r, s, player, gpColor) {
  const saved = new Map();
  const save = (k) => { if (!saved.has(k)) saved.set(k, board[k]); };

  // Rule 4: 既存囲み保護用に手を打つ前のボード状態を保存
  const preBoardSnap = snapshotBoardForCapture();
  const gpK = K(0,0,0);
  const gpWasAlreadySurrounded = DIRS.every(([dq,dr,ds]) => board[K(dq,dr,ds)] === player);

  save(K(q,r,s));
  board[K(q,r,s)] = player;

  save(gpK);
  if (gpColor && board[gpK] === null) board[gpK] = gpColor;

  const flipped = getFlippable(q,r,s,player,gpColor);
  for (const [fq,fr,fs] of flipped) {
    save(K(fq,fr,fs)); board[K(fq,fr,fs)] = player;
  }

  // 自動囲み（今回初めて囲まれた場合のみ）
  if (board[gpK] === null && !gpWasAlreadySurrounded &&
      DIRS.every(([dq,dr,ds]) => board[K(dq,dr,ds)] === player)) {
    board[gpK] = opp(player);
  }

  // Rule 4: 既存囲みを除外した実取り除き
  const groups = filterRealCaptures(findCaptureGroups(player), preBoardSnap);
  for (const group of groups) {
    for (const [cq,cr,cs] of group) {
      save(K(cq,cr,cs));
      board[K(cq,cr,cs)] = null;
    }
  }

  // CPリセット
  board[gpK] = null;

  const snapshot = serializeBoard();
  for (const [k, v] of saved) board[k] = v;
  return snapshot;
}

// コールが必要か：CPリセット後の最終盤面が違う時だけ聞く
/**
 * (q,r,s) への着手が CP（コアポイント）を経由するため、GP コールが必要かを判定。
 * CP の隣接マスに置く場合のみ true。
 * @param {number} q - cube 座標 q
 * @param {number} r - cube 座標 r
 * @param {number} s - cube 座標 s
 * @param {'black'|'white'} player - 手番のプレイヤー
 * @returns {boolean} GP コールが必要なら true
 */
function needsGPCall(q, r, s, player) {
  if (board[K(0,0,0)] !== null) return false;
  const sBlack = flipSet(q,r,s,player,'black');
  const sWhite = flipSet(q,r,s,player,'white');
  // 片方しか有効でない → 自動選択（聞かない）
  if (sBlack === '' || sWhite === '') return false;
  // CPリセット後の最終盤面を比較：同じなら聞かない
  const finalBlack = simulateFinalSnapshot(q, r, s, player, 'black');
  const finalWhite = simulateFinalSnapshot(q, r, s, player, 'white');
  return finalBlack !== finalWhite;
}

// 自動選択：実際に石が裏返る色を返す
/**
 * GP コール時に CPU が選ぶ最善の色を決める。
 * black/white それぞれで evaluateMove したスコアを比較。
 * @param {number} q - cube 座標 q
 * @param {number} r - cube 座標 r
 * @param {number} s - cube 座標 s
 * @param {'black'|'white'} player - 手番のプレイヤー
 * @returns {'black'|'white'} 評価値の高い CP コール色
 */
function bestGPColor(q, r, s, player) {
  if (board[K(0,0,0)] !== null) return null;
  const fBlack = realFlipCount(q,r,s,player,'black');
  const fWhite = realFlipCount(q,r,s,player,'white');
  const fNone  = realFlipCount(q,r,s,player,null);
  // 取り除き数も考慮
  const capB = simulateCaptures(q,r,s,player,'black').split('|').filter(x=>x).length;
  const capW = simulateCaptures(q,r,s,player,'white').split('|').filter(x=>x).length;
  const capN = simulateCaptures(q,r,s,player,null).split('|').filter(x=>x).length;
  const sBlack = fBlack + capB;
  const sWhite = fWhite + capW;
  const sNone  = fNone + capN;
  const best = Math.max(sBlack, sWhite, sNone);
  if (best === 0) return null;
  if (sBlack === best) return 'black';
  if (sWhite === best) return 'white';
  return null;
}
