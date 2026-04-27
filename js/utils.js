/* ============================================================
   utils.js — 汎用ユーティリティ
   K: cube 座標 → 文字列キー
   isOnBoard: 座標が盤上か
   opp: 相手の色
   cellToPixel: cube 座標 → SVG ピクセル座標
   hexPoints: 六角形 6 頂点の座標文字列
   ============================================================ */

// ===== ユーティリティ =====
const K = (q,r,s) => `${q},${r},${s}`;
const isOnBoard = (q,r,s) => CELL_SET.has(K(q,r,s));
const opp = p => p === 'black' ? 'white' : 'black';

// pointy-top（上下に角）座標変換
function cellToPixel(q, r) {
  return [
    HEX_SIZE * (SQRT3 * q + SQRT3 / 2 * r),
    HEX_SIZE * (3 / 2 * r)
  ];
}

function hexPoints(cx, cy) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + Math.PI / 3 * i; // -90°スタートで上下に角
    pts.push(`${cx + HEX_SIZE * 0.92 * Math.cos(a)},${cy + HEX_SIZE * 0.92 * Math.sin(a)}`);
  }
  return pts.join(' ');
}
