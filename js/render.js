/* ============================================================
   render.js — SVG 盤面レンダリング + スコア・ターン表示
   countOnBoard / updateScore / render（メイン描画）/ showTurn
   等。盤面の SVG 構築、石の表示、コウマーカー、棋譜記号、
   ヒント表示などを担当。
   依存：state.js（board, current, lastMove 等）、
          utils.js（K, isOnBoard）、setup.js（currentTheme）。
   ============================================================ */

// ===== 描画 =====

function countOnBoard(player) {
  return ALL_CELLS.filter(([q,r,s]) => board[K(q,r,s)] === player).length;
}

function updateScore() {
  const bBoard = countOnBoard('black');
  const wBoard = countOnBoard('white');
  const bTotal = bBoard + captured.black;
  const wTotal = wBoard + captured.white;
  document.getElementById('black-score').textContent = captured.black;
  document.getElementById('white-score').textContent = captured.white;
  document.getElementById('black-detail').textContent = `合計${bTotal}`;
  document.getElementById('white-detail').textContent = `合計${wTotal}`;
  // Reverse Match 2局目中は、1局目の得点を表示（v42〜）
  const blackR1El = document.getElementById('black-round1');
  const whiteR1El = document.getElementById('white-round1');
  if (blackR1El && whiteR1El) {
    if (reverseMatch && reverseMatch.round === 2 && reverseMatch.round1Result) {
      const r1 = reverseMatch.round1Result;
      // r1.humanColor は1局目での「あなた」の色
      const blackPtsR1 = r1.humanColor === 'black' ? r1.humanPoints : r1.cpuPoints;
      const whitePtsR1 = r1.humanColor === 'black' ? r1.cpuPoints : r1.humanPoints;
      blackR1El.textContent = `🏆 1局目 ${blackPtsR1}点`;
      whiteR1El.textContent = `🏆 1局目 ${whitePtsR1}点`;
      blackR1El.style.display = '';
      whiteR1El.style.display = '';
    } else {
      blackR1El.style.display = 'none';
      whiteR1El.style.display = 'none';
    }
  }
}

function showTurn(msg) {
  document.getElementById('turn-info').textContent = msg;
}

// 星型アウトラインを描画（角丸ベジェ曲線版）
function drawStarOutline(svg) {
  const R_out = HEX_SIZE * 7.8;
  const R_in  = R_out / Math.sqrt(3);
  const tipRound = 0.18, valleyRound = 0.06;
  const verts = [];
  for (let i = 0; i < 6; i++) {
    const a_tip = -Math.PI / 2 + i * Math.PI / 3;
    const a_in  = a_tip + Math.PI / 6;
    verts.push({ x: R_out * Math.cos(a_tip), y: R_out * Math.sin(a_tip), isTip: true });
    verts.push({ x: R_in  * Math.cos(a_in ), y: R_in  * Math.sin(a_in ), isTip: false });
  }
  let d = '';
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const prev = verts[(i - 1 + n) % n], curr = verts[i], next = verts[(i + 1) % n];
    const rf = curr.isTip ? tipRound : valleyRound;
    const ax = curr.x + (prev.x - curr.x) * rf, ay = curr.y + (prev.y - curr.y) * rf;
    const bx = curr.x + (next.x - curr.x) * rf, by = curr.y + (next.y - curr.y) * rf;
    d += (i === 0 ? 'M ' : 'L ') + `${ax.toFixed(2)} ${ay.toFixed(2)} `;
    d += `Q ${curr.x.toFixed(2)} ${curr.y.toFixed(2)} ${bx.toFixed(2)} ${by.toFixed(2)} `;
  }
  d += 'Z';
  // 外枠（グロー効果用の太い線）
  const glow = document.createElementNS('http://www.w3.org/2000/svg','path');
  glow.setAttribute('d', d);
  glow.setAttribute('fill', 'none');
  glow.setAttribute('stroke', currentTheme.starGlow);
  glow.setAttribute('stroke-width', '16');
  glow.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(glow);
  // メインの枠線
  const outline = document.createElementNS('http://www.w3.org/2000/svg','path');
  outline.setAttribute('d', d);
  outline.setAttribute('fill', 'none');
  outline.setAttribute('stroke', currentTheme.starStroke);
  outline.setAttribute('stroke-width', '5');
  outline.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(outline);
}

// 六角形リングを描画

function render(validMoves, koRestrictedSet, koBlockedMoves) {
  const showAnim = showPlacedAnim;  // このrender1回だけアニメーション発火
  showPlacedAnim = false;
  const validSet = new Set((validMoves || []).map(([q,r,s]) => K(q,r,s)));
  if (!koRestrictedSet) koRestrictedSet = new Set();
  const koBlockedSet = new Set((koBlockedMoves || []).map(([q,r,s]) => K(q,r,s)));
  const svg = document.getElementById('board');
  svg.innerHTML = '';
  drawStarOutline(svg);

  // ノーテーション（モードに応じて表示）
  // 10→X, 11→J, 12→Q
  function clockLabel(h) {
    const n = (h === 0) ? 12 : h;
    if (n === 12) return 'Q';
    if (n === 11) return 'J';
    if (n === 10) return 'X';
    return String(n);
  }
  if (notationMode > 0) {
    // 4箇所・全表示ともに同じ距離基準を使う
    const r_tip   = HEX_SIZE * 7.4; // 星の先端ラベル（12/6と同じ位置）
    const r_inner = HEX_SIZE * 4.6; // 内頂点ラベル（3/9と同じ位置）
    if (notationMode === 1) {
      // 4箇所モード（Q・3・6・9）
      // dx/dy は方向ベクトル: x軸にはr_inner、y軸にはr_tipを使う（元の配置と同じ）
      const clockNums4 = [[0, 0, -1], [3, 1, 0], [6, 0, 1], [9, -1, 0]];
      for (const [h, dx, dy] of clockNums4) {
        const t = document.createElementNS('http://www.w3.org/2000/svg','text');
        t.setAttribute('x', r_inner * dx);
        t.setAttribute('y', r_tip   * dy);
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('dominant-baseline', 'middle');
        t.setAttribute('font-size', '13');
        t.setAttribute('font-weight', 'bold');
        t.setAttribute('fill', currentTheme.notation);
        t.setAttribute('pointer-events', 'none');
        t.textContent = clockLabel(h);
        svg.appendChild(t);
      }
    } else {
      // 全表示モード（全12箇所・4箇所と同じ距離基準）
      for (let h = 0; h < 12; h++) {
        const isTip = (h % 2 === 0); // h=0,2,4,6,8,10 が星の先端
        const angle = -Math.PI / 2 + h * Math.PI / 6;
        const r = isTip ? r_tip : r_inner;
        const t = document.createElementNS('http://www.w3.org/2000/svg','text');
        t.setAttribute('x', r * Math.cos(angle));
        t.setAttribute('y', r * Math.sin(angle));
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('dominant-baseline', 'middle');
        t.setAttribute('font-size', '11');
        t.setAttribute('font-weight', 'bold');
        t.setAttribute('fill', currentTheme.notation);
        t.setAttribute('pointer-events', 'none');
        t.textContent = clockLabel(h);
        svg.appendChild(t);
      }
    }
  }

  // (境界ラインはセル描画後に追加)

  for (const [q,r,s] of ALL_CELLS) {
    const [cx,cy] = cellToPixel(q,r);
    const k = K(q,r,s);
    const isGP = q===0 && r===0 && s===0;
    const cellColor = board[k];
    const isValid = validSet.has(k);

    // 六角形セル
    const poly = document.createElementNS('http://www.w3.org/2000/svg','polygon');
    poly.setAttribute('points', hexPoints(cx,cy));
    const isKoBlocked = koBlockedSet.has(k);
    const isKoRestricted = isValid && koRestrictedSet.has(k);
    let fill = currentTheme.cellFill;
    // コウ関連の塗りは優先（例外時も赤のまま、ドットで置けることを示す）
    if (isKoBlocked && hintEnabled) {
      fill = '#e30909'; // 赤: コウでブロック（例外時でも赤のまま）
    } else if (isValid && hintEnabled) {
      fill = koRestrictedSet.has(k) ? '#f0a030' : currentTheme.cellValid;
    }
    if (isGP && cellColor === null) fill = '#7b1fa2';
    poly.setAttribute('fill', fill);
    // コウ警告セルは白い太枠で強調（どのテーマでも視認性確保）
    const showKoBorder = hintEnabled && !isGP && (isKoBlocked || isKoRestricted);
    if (showKoBorder) {
      poly.setAttribute('stroke', '#ffffff');
      poly.setAttribute('stroke-width', '3');
    } else {
      poly.setAttribute('stroke', isGP ? '#4a0a72' : currentTheme.cellStroke);
      poly.setAttribute('stroke-width', isGP ? '2.5' : '1.5');
    }

    if (cellColor === null && (isValid || (isKoBlocked && validSet.size === 0))) {
      poly.style.cursor = 'pointer';
    }
    svg.appendChild(poly);

    // 石（取り除きアニメーション中 or 通常）
    if (capturePending.has(k)) {
      // オレンジで光ってから縮んで消えるアニメーション
      const circle = document.createElementNS('http://www.w3.org/2000/svg','circle');
      circle.setAttribute('cx', cx);
      circle.setAttribute('cy', cy);
      circle.setAttribute('r', HEX_SIZE * 0.58);
      circle.setAttribute('fill', '#ff7700');
      circle.setAttribute('stroke', '#ffcc00');
      circle.setAttribute('stroke-width','2.5');
      circle.classList.add('capturing');
      circle.style.pointerEvents = 'none';
      svg.appendChild(circle);
    } else if (cellColor) {
      const isLastMove = lastMove && k === K(lastMove[0], lastMove[1], lastMove[2]);

      // 置いた瞬間のグロー（最初のrenderのみ）
      if (showAnim && isLastMove) {
        const glow = document.createElementNS('http://www.w3.org/2000/svg','circle');
        glow.setAttribute('cx', cx);
        glow.setAttribute('cy', cy);
        glow.setAttribute('r', HEX_SIZE * 0.75);
        glow.setAttribute('fill', cellColor === 'black' ? '#88ccff' : '#ffe066');
        glow.classList.add('placed-glow');
        glow.style.pointerEvents = 'none';
        svg.appendChild(glow);
      }

      // 石本体（置いた瞬間はポップアニメーション）
      const circle = document.createElementNS('http://www.w3.org/2000/svg','circle');
      circle.setAttribute('cx', cx);
      circle.setAttribute('cy', cy);
      circle.setAttribute('r', HEX_SIZE * 0.58);
      circle.setAttribute('fill', cellColor === 'black' ? '#111' : '#f4f4f4');
      circle.setAttribute('stroke', cellColor === 'black' ? '#555' : '#aaa');
      circle.setAttribute('stroke-width','1.5');
      circle.style.pointerEvents = 'none';
      if (showAnim && isLastMove) circle.classList.add('placed-pop');
      svg.appendChild(circle);

      // 前回置いた場所のマーカーリング（次の手まで残す）
      if (isLastMove) {
        const ring = document.createElementNS('http://www.w3.org/2000/svg','circle');
        ring.setAttribute('cx', cx);
        ring.setAttribute('cy', cy);
        ring.setAttribute('r', HEX_SIZE * 0.68);
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', cellColor === 'black' ? '#55aaff' : '#ffcc33');
        ring.setAttribute('stroke-width', '2.5');
        ring.setAttribute('opacity', '0.85');
        ring.style.pointerEvents = 'none';
        svg.appendChild(ring);
      }
    }

    // GP文字ラベル
    if (isGP && !capturePending.has(k)) {
      const label = document.createElementNS('http://www.w3.org/2000/svg','text');
      label.setAttribute('x', cx);
      label.setAttribute('y', cy);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'central');
      label.setAttribute('font-size', cellColor ? '9' : '21');
      label.setAttribute('font-weight', 'bold');
      label.setAttribute('fill', cellColor ? 'rgba(255,200,0,0.5)' : '#ffffff');
      label.setAttribute('pointer-events', 'none');
      label.textContent = cellColor ? 'CP' : 'C\u2009P';
      svg.appendChild(label);
    }

    // GP選択中の仮マーカー（自分が置こうとしている場所）
    if (pendingMoveMarker && k === K(pendingMoveMarker[0], pendingMoveMarker[1], pendingMoveMarker[2])) {
      // 半透明の石を表示
      const ghost = document.createElementNS('http://www.w3.org/2000/svg','circle');
      ghost.setAttribute('cx', cx);
      ghost.setAttribute('cy', cy);
      ghost.setAttribute('r', HEX_SIZE * 0.58);
      ghost.setAttribute('fill', current === 'black' ? '#111' : '#f4f4f4');
      ghost.setAttribute('stroke', current === 'black' ? '#55aaff' : '#ffcc33');
      ghost.setAttribute('stroke-width', '3');
      ghost.setAttribute('opacity', '0.7');
      ghost.style.pointerEvents = 'none';
      svg.appendChild(ghost);
      // パルスリング
      const ring = document.createElementNS('http://www.w3.org/2000/svg','circle');
      ring.setAttribute('cx', cx);
      ring.setAttribute('cy', cy);
      ring.setAttribute('r', HEX_SIZE * 0.72);
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', current === 'black' ? '#55aaff' : '#ffcc33');
      ring.setAttribute('stroke-width', '2.5');
      ring.setAttribute('opacity', '0.9');
      ring.style.pointerEvents = 'none';
      svg.appendChild(ring);
    }

    // 有効手のヒント (点)
    if (isValid && !cellColor && hintEnabled) {
      const dot = document.createElementNS('http://www.w3.org/2000/svg','circle');
      dot.setAttribute('cx', cx);
      dot.setAttribute('cy', cy);
      dot.setAttribute('r', HEX_SIZE * 0.19);
      dot.setAttribute('fill','rgba(255,235,20,0.88)');
      dot.style.pointerEvents = 'none';
      svg.appendChild(dot);
    }
  }

  // 境界ライン：セルのエッジに沿って描画
  const centralHex = new Set();
  for (const [cq,cr,cs] of ALL_CELLS) {
    if (Math.max(Math.abs(cq), Math.abs(cr), Math.abs(cs)) <= 2) centralHex.add(K(cq,cr,cs));
  }
  const edgeVerts = [[0,1],[1,2],[2,3],[3,4],[4,5],[5,0]];

  // 赤ライン（Ring2と腕の境界）
  for (const [q,r,s] of ALL_CELLS) {
    if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) !== 2) continue;
    const [cx,cy] = cellToPixel(q,r);
    for (let d = 0; d < 6; d++) {
      const [dq,dr,ds] = DIRS[d];
      const nk = K(q+dq, r+dr, s+ds);
      if (!centralHex.has(nk)) {
        const scale = HEX_SIZE;
        const [vi, vj] = edgeVerts[d];
        const a1 = -Math.PI/2 + Math.PI/3 * vi;
        const a2 = -Math.PI/2 + Math.PI/3 * vj;
        const line = document.createElementNS('http://www.w3.org/2000/svg','line');
        line.setAttribute('x1', cx + scale * Math.cos(a1));
        line.setAttribute('y1', cy + scale * Math.sin(a1));
        line.setAttribute('x2', cx + scale * Math.cos(a2));
        line.setAttribute('y2', cy + scale * Math.sin(a2));
        line.setAttribute('stroke', '#1a4a28');
        line.setAttribute('stroke-width', '1.5');
        line.setAttribute('stroke-linecap', 'round');
        svg.appendChild(line);
      }
    }
  }

  // ゴールドライン（GPの周囲 = GPセルの全エッジ）
  {
    const [cx,cy] = cellToPixel(0, 0);
    const scale = HEX_SIZE;
    for (let d = 0; d < 6; d++) {
      const [vi, vj] = edgeVerts[d];
      const a1 = -Math.PI/2 + Math.PI/3 * vi;
      const a2 = -Math.PI/2 + Math.PI/3 * vj;
      const line = document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1', cx + scale * Math.cos(a1));
      line.setAttribute('y1', cy + scale * Math.sin(a1));
      line.setAttribute('x2', cx + scale * Math.cos(a2));
      line.setAttribute('y2', cy + scale * Math.sin(a2));
      line.setAttribute('stroke', '#c8a840');
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-linecap', 'round');
      svg.appendChild(line);
    }
  }

  const icon = current === 'black' ? '●' : '○';
  const label = colorLabel(current);
  showTurn(`${icon} ${label}のターンです`);
  updateScore();
}
