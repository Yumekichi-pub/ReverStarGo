/* ============================================================
   clock.js — 対局時計（持ち時間＋秒読み） (Premium-v128 新規)

   2人対戦（同じ端末・オンラインの両方）で使えるチェスクロック方式。
   - 手番側の時間だけ減る。着手で相手に切り替わる
   - 持ち時間を使い切ると秒読みへ。1手打つたびに秒読みがリセット（囲碁式）
   - 秒読みも尽きたら「時間切れ」を知らせるが、対局は続行する
     （離席・通信断がそのまま敗北にならない安全設計）
   - CPコール選択中・パス表示中・再接続中・復元中は自動的に止まる

   保存: 設定は localStorage 'rsg-clock' に記憶
   依存: state.js(current, battleMode), render.js, online.js(任意)
   ============================================================ */

const CLOCK_KEY = 'rsg-clock';

// 選べる持ち時間。main=持ち時間(秒) / byo=秒読み(秒)
const CLOCK_PRESETS = {
  off:   { label: 'None',          main: 0,    byo: 0  },
  b30:   { label: '30s per move',  main: 0,    byo: 30 },
  m3:    { label: '3m + 30s',       main: 180,  byo: 30 },
  m10:   { label: '10m + 30s',      main: 600,  byo: 30 },
  m15:   { label: '15m + 60s',      main: 900,  byo: 60 },
};

let clockPreset = 'off';
// 各色の残り: { main: 残り持ち時間(ms), byo: 残り秒読み(ms), inByo: 秒読み中か, over: 時間切れ済みか }
let clockState = null;
let clockTimer = null;
let clockTickFrom = 0;   // 現在の手番の計測開始時刻
let clockRunning = false;

function clockEnabled() {
  return clockPreset !== 'off' && !!clockState;
}

// ===== 設定 =====
function selectClock(key) {
  if (!CLOCK_PRESETS[key]) key = 'off';
  clockPreset = key;
  document.querySelectorAll('[data-clock]').forEach(b => b.classList.remove('selected'));
  const btn = document.querySelector(`[data-clock="${key}"]`);
  if (btn) btn.classList.add('selected');
  const desc = document.getElementById('clock-desc');
  if (desc) {
    const p = CLOCK_PRESETS[key];
    desc.textContent = key === 'off'
      ? 'Play without a clock'
      : (p.main > 0
          ? `When your ${Math.floor(p.main / 60)}-minute main time runs out, you get ${p.byo} seconds per move`
          : `${p.byo} seconds per move, reset every time you play`);
  }
  try { localStorage.setItem(CLOCK_KEY, key); } catch (e) {}
}

function loadClockSetting() {
  let key = 'off';
  try { key = localStorage.getItem(CLOCK_KEY) || 'off'; } catch (e) {}
  selectClock(CLOCK_PRESETS[key] ? key : 'off');
}

// オンライン対戦でホストの設定に合わせるとき用
function applyClockFromPeer(key) {
  if (CLOCK_PRESETS[key]) selectClock(key);
}

// ===== 対局の開始・終了 =====
// initGame から呼ぶ。2人対戦以外や「なし」のときは時計を消す
function clockInit() {
  clockStop();
  const on = (battleMode === 'two') && clockPreset !== 'off';
  if (!on) {
    clockState = null;
    _clockRender();
    return;
  }
  const p = CLOCK_PRESETS[clockPreset];
  const fresh = () => ({ main: p.main * 1000, byo: p.byo * 1000, inByo: p.main === 0, over: false });
  clockState = { black: fresh(), white: fresh() };
  _clockRender();
}

// 最初の着手があったら動き出す（開始直後にいきなり減らない）
function clockStart() {
  if (!clockEnabled() || clockRunning) return;
  clockRunning = true;
  clockTickFrom = Date.now();
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(_clockTick, 200);
}

function clockStop() {
  clockRunning = false;
  if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
}

// 一時停止（CPコール選択中・パス表示中・再接続中など）
function clockPause() {
  if (!clockRunning) return;
  _clockConsume();
  clockStop();
}

function clockResume() {
  if (!clockEnabled()) return;
  if (typeof gameStarted !== 'undefined' && !gameStarted) return;
  clockStart();
}

// 着手が完了して手番が変わるときに呼ぶ（秒読みのリセットもここ）
function clockOnMoveDone(colorMoved) {
  if (!clockEnabled()) return;
  _clockConsume();
  const st = clockState[colorMoved];
  if (st && st.inByo && !st.over) {
    st.byo = CLOCK_PRESETS[clockPreset].byo * 1000; // 秒読みは1手ごとに戻る
  }
  clockTickFrom = Date.now();
  _clockRender();
}

// ===== 内部処理 =====
// 経過分を手番側から差し引く
function _clockConsume() {
  if (!clockEnabled() || !clockRunning) return;
  const now = Date.now();
  const dt = now - clockTickFrom;
  clockTickFrom = now;
  const st = clockState[current];
  if (!st || st.over) return;
  if (!st.inByo) {
    st.main -= dt;
    if (st.main <= 0) {
      // 持ち時間を使い切った分は秒読みから引かず、秒読み開始とする
      st.main = 0;
      st.inByo = true;
      st.byo = CLOCK_PRESETS[clockPreset].byo * 1000;
      if (st.byo <= 0) { st.over = true; _clockNotifyOver(current); }
    }
  } else {
    st.byo -= dt;
    if (st.byo <= 0) {
      st.byo = 0;
      if (!st.over) { st.over = true; _clockNotifyOver(current); }
    }
  }
}

function _clockTick() {
  _clockConsume();
  _clockRender();
}

// 時間切れの通知（対局は続行する）
function _clockNotifyOver(color) {
  const name = (typeof tpNameFor === 'function' && tpNameFor(color)) || (color === 'black' ? 'Black' : 'White');
  const msg = `⏰ ${name} has run out of time (the game can continue)`;
  if (typeof _olBubble === 'function' && typeof olActive === 'function' && olActive()) {
    _olBubble(msg, 'cp');
  }
  const el = document.getElementById(color === 'black' ? 'black-clock' : 'white-clock');
  if (el) el.classList.add('clock-over');
  try { if (typeof playSound === 'function') playSound('capture'); } catch (e) {}
}

function _fmt(ms) {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(t / 60), s = t % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}`;
}

function _clockRender() {
  for (const color of ['black', 'white']) {
    const el = document.getElementById(color === 'black' ? 'black-clock' : 'white-clock');
    if (!el) continue;
    if (!clockEnabled()) { el.style.display = 'none'; continue; }
    const st = clockState[color];
    el.style.display = '';
    el.classList.toggle('clock-active', clockRunning && current === color);
    el.classList.toggle('clock-byo', st.inByo && !st.over);
    el.classList.toggle('clock-over', st.over);
    if (st.over) el.textContent = '⏰ Time up';
    else if (st.inByo) el.textContent = `⏳ ${_fmt(st.byo)}`;
    else el.textContent = `⏱ ${_fmt(st.main)}`;
  }
}

// 再接続の復元後などに状態を作り直す（手数から復元はできないので初期値に戻す）
function clockResetForRestore() {
  if (!clockEnabled()) return;
  clockInit();
}
