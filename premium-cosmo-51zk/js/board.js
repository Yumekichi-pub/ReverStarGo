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

// ===== コウ・合法手・囲み取り =====

// 有効な手のリストを返す（GP自体の裏返しは除外して判定）
/**
 * player が打てる全ての有効手（コウ手も含む）を返す。
 * コウ判定は filterKoMoves で別途行う。
 * @param {'black'|'white'} player - 手番のプレイヤー
 * @returns {Array<[number,number,number]>} 有効手の cube 座標リスト
 */
function getValidMoves(player) {
  const moves = [];
  for (const [q,r,s] of ALL_CELLS) {
    if (q===0 && r===0 && s===0) continue; // GPには置けない
    if (board[K(q,r,s)] !== null) continue;
    const max = Math.max(
      realFlipCount(q,r,s,player,null),
      realFlipCount(q,r,s,player,'black'),
      realFlipCount(q,r,s,player,'white')
    );
    if (max > 0) moves.push([q,r,s]);
  }
  return moves;
}

// ===== コウ（Ko）判定 =====

// ボード全体を文字列化（コウ判定用スナップショット）
/**
 * 現在の盤面を文字列にシリアライズする（boardHistory のキーとして使用）。
 * スーパーコウ判定（過去局面との一致チェック）の高速化のため、
 * 各セルの状態を 'b'/'w'/'.' の 1 文字に圧縮して結合する。
 * @returns {string} 盤面を表す固定長の文字列
 */
function serializeBoard() {
  return ALL_CELLS.map(([q,r,s]) => {
    if (q===0 && r===0 && s===0) return 'n'; // GPは常にリセットされるので固定
    const c = board[K(q,r,s)];
    return c === 'black' ? 'b' : c === 'white' ? 'w' : 'n';
  }).join('');
}

// 手を打った後のボード状態をシミュレーション（実ボードは変更しない）

// スーパーコウ判定：直前の局面だけでなく全履歴と照合
// グローバル関数に昇格（イベントチェッカから GAM_010 として監視可能にするため）
// ポジショナル式（盤面のみ）に統一。深さ解析 HTML で 51,000 局検証済み
//       ルール説明「一度現れた局面に戻る手は打てません」と完全整合
//       引数の player は後方互換のため残すが、v50 からは未使用
/**
 * snap の盤面が boardHistory に既出かを判定（ポジショナル・スーパーコウ）。
 * ルール ① の「一度現れた局面に戻る手は打てない」の判定に使用。
 * @param {string} snap - serializeBoard() で得た盤面文字列
 * @param {'black'|'white'} player - 手番のプレイヤー（現状未使用、将来用）
 * @returns {boolean} 既出なら true
 */
function isRepeatedPosition(snap, player) {
  if (!prevBoardSnapshot) return false;
  if (snap === prevBoardSnapshot) return true;              // 単純コウ
  return boardHistory.indexOf(snap) !== -1;                 // スーパーコウ（ポジショナル式）
}

// CPコールを考慮してコウにならない手かチェック
// 戻り値: 非コウのCPコール色の配列 ['black', 'white', null 等]
//   - 空配列 → どのコールでもコウになる（コウ手）
//   - 非空 → この手は合法（その色でコールすれば非コウ）
/**
 * (q,r,s) で GP コールするとき、コウ違反にならない色のリストを返す。
 * 'black' のコール、'white' のコールそれぞれを試して、結果がコウなら除外。
 * UI でオレンジドット表示（CP コール片色制限）の判定に使用。
 * @param {number} q - 着手位置の cube 座標
 * @param {number} r - 着手位置の cube 座標
 * @param {number} s - 着手位置の cube 座標
 * @param {'black'|'white'} player - 手番
 * @returns {Array<'black'|'white'>} コウ違反にならない GP コール色のリスト
 */
function getNonKoGPColors(q, r, s, player) {
  if (!prevBoardSnapshot) return ['black', 'white', null];

  const needsCall = needsGPCall(q, r, s, player);
  if (!needsCall) {
    // コール不要 → 自動色で判定
    const gp = bestGPColor(q, r, s, player);
    const snap = simulateFinalSnapshot(q, r, s, player, gp);
    return !isRepeatedPosition(snap, player) ? [gp] : [];
  }
  // コール必要 → 黒・白それぞれを検証
  const result = [];
  const snapB = simulateFinalSnapshot(q, r, s, player, 'black');
  const snapW = simulateFinalSnapshot(q, r, s, player, 'white');
  if (!isRepeatedPosition(snapB, player)) result.push('black');
  if (!isRepeatedPosition(snapW, player)) result.push('white');
  return result;
}

// コウ手を除外する（全手がコウならパス扱い＝空配列を返す）
/**
 * 候補手リストから「コウ違反になる手」を除外する。
 * ① 1手前と同じ盤面に戻る手 ② 過去の局面に戻る手 を取り除く。
 * @param {Array<[number,number,number]>} moves - 全候補手
 * @param {'black'|'white'} player - 手番のプレイヤー
 * @returns {Array<[number,number,number]>} コウに引っかからない手のみ
 */
function filterKoMoves(moves, player) {
  if (!prevBoardSnapshot || moves.length === 0) return moves;
  const nonKo = moves.filter(([q,r,s]) => getNonKoGPColors(q, r, s, player).length > 0);
  return nonKo; // 全手がコウなら空配列 → パス → 両者パスで終局
}

// 囲まれたグループを検出（ボードは変更しない）
function findCaptureGroups(player) {
  const opponent = opp(player);
  const visited = new Set();
  const groupsToRemove = [];

  for (const [q,r,s] of ALL_CELLS) {
    const k = K(q,r,s);
    if (board[k] !== opponent || visited.has(k)) continue;

    const group = [];
    const queue = [[q,r,s]];
    let free = false;

    while (queue.length) {
      const [cq,cr,cs] = queue.shift();
      const ck = K(cq,cr,cs);
      if (visited.has(ck)) continue;
      visited.add(ck);
      group.push([cq,cr,cs]);
      for (const [dq,dr,ds] of DIRS) {
        const [nq,nr,ns] = [cq+dq, cr+dr, cs+ds];
        if (!isOnBoard(nq,nr,ns)) { free = true; continue; }
        const nc = board[K(nq,nr,ns)];
        if (nc === null) free = true;
        else if (nc === opponent && !visited.has(K(nq,nr,ns))) queue.push([nq,nr,ns]);
      }
    }

    if (!free) {
      groupsToRemove.push(group);
    }
  }
  return groupsToRemove;
}

// ===== Rule 4: 既存囲み保護 =====
// 手を打つ前のボード状態を浅くコピー（37セル）。後の境界変化判定に使う。
function snapshotBoardForCapture() {
  const snap = {};
  for (const [q,r,s] of ALL_CELLS) snap[K(q,r,s)] = board[K(q,r,s)];
  return snap;
}

// 取り除きグループが「今回の手で生まれた囲み」かを判定。
// 境界（グループ外の隣接セル）のいずれかが手前後で状態変化していれば真の取り除き。
// CP は手の終わりにリセットされるため、CP の一時的な色変化は境界変化として扱わない。
function isRealCapture(group, preBoard) {
  const groupSet = new Set(group.map(([q,r,s]) => K(q,r,s)));
  const CP_KEY = K(0,0,0);
  for (const [q,r,s] of group) {
    for (const [dq,dr,ds] of DIRS) {
      const nq = q+dq, nr = r+dr, ns = s+ds;
      if (!isOnBoard(nq,nr,ns)) continue;
      const nk = K(nq,nr,ns);
      if (groupSet.has(nk)) continue;
      if (nk === CP_KEY) continue; // Rule 4: CPの一時変化は境界変化に含めない
      if (preBoard[nk] !== board[nk]) return true;
    }
  }
  return false;
}

// 手後の取り除きグループから「既存囲み」を除外
function filterRealCaptures(groups, preBoard) {
  if (!preBoard) return groups;
  return groups.filter(g => isRealCapture(g, preBoard));
}
