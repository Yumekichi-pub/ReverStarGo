/* ============================================================
   twoplayer.js — 2人対戦の名前入力と対戦成績 (Premium-v101 新規)

   特定の相手との対戦を名前つきで記録し、通算成績と対局一覧を
   「対戦設定画面 → これまでの対戦成績」から見られるようにする。
   - 名前は任意入力。両方入っている対局だけ記録する
     （未入力なら従来どおり黒/白の対戦として遊べる）
   - 同じ2人の組み合わせは色（先手/後手）を入れ替えても同一シリーズ
   - CPU対戦のランク・戦績には一切影響しない
   保存: localStorage 'rsg2pRecords'（records.js の署名形式を利用）
   依存: records.js (_rsgPack/_rsgUnpack), setup.js (battleMode)
   ============================================================ */

const TP_RECORDS_KEY = 'rsg2pRecords';

// Premium-v105: 対戦形式 'single'(1局勝負) | 'reverse'(リバースマッチ=2局合計)
let tpMatchMode = 'single';
// 進行中の2人対戦リバースマッチ。null=なし
// { round: 1|2, aName: 1局目に黒の人, bName: 1局目に白の人,
//   r1: {bs,ws,bc,wc} 1局目の黒/白のスコアと囲み取り数 }
let tpRm = null;

function selectTpMode(mode) {
  tpMatchMode = mode;
  document.querySelectorAll('[data-tpmode]').forEach(b => b.classList.remove('selected'));
  const btn = document.querySelector(`[data-tpmode="${mode}"]`);
  if (btn) btn.classList.add('selected');
  const desc = document.getElementById('tp-mode-desc');
  if (desc) {
    desc.textContent = mode === 'reverse'
      ? '先手・後手を1局ずつ担当し、2局の合計石数で勝敗を決めます（先手有利なし）'
      : '1局ごとに勝敗を決めます';
  }
  const data = loadTpData();
  data.lastMode = mode;
  saveTpData(data);
}

// 対局開始前の準備。startGame と「もう1局」から呼ばれる。
// 戻り値: 'rm'(リバースマッチ開始) | 'single' | 'need-names'(RMだが名前不足)
function tpPrepareMatch() {
  if (battleMode === 'two' && tpMatchMode === 'reverse') {
    const a = tpNameFor('black');
    const b = tpNameFor('white');
    if (!a || !b) return 'need-names';
    tpRm = { round: 1, aName: a, bName: b, r1: null };
    return 'rm';
  }
  tpRm = null;
  return 'single';
}

function loadTpData() {
  try {
    const u = _rsgUnpack(localStorage.getItem(TP_RECORDS_KEY));
    if (u && u !== '__TAMPERED__' && !u.__legacy__ && Array.isArray(u.matches)) return u;
  } catch (e) {}
  return { players: [], matches: [], lastB: '', lastW: '' };
}

function saveTpData(data) {
  try { localStorage.setItem(TP_RECORDS_KEY, _rsgPack(data)); } catch (e) {}
}

// 現在の入力欄の名前（trim + 7文字制限）。欄が無ければ空文字
function tpNameFor(color) {
  const el = document.getElementById(color === 'black' ? 'tp-black-name' : 'tp-white-name');
  if (!el) return '';
  return el.value.trim().slice(0, 7);
}

function tpSwapNames() {
  const b = document.getElementById('tp-black-name');
  const w = document.getElementById('tp-white-name');
  if (!b || !w) return;
  const t = b.value; b.value = w.value; w.value = t;
}

// 「2人で対戦」を選んだときに呼ぶ: 前回の名前を復元
function updateTpNameSection() {
  const data = loadTpData();
  const b = document.getElementById('tp-black-name');
  const w = document.getElementById('tp-white-name');
  if (b && !b.value && data.lastB) b.value = data.lastB;
  if (w && !w.value && data.lastW) w.value = data.lastW;
  // Premium-v105: 前回の対戦形式を復元
  selectTpMode(data.lastMode === 'reverse' ? 'reverse' : 'single');
}

// ===== 名前履歴ドロップダウン (Premium-v106) =====
// ▼ボタンで過去に使った名前の一覧を表示し、タップでその欄に入れる。
// （datalist は入力中の文字で絞り込まれてしまい「履歴一覧」にならないため独自実装）
function toggleTpNameMenu(color) {
  const menu = document.getElementById(`tp-name-menu-${color}`);
  if (!menu) return;
  const opened = menu.style.display !== 'none';
  closeTpNameMenus();
  if (opened) return; // 開いていたら閉じるだけ
  const players = loadTpData().players;
  if (players.length === 0) {
    menu.innerHTML = '<div class="tp-name-menu-empty">まだ履歴がありません</div>';
  } else {
    menu.innerHTML = players.map(p =>
      `<button type="button" onclick="pickTpName('${color}', this.textContent)">${_tpEsc(p)}</button>`
    ).join('');
  }
  menu.style.display = '';
  // メニュー外をタップしたら閉じる（1回だけのリスナー）
  setTimeout(() => {
    document.addEventListener('click', _tpMenuOutsideClose, { once: true });
  }, 0);
}

function _tpMenuOutsideClose(e) {
  if (e.target.closest && e.target.closest('.tp-input-wrap')) {
    // 入力欄まわりのタップなら開いたままにする（再登録）
    document.addEventListener('click', _tpMenuOutsideClose, { once: true });
    return;
  }
  closeTpNameMenus();
}

function closeTpNameMenus() {
  document.querySelectorAll('.tp-name-menu').forEach(m => { m.style.display = 'none'; });
}

function pickTpName(color, name) {
  const el = document.getElementById(color === 'black' ? 'tp-black-name' : 'tp-white-name');
  if (el) el.value = name;
  closeTpNameMenus();
}

function _tpEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 対局終了時に undo.js endGame から呼ばれる
// result: 'b' | 'w' | 'd'（同点タイブレーク適用後の最終結果）
function recordTpMatch(bScore, wScore, result) {
  const bn = tpNameFor('black');
  const wn = tpNameFor('white');
  if (!bn || !wn) return; // 名前未入力の対局は記録しない
  const data = loadTpData();
  const now = new Date();
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  data.matches.push({ d, b: bn, w: wn, bs: bScore, ws: wScore, r: result });
  // 名前候補リスト更新（最近使った順・最大20名）
  for (const n of [bn, wn]) {
    const i = data.players.indexOf(n);
    if (i >= 0) data.players.splice(i, 1);
    data.players.unshift(n);
  }
  data.players = data.players.slice(0, 20);
  data.lastB = bn;
  data.lastW = wn;
  saveTpData(data);
}

// リバースマッチ（2局合計）の結果を記録 (Premium-v105)
// a/b: 1局目黒/白の人, as/bs: それぞれの2局合計, r: 'a'|'b'|'d'
function recordTpRm(a, b, as, bs, r) {
  const data = loadTpData();
  const now = new Date();
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  data.matches.push({ d, t: 'rm', a, b, as, bs, r });
  for (const n of [a, b]) {
    const i = data.players.indexOf(n);
    if (i >= 0) data.players.splice(i, 1);
    data.players.unshift(n);
  }
  data.players = data.players.slice(0, 20);
  // 次回復元は現在の入力欄（2局目終了時点＝入れ替わった状態）の並びで
  data.lastB = tpNameFor('black');
  data.lastW = tpNameFor('white');
  saveTpData(data);
}

// 対局終了後に呼ぶ: 次の1局に向けて先手(黒)と後手(白)を自動で入れ替え、
// 次回起動時の復元名も入れ替え後の並びにしておく (Premium-v102)
function tpAutoSwapAfterGame() {
  tpSwapNames();
  const data = loadTpData();
  data.lastB = tpNameFor('black');
  data.lastW = tpNameFor('white');
  saveTpData(data);
}

// ===== 対戦成績モーダル =====

// 対局レコードから2人の名前ペア（ソート済み）を取り出す（単局/RM両対応）
function _tpPairOf(m) {
  return (m.t === 'rm' ? [m.a, m.b] : [m.b, m.w]).sort();
}

// 表示中のシリーズ一覧（削除ボタン用。onclick に名前を直接埋め込まないための対応表）
let _tpSeriesPairs = [];

// シリーズ（特定の2人の記録）を確認つきで削除する (Premium-v104)
function deleteTpSeries(pairIdx) {
  const pair = _tpSeriesPairs[pairIdx];
  if (!pair) return;
  const [nA, nB] = pair;
  const data = loadTpData();
  const count = data.matches.filter(m => {
    const k = _tpPairOf(m);
    return k[0] === nA && k[1] === nB;
  }).length;
  if (!confirm(`「${nA} vs ${nB}」の対戦記録（${count}局）をすべて削除しますか？\nこの操作は取り消せません。`)) return;
  data.matches = data.matches.filter(m => {
    const k = _tpPairOf(m);
    return !(k[0] === nA && k[1] === nB);
  });
  saveTpData(data);
  showTpRecords(); // 再描画（全部消えたら「まだ記録がありません」表示になる）
}

function showTpRecords() {
  const data = loadTpData();
  const body = document.getElementById('tp-records-body');
  if (!body) return;
  if (data.matches.length === 0) {
    body.innerHTML = '<p class="tp-empty">まだ記録がありません。<br>プレイヤー名を入れて対局すると、<br>ここに対戦成績が残っていきます。</p>';
  } else {
    // ペアごとにグループ化（名前2つをソートしてキー化 → 色を入れ替えても同一シリーズ）
    const groups = new Map();
    data.matches.forEach((m, idx) => {
      const key = _tpPairOf(m).join('\u0000');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ ...m, idx });
    });
    // 最後に対局したシリーズを上に
    const sorted = [...groups.values()].sort((a, b) => b[b.length - 1].idx - a[a.length - 1].idx);
    _tpSeriesPairs = sorted.map(list => _tpPairOf(list[0]));
    body.innerHTML = sorted.map((list, si) => {
      const pair = _tpPairOf(list[0]);
      const nA = pair[0], nB = pair[1];
      let winA = 0, winB = 0, draw = 0;
      for (const m of list) {
        if (m.r === 'd') { draw++; continue; }
        const winner = m.t === 'rm'
          ? (m.r === 'a' ? m.a : m.b)
          : (m.r === 'b' ? m.b : m.w);
        if (winner === nA) winA++; else winB++;
      }
      const rows = list.slice().reverse().map((m, i) => {
        const no = list.length - i;
        const dd = m.d.slice(5).replace('-', '/');
        let aCell, bCell, res;
        if (m.t === 'rm') {
          // リバースマッチ: 2局合計。両者が黒白両方を担当するので RM マークで表示
          const aScore = (m.a === nA) ? m.as : m.bs;
          const bScore = (m.a === nA) ? m.bs : m.as;
          aCell = `<span class="tp-rm-mark">RM</span>${aScore}`;
          bCell = `<span class="tp-rm-mark">RM</span>${bScore}`;
          res = m.r === 'd' ? '引き分け' : `${_tpEsc(m.r === 'a' ? m.a : m.b)}の勝ち`;
        } else {
          const aIsBlack = (m.b === nA);
          aCell = aIsBlack ? `●${m.bs}` : `○${m.ws}`;
          bCell = aIsBlack ? `○${m.ws}` : `●${m.bs}`;
          res = m.r === 'd' ? '引き分け' : `${_tpEsc(m.r === 'b' ? m.b : m.w)}の勝ち`;
        }
        return `<tr><td>${no}</td><td>${dd}</td><td>${aCell}</td><td>${bCell}</td><td>${res}</td></tr>`;
      }).join('');
      const drawTxt = draw > 0 ? `・引き分け${draw}` : '';
      return `
        <div class="tp-series">
          <div class="tp-series-head">⚔ ${_tpEsc(nA)} vs ${_tpEsc(nB)}
            <button class="tp-del-btn" onclick="deleteTpSeries(${si})" title="この2人の記録を削除">🗑 削除</button>
          </div>
          <div class="tp-series-total">通算：${_tpEsc(nA)} ${winA}勝 − ${_tpEsc(nB)} ${winB}勝${drawTxt}</div>
          <table class="tp-table">
            <thead><tr><th>#</th><th>日付</th><th>${_tpEsc(nA)}</th><th>${_tpEsc(nB)}</th><th>結果</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }).join('');
  }
  document.getElementById('tp-records-modal').style.display = 'flex';
}

function closeTpRecords() {
  document.getElementById('tp-records-modal').style.display = 'none';
}
