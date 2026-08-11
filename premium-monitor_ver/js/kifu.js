/* ============================================================
   kifu.js — 棋譜システム + リプレイ
   棋譜の保存（localStorage）、一覧表示、テキスト出力、
   位置マップ表示、リプレイ機能（前進・後退）。
   依存：state.js（moveHistory, replayMode, replayData 等）、
          render.js（render）、navigation.js（showPage）、
          settings.js（getPlayerName）。
   ============================================================ */

// ===== 棋譜システム (Phase 1-3) =====

// Phase 1: 棋譜テキスト生成
function generateNotationText() {
  const date = new Date();
  const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const pName = getPlayerName();
  const pColor = humanColor === 'black' ? '黒' : '白';

  let bCount = 0, wCount = 0;
  for (const [q,r,s] of ALL_CELLS) {
    // Premium-v12: CP セル [0,0,0] は盤面得点に含めない
    if (q === 0 && r === 0 && s === 0) continue;
    const c = board[K(q,r,s)];
    if (c === 'black') bCount++;
    else if (c === 'white') wCount++;
  }
  const bTotal = bCount + captured.black;
  const wTotal = wCount + captured.white;
  // 勝った色を判定（同点は囲んで取った石の数、それも同数なら引き分け）
  let winColor = null;
  if (bTotal > wTotal) winColor = 'black';
  else if (wTotal > bTotal) winColor = 'white';
  else if (captured.black > captured.white) winColor = 'black';
  else if (captured.white > captured.black) winColor = 'white';

  // Premium-v108: 2人対戦は「やまと（黒） vs クッキー（白）」形式 + 名前で勝敗表記
  const _tpN = (battleMode === 'two' && typeof tpKifuNames === 'function') ? tpKifuNames() : null;
  let matchLine, result;
  if (battleMode === 'two') {
    matchLine = _tpN ? `${_tpN.b}（黒） vs ${_tpN.w}（白）` : `黒 vs 白（2人対戦）`;
    if (!winColor) result = '引き分け';
    else if (_tpN) result = `${winColor === 'black' ? _tpN.b : _tpN.w}の勝ち`;
    else result = winColor === 'black' ? '黒の勝ち' : '白の勝ち';
  } else {
    matchLine = `${pName}（${pColor}） vs CPU ${getKifuOpponentLabel(cpuLevel)}`;
    result = !winColor ? '引き分け' : (humanColor === winColor ? '勝利' : '敗北');
  }

  const totalMoves = moveHistory.length;
  const passMoves = moveHistory.filter(m => m.type === 'pass').length;

  let text = `【ReverStarGo 棋譜】\n`;
  text += `日付: ${dateStr}\n`;
  text += `${matchLine}\n`;
  text += `結果: 黒${bTotal} - 白${wTotal}（${result}）\n`;
  text += `手数: ${totalMoves}手${passMoves > 0 ? `（パス${passMoves}回含む）` : ''}\n`;
  text += `────────────────\n`;

  // 各手を整形する関数
  function fmtMove(entry, num) {
    const icon = entry.player === 'black' ? '●' : '○';
    const ns = String(num).padStart(2, ' ');
    if (entry.type === 'pass') {
      return `${ns}.${icon}--`;
    }
    const label = CELL_LABELS[K(entry.q, entry.r, entry.s)] || '??';
    let m = `${ns}.${icon}${label.padEnd(2)}`;
    if (entry.gpCall) {
      m += `[${entry.gpColor === 'black' ? 'B' : 'W'}]`;
    } else {
      m += '   ';
    }
    const caps = entry.captured || 0;
    if (caps > 0) {
      m += ` +${caps}`;
    }
    return m;
  }

  // 2列レイアウト（黒=左、白=右）タブ区切り
  for (let i = 0; i < moveHistory.length; i += 2) {
    const left = fmtMove(moveHistory[i], i + 1);
    if (i + 1 < moveHistory.length) {
      const right = fmtMove(moveHistory[i + 1], i + 2);
      text += left + '\t' + right + '\n';
    } else {
      text += left + '\n';
    }
  }

  return text;
}

function copyNotationText() {
  const text = document.getElementById('notation-text-area').textContent;
  navigator.clipboard.writeText(text).then(() => {
    showToast('コピーしました！');
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('コピーしました！');
  });
}

function closeNotationModal() {
  document.getElementById('notation-modal').style.display = 'none';
}

function showNotationMap() {
  const modal = document.getElementById('notation-map-modal');
  modal.style.display = 'flex';
  const svg = document.getElementById('notation-map-svg');
  if (svg.childNodes.length > 0) return; // 既に描画済み

  const NS = 'http://www.w3.org/2000/svg';
  // 色設定（内側=薄、外側=濃）
  const zoneColors = {
    cp: { fill: '#9b7fd0', stroke: '#7a5fb0', text: '#fff' },
    a:  { fill: '#a8dbb8', stroke: '#80b890', text: '#1a4028' },
    b:  { fill: '#5cad78', stroke: '#408a58', text: '#fff' },
    c:  { fill: '#2d7a4a', stroke: '#1a5a35', text: '#e8ffe8' },
    d:  { fill: '#1a5030', stroke: '#0e3820', text: '#c0ffd0' }
  };

  function getZone(label) {
    if (label === 'CP') return 'cp';
    return label[0].toLowerCase();
  }

  function hPts(cx, cy) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + i * Math.PI / 3;
      pts.push(`${cx + HEX_SIZE * Math.cos(a)},${cy + HEX_SIZE * Math.sin(a)}`);
    }
    return pts.join(' ');
  }

  // 星型アウトライン（角丸ベジェ曲線版）
  const starR = HEX_SIZE * 8.0;
  const innerR = starR / Math.sqrt(3);
  const tipR = 0.18, valR = 0.06;
  const starVerts = [];
  for (let i = 0; i < 6; i++) {
    const aTip = -Math.PI / 2 + i * Math.PI / 3;
    const aIn  = aTip + Math.PI / 6;
    starVerts.push({ x: starR * Math.cos(aTip), y: starR * Math.sin(aTip), isTip: true });
    starVerts.push({ x: innerR * Math.cos(aIn), y: innerR * Math.sin(aIn), isTip: false });
  }
  let starD = '';
  const sn = starVerts.length;
  for (let i = 0; i < sn; i++) {
    const prev = starVerts[(i - 1 + sn) % sn], curr = starVerts[i], next = starVerts[(i + 1) % sn];
    const rf = curr.isTip ? tipR : valR;
    const ax = curr.x + (prev.x - curr.x) * rf, ay = curr.y + (prev.y - curr.y) * rf;
    const bx = curr.x + (next.x - curr.x) * rf, by = curr.y + (next.y - curr.y) * rf;
    starD += (i === 0 ? 'M ' : 'L ') + `${ax.toFixed(2)} ${ay.toFixed(2)} `;
    starD += `Q ${curr.x.toFixed(2)} ${curr.y.toFixed(2)} ${bx.toFixed(2)} ${by.toFixed(2)} `;
  }
  starD += 'Z';
  const isDark = document.body.classList.contains('dark-theme');
  const star = document.createElementNS(NS, 'path');
  star.setAttribute('d', starD);
  star.setAttribute('fill', isDark ? '#2a2520' : '#fff8ee');
  star.setAttribute('stroke', isDark ? '#444' : '#082810');
  star.setAttribute('stroke-width', '3');
  svg.appendChild(star);

  // 時計ラベル（X, J, Q表記）
  const clockLabels = ['Q','1','2','3','4','5','6','7','8','9','X','J'];
  for (let h = 0; h < 12; h++) {
    const isTip = (h % 2 === 0);
    const angle = -Math.PI / 2 + h * Math.PI / 6;
    const r = isTip ? HEX_SIZE * 8.6 : HEX_SIZE * 5.4;
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', r * Math.cos(angle));
    t.setAttribute('y', r * Math.sin(angle));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'middle');
    t.setAttribute('font-size', '13');
    t.setAttribute('font-weight', 'bold');
    t.setAttribute('fill', '#a09060');
    t.textContent = clockLabels[h];
    svg.appendChild(t);
  }

  // セル描画
  for (const [q, r2, s] of ALL_CELLS) {
    const [cx, cy] = cellToPixel(q, r2);
    const key = K(q, r2, s);
    const label = CELL_LABELS[key] || '?';
    const zone = getZone(label);
    const colors = zoneColors[zone];

    const poly = document.createElementNS(NS, 'polygon');
    poly.setAttribute('points', hPts(cx, cy));
    poly.setAttribute('fill', colors.fill);
    poly.setAttribute('stroke', colors.stroke);
    poly.setAttribute('stroke-width', '1.5');
    svg.appendChild(poly);

    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', cx);
    text.setAttribute('y', cy + 1);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('font-size', label === 'CP' ? '16' : '15');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('fill', colors.text);
    if (label === 'CP') text.setAttribute('letter-spacing', '2');
    text.textContent = label;
    svg.appendChild(text);
  }
}

function closeNotationMap() {
  document.getElementById('notation-map-modal').style.display = 'none';
}

function showToast(msg) {
  const el = document.getElementById('copy-toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2000);
}

// Phase 2: 棋譜保存・一覧

function loadSavedGames() {
  try {
    const data = localStorage.getItem(KIFU_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch(e) { return []; }
}

function saveSavedGames(games) {
  localStorage.setItem(KIFU_STORAGE_KEY, JSON.stringify(games));
}

// Premium-v42: 棋譜の対戦相手ラベルを生成（修行モード対応）
//   通常モード: 'Lv.1'〜'Lv.5' / 'MAX' / 'FINAL'
//   修行モード: '修行 Lv.6' / '修行 Lv.7' / '修行 Lv.9' / '修行 Lv.10'
//   cpuLevel 11/13/14/21 は修行コース専用の内部値（通常モードでは使われない）
function getKifuOpponentLabel(cpuLevel) {
  const TRAINING_LV = { 21: 6, 11: 7, 13: 9, 14: 10 };
  if (TRAINING_LV[cpuLevel] !== undefined) {
    return `修行 Lv.${TRAINING_LV[cpuLevel]}`;
  }
  if (cpuLevel >= 6 && cpuLevel <= 7 && typeof LEVEL_NAMES !== 'undefined' && LEVEL_NAMES[cpuLevel - 1]) {
    return LEVEL_NAMES[cpuLevel - 1];
  }
  return `Lv.${cpuLevel}`;
}

// Premium-v49: 棋譜の説明モーダルを表示/非表示にする
function showKifuHelp() {
  const popup = document.getElementById('kifu-help-popup');
  if (popup) popup.style.display = 'flex';
}
function closeKifuHelp() {
  const popup = document.getElementById('kifu-help-popup');
  if (popup) popup.style.display = 'none';
}

function saveGameRecord() {
  // Premium-v41: RM 1局目終了モーダル表示中かを判定（reverseMatch あり + round===2 + round1Result あり）
  //   1局目終了時点では humanColor は既に2局目用に入れ替わっているので、
  //   round1Result から1局目時点の humanColor を取得して保存する。
  const _isRound1Save = typeof reverseMatch !== 'undefined' && reverseMatch
    && reverseMatch.round === 2
    && reverseMatch.round1Result
    && document.getElementById('result-modal').style.display !== 'none';
  const _saveHumanColor = _isRound1Save ? reverseMatch.round1Result.humanColor : humanColor;

  // 最終結果を計算
  let bCount = 0, wCount = 0;
  for (const [q,r,s] of ALL_CELLS) {
    // Premium-v12: CP セル [0,0,0] は盤面得点に含めない
    if (q === 0 && r === 0 && s === 0) continue;
    const c = board[K(q,r,s)];
    if (c === 'black') bCount++;
    else if (c === 'white') wCount++;
  }
  const bTotal = bCount + captured.black;
  const wTotal = wCount + captured.white;
  let result;
  // 同点の場合は囲んで取った石の数で勝敗を決める
  let kifuTiebreaker = null;
  if (bTotal === wTotal) {
    if (captured.black > captured.white) kifuTiebreaker = 'black';
    else if (captured.white > captured.black) kifuTiebreaker = 'white';
  }
  if (battleMode === 'two') {
    result = bTotal > wTotal ? 'black-win' : wTotal > bTotal ? 'white-win' : kifuTiebreaker ? kifuTiebreaker + '-win' : 'draw';
  } else {
    if (bTotal > wTotal) {
      result = _saveHumanColor === 'black' ? 'win' : 'lose';
    } else if (wTotal > bTotal) {
      result = _saveHumanColor === 'white' ? 'win' : 'lose';
    } else if (kifuTiebreaker) {
      result = _saveHumanColor === kifuTiebreaker ? 'win' : 'lose';
    } else {
      result = 'draw';
    }
  }

  // コンパクトなmoveHistory（保存用）
  const compactMoves = moveHistory.map(m => ({
    p: m.player === 'black' ? 'b' : 'w',
    q: m.q, r: m.r,
    g: m.gpColor ? (m.gpColor === 'black' ? 'b' : 'w') : null,
    gc: m.gpCall || false,
    t: m.type === 'move' ? 'm' : 'p',
    b: m.boardAfter,
    cb: m.capturedAfter.black,
    cw: m.capturedAfter.white
  }));

  const memo = prompt('メモを入力（省略可）', '') || '';

  // Premium-v108: 2人対戦は対局時の両プレイヤー名も保存（一覧・リプレイで表示）
  const _tpKifuN = (battleMode === 'two' && typeof tpKifuNames === 'function') ? tpKifuNames() : null;

  const record = {
    id: Date.now(),
    date: new Date().toISOString(),
    playerName: getPlayerName(),
    tpB: _tpKifuN ? _tpKifuN.b : null,
    tpW: _tpKifuN ? _tpKifuN.w : null,
    humanColor: _saveHumanColor,
    cpuLevel: cpuLevel,
    battleMode: battleMode,
    result: result,
    bTotal: bTotal,
    wTotal: wTotal,
    moveCount: moveHistory.filter(m => m.type === 'move').length,
    moves: compactMoves,
    // Premium-v41: 1局目の棋譜である旨をメモ末尾に補足
    memo: (memo.trim().slice(0, 20) + (_isRound1Save ? ' (RM 1局目)' : '')).slice(0, 30),
    notation: generateNotationText()
  };

  const games = loadSavedGames();
  games.unshift(record); // 最新を先頭に
  if (games.length > MAX_SAVED_GAMES) games.length = MAX_SAVED_GAMES;
  saveSavedGames(games);

  // ボタンを更新
  const btn = document.getElementById('save-game-btn');
  btn.textContent = '⭐ 保存済み';
  btn.disabled = true;
  document.getElementById('goto-kifu-btn').style.display = '';
  showToast('棋譜を保存しました！');
}

function renderKifuList() {
  const container = document.getElementById('kifu-list-container');
  const games = loadSavedGames();

  if (games.length === 0) {
    container.innerHTML = '<div class="kifu-empty">保存された棋譜はありません<br><br>ゲーム終了後に「⭐ 保存」ボタンで<br>棋譜を保存できます</div>';
    return;
  }

  let html = '';
  games.forEach((game, idx) => {
    const d = new Date(game.date);
    const dateStr = `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;

    let resultText, resultClass, matchLabel;
    const _esc = (s) => (typeof _tpEsc === 'function' ? _tpEsc(s) : s);
    if (game.battleMode === 'two') {
      // Premium-v108: 名前つき対局は「⚔ やまと vs クッキー  やまとの勝ち」形式
      if (game.tpB && game.tpW) {
        resultText = game.result === 'draw' ? '引き分け'
          : (game.result === 'black-win' ? `${_esc(game.tpB)}の勝ち` : `${_esc(game.tpW)}の勝ち`);
        matchLabel = `⚔ ${_esc(game.tpB)} vs ${_esc(game.tpW)}`;
      } else {
        resultText = game.result === 'draw' ? '引き分け' : (game.result === 'black-win' ? '黒の勝ち' : '白の勝ち');
        matchLabel = `${game.humanColor === 'black' ? '●' : '○'} vs 2人対戦`;
      }
      resultClass = game.result === 'draw' ? 'kifu-draw' : 'kifu-win';
    } else {
      resultText = game.result === 'win' ? '勝利' : game.result === 'lose' ? '敗北' : '引き分け';
      resultClass = game.result === 'win' ? 'kifu-win' : game.result === 'lose' ? 'kifu-lose' : 'kifu-draw';
      matchLabel = `${game.humanColor === 'black' ? '●' : '○'} vs ${getKifuOpponentLabel(game.cpuLevel)}`;
    }

    html += `<div class="kifu-item">`;
    html += `<div class="kifu-item-info" onclick="startReplay(${idx})">`;
    html += `<span class="kifu-item-date">${dateStr}</span>`;
    html += `<span class="kifu-item-result ${resultClass}">${matchLabel}  ${resultText}</span>`;
    html += `<span class="kifu-item-detail">黒${game.bTotal} - 白${game.wTotal}（${game.moveCount}手）</span>`;
    if (game.memo) html += `<span class="kifu-item-memo">📝 ${game.memo}</span>`;
    html += `</div>`;
    html += `<div class="kifu-item-buttons">`;
    html += `<button class="kifu-notation-btn" onclick="event.stopPropagation(); showSavedNotation(${idx})">棋譜</button>`;
    html += `<button class="kifu-delete-btn" onclick="event.stopPropagation(); deleteKifu(${idx})">削除</button>`;
    html += `</div>`;
    html += `</div>`;
  });

  container.innerHTML = html;
}

function deleteKifu(idx) {
  if (!confirm('この棋譜を削除しますか？')) return;
  const games = loadSavedGames();
  games.splice(idx, 1);
  saveSavedGames(games);
  renderKifuList();
}

function showSavedNotation(idx) {
  const games = loadSavedGames();
  const game = games[idx];
  if (!game) return;
  let text = game.notation || '（棋譜テキストは保存されていません）';
  if (game.memo) text = '📝 ' + game.memo + '\n\n' + text;
  document.getElementById('notation-text-area').textContent = text;
  document.getElementById('notation-modal').style.display = 'flex';
}

// Phase 3: リプレイ機能

function deserializeBoard(str) {
  const newBoard = {};
  ALL_CELLS.forEach(([q,r,s], i) => {
    const k = K(q,r,s);
    const c = str[i];
    newBoard[k] = c === 'b' ? 'black' : c === 'w' ? 'white' : null;
  });
  return newBoard;
}

function startReplay(idx) {
  const games = loadSavedGames();
  if (idx < 0 || idx >= games.length) return;
  replayData = games[idx];
  replayStep = 0;
  replayMode = true;

  // 全ページを非表示（ゲーム画面がその下にある）
  document.getElementById('setup-kifu').style.display = 'none';
  document.getElementById('setup-main').style.display = 'none';

  // ゲーム画面のコントロールを調整
  document.getElementById('controls').style.display = 'none';
  document.getElementById('result-modal').style.display = 'none';
  document.getElementById('promotion-game-status').style.display = 'none';
  document.getElementById('session-score').style.display = 'none';
  document.getElementById('replay-controls').style.display = 'flex';
  document.getElementById('replay-exit-btn').style.display = 'block';
  document.getElementById('replay-move-label').style.display = 'block';

  // スコア表示のラベルを設定
  const lvName = replayData.battleMode === 'two' ? '2人対戦'
    : getKifuOpponentLabel(replayData.cpuLevel);
  if (replayData.battleMode === 'two') {
    // Premium-v108: 名前つき対局のリプレイはプレイヤー名を表示
    document.getElementById('black-role').textContent = replayData.tpB || '黒';
    document.getElementById('white-role').textContent = replayData.tpW || '白';
    document.getElementById('level-badge').style.display = 'none';
  } else {
    document.getElementById('black-role').textContent = replayData.humanColor === 'black' ? replayData.playerName : 'CPU';
    document.getElementById('white-role').textContent = replayData.humanColor === 'white' ? replayData.playerName : 'CPU';
    document.getElementById('level-badge').style.display = '';
    document.getElementById('level-badge').textContent = lvName;
  }

  // 初期盤面を表示
  replayRenderStep();
}

function replayRenderStep() {
  if (!replayData) return;
  const totalMoves = replayData.moves.length;

  if (replayStep === 0) {
    // 初期盤面
    board = {};
    ALL_CELLS.forEach(([q,r,s]) => board[K(q,r,s)] = null);
    const ring1 = [[1,-1,0],[1,0,-1],[0,1,-1],[-1,1,0],[-1,0,1],[0,-1,1]];
    ring1.forEach(([q,r,s], i) => board[K(q,r,s)] = i % 2 === 0 ? 'white' : 'black');
    captured = { black: 0, white: 0 };
    lastMove = null;
  } else {
    const move = replayData.moves[replayStep - 1];
    board = deserializeBoard(move.b);
    captured = { black: move.cb, white: move.cw };
    if (move.t === 'm') {
      const s = -move.q - move.r;
      lastMove = [move.q, move.r, s];
    } else {
      lastMove = null;
    }
  }

  updateScore();
  render([]);

  // 情報表示更新
  document.getElementById('replay-info').textContent = `${replayStep} / ${totalMoves}`;

  // 手の説明
  if (replayStep === 0) {
    showTurn('📋 リプレイ - 初期盤面');
    document.getElementById('replay-move-label').textContent = '';
  } else {
    const move = replayData.moves[replayStep - 1];
    const icon = move.p === 'b' ? '●' : '○';
    if (move.t === 'p') {
      showTurn(`${replayStep} / ${totalMoves} - ${icon} パス`);
      document.getElementById('replay-move-label').textContent = `${icon} パス`;
    } else {
      const s = -move.q - move.r;
      const label = CELL_LABELS[K(move.q, move.r, s)] || `(${move.q},${move.r})`;
      const moveNum = replayData.moves.slice(0, replayStep).filter(m => m.t === 'm').length;
      let desc = `${moveNum}.${icon} ${label}`;
      if (move.gc) desc += ` [CP:${move.g === 'b' ? '黒' : '白'}]`;
      showTurn(`${replayStep} / ${totalMoves}`);
      document.getElementById('replay-move-label').textContent = desc;
    }
  }

  // ボタン状態
  document.getElementById('replay-start').disabled = replayStep === 0;
  document.getElementById('replay-back').disabled = replayStep === 0;
  document.getElementById('replay-fwd').disabled = replayStep >= totalMoves;
  document.getElementById('replay-end').disabled = replayStep >= totalMoves;
}

function replayForward() {
  if (!replayData || replayStep >= replayData.moves.length) return;
  replayStep++;
  replayRenderStep();
}

function replayBack() {
  if (!replayData || replayStep <= 0) return;
  replayStep--;
  replayRenderStep();
}

function replayGoStart() {
  if (!replayData) return;
  replayStep = 0;
  replayRenderStep();
}

function replayGoEnd() {
  if (!replayData) return;
  replayStep = replayData.moves.length;
  replayRenderStep();
}

function exitReplay() {
  replayMode = false;
  replayData = null;
  replayStep = 0;

  // リプレイUIを非表示
  document.getElementById('replay-controls').style.display = 'none';
  document.getElementById('replay-exit-btn').style.display = 'none';
  document.getElementById('replay-move-label').style.display = 'none';
  document.getElementById('controls').style.display = '';

  // 棋譜一覧に戻る
  showPage('kifu');
}
