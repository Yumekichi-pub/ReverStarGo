/* ============================================================
   online.js — オンライン対戦（P2P・ベータ）(Premium-v109 新規)

   離れた相手とインターネット越しに2人対戦する。
   - WebRTC (PeerJS) でスマホ同士が直接通信。サーバー・登録・費用なし
     （接続のきっかけ作りにのみ PeerJS の無料公開ブローカーを利用）
   - 送るのは「手」だけ ({q,r,s,gpColor})。パス・コウ・終局は両端末が
     同じルールで独立に計算する（決定論的なので状態は一致する）
   - 名前はアカウント名を自動交換 → 既存の名前表示・対戦成績・棋譜が
     そのまま機能する。ホスト=1局目の黒
   - URL に ?oltest を付けると BroadcastChannel（同一ブラウザ内）で
     通信する自動テスト用トランスポートに切り替わる
   依存: events.js(onCellClick), setup.js(executeMove/startGame),
         twoplayer.js(名前入力欄/selectTpMode), peerjs.min.js
   ============================================================ */

let online = null; // {transport, isHost, code, myColor, myName, oppName,
                   //  connected, applyingRemote, rematchLocal, rematchRemote,
                   //  helloReceived, started}

// Premium-v112: スマホで打ちやすいよう小文字に（紛らわしい l,o,0,1 は除外）
const OL_CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

function olActive() {
  return !!(online && online.connected && online.started);
}

// 自分のターン以外・リモート適用中は盤面入力を無効化（events.js から参照）
function onlineBlocksInput() {
  if (!olActive()) return false;
  return online.applyingRemote || current !== online.myColor;
}

function _olStatus(msg) {
  const el = document.getElementById('ol-status');
  if (el) el.textContent = msg;
}

function _olSetLobbyButtons(disabled) {
  const h = document.getElementById('ol-host-btn');
  const j = document.getElementById('ol-join-btn');
  if (h) h.disabled = disabled;
  if (j) j.disabled = disabled;
}

function _olMyName() {
  const n = (typeof getPlayerName === 'function' && getPlayerName()) || '';
  return (n || 'プレイヤー').slice(0, 7);
}

// ===== トランスポート =====
// PeerJS 版と、自動テスト用 BroadcastChannel 版（?oltest）を同じ形で返す。
// cb: { onOpen(), onData(obj), onClose(), onError(err) }
function _olCreateTransport(code, isHost, cb) {
  if (new URLSearchParams(location.search).has('oltest')) {
    const ch = new BroadcastChannel('rsg-ol-' + code);
    let opened = false;
    const open = () => { if (!opened) { opened = true; cb.onOpen(); } };
    ch.onmessage = (e) => {
      const m = e.data;
      if (m && m.sys === 'join' && isHost) { ch.postMessage({ sys: 'ack' }); open(); return; }
      if (m && m.sys === 'ack' && !isHost) { open(); return; }
      if (m && m.sys === 'close') { cb.onClose(); return; }
      if (m && 'd' in m) cb.onData(m.d);
    };
    if (!isHost) ch.postMessage({ sys: 'join' });
    return {
      send: (obj) => ch.postMessage({ d: obj }),
      close: () => { try { ch.postMessage({ sys: 'close' }); ch.close(); } catch (e) {} }
    };
  }
  // ===== PeerJS 版 =====
  const peerId = 'rsg-p2p-' + code;
  let conn = null;
  const peer = isHost ? new Peer(peerId) : new Peer();
  const bindConn = (c) => {
    conn = c;
    c.on('open', () => cb.onOpen());
    c.on('data', (d) => cb.onData(d));
    c.on('close', () => cb.onClose());
    c.on('error', (e) => cb.onError(e));
  };
  peer.on('error', (e) => cb.onError(e));
  if (isHost) {
    peer.on('connection', (c) => {
      if (conn) { try { c.close(); } catch (e) {} return; } // 2人目以降は拒否
      bindConn(c);
    });
  } else {
    peer.on('open', () => bindConn(peer.connect(peerId, { reliable: true })));
  }
  return {
    send: (obj) => { if (conn && conn.open) conn.send(obj); },
    close: () => { try { if (conn) conn.close(); } catch (e) {} try { peer.destroy(); } catch (e) {} }
  };
}

// ===== 部屋の作成・参加 =====
function olHost() {
  if (online) { olTeardown(false); _olStatus('キャンセルしました'); return; }
  let code = '';
  for (let i = 0; i < 4; i++) code += OL_CODE_CHARS[Math.floor(Math.random() * OL_CODE_CHARS.length)];
  _olBegin(code, true);
  _olStatus(`部屋コード【 ${code} 】を相手に伝えてください（接続を待っています…もう一度押すと中止）`);
}

function olJoinPrompt() {
  if (online) { olTeardown(false); _olStatus('キャンセルしました'); return; }
  const input = prompt('相手から聞いた部屋コードを入力してください（例: ab12）');
  if (!input) return;
  const code = input.trim().toLowerCase(); // 大文字で入力されても受け付ける
  if (code.length < 3) { alert('部屋コードが短すぎます'); return; }
  _olBegin(code, false);
  _olStatus(`部屋【 ${code} 】に接続しています…`);
}

function _olBegin(code, isHost) {
  online = {
    code, isHost, transport: null, myColor: isHost ? 'black' : 'white',
    myName: _olMyName(), oppName: '', connected: false, started: false,
    applyingRemote: false, rematchLocal: false, rematchRemote: false,
    helloReceived: false
  };
  online.transport = _olCreateTransport(code, isHost, {
    onOpen: () => {
      online.connected = true;
      online.transport.send({ t: 'hello', name: online.myName });
      _olStatus('接続しました。相手の情報を待っています…');
    },
    onData: (m) => _olOnMessage(m),
    onClose: () => _olOnDisconnect(),
    onError: (e) => {
      console.warn('[online] error', e);
      const type = e && e.type;
      if (type === 'peer-unavailable') {
        _olStatus('その部屋コードが見つかりません。コードを確認してください');
        olTeardown(false);
      } else if (!olActive()) {
        _olStatus('接続エラーが発生しました。通信環境を変えて再度お試しください');
        olTeardown(false);
      }
    }
  });
}

function _olOnMessage(m) {
  if (!online || !m || typeof m !== 'object') return;
  switch (m.t) {
    case 'hello':
      online.oppName = String(m.name || '相手').slice(0, 7);
      online.helloReceived = true;
      // ホストは両者の hello が揃ったら開始合図を送る
      if (online.isHost) {
        online.transport.send({ t: 'start' });
        _olStartGame();
      }
      break;
    case 'start':
      if (!online.isHost) _olStartGame();
      break;
    case 'mv':
      _olApplyRemoteMove(m.q, m.r, m.s, m.gp);
      break;
    case 'rematch':
      online.rematchRemote = true;
      _olMaybeRematch();
      break;
    case 'bye':
      _olOnDisconnect();
      break;
  }
}

// ===== ゲーム開始（両端末で同じ状態を作る）=====
function _olStartGame() {
  if (online.started) return;
  online.started = true;
  // battleMode を 2人対戦に、対戦形式は1局勝負に固定（RMのオンライン対応は今後）
  selectBattleMode('two');
  if (typeof selectTpMode === 'function') selectTpMode('single');
  // 名前: ホスト=黒、ゲスト=白（既存の名前表示・成績・棋譜がそのまま機能する）
  const b = document.getElementById('tp-black-name');
  const w = document.getElementById('tp-white-name');
  const blackName = online.isHost ? online.myName : online.oppName;
  const whiteName = online.isHost ? online.oppName : online.myName;
  if (b) b.value = blackName;
  if (w) w.value = whiteName;
  _olStatus('');
  _olSetLobbyButtons(false);
  startGame();
  showTurn(`🌐 対戦開始！ あなたは${online.myColor === 'black' ? '⚫黒（先手）' : '⚪白（後手）'}です`);
}

// ===== 手の送受信 =====
// executeMove の冒頭から呼ばれる（自分の手のみ送信）
function olMaybeSendMove(q, r, s, gpColor) {
  if (!olActive() || online.applyingRemote) return;
  online.transport.send({ t: 'mv', q, r, s, gp: gpColor });
}

async function _olApplyRemoteMove(q, r, s, gp) {
  if (!olActive()) return;
  // 自分側のアニメーションが終わるまで待つ
  let guard = 0;
  while ((isAnimating || pendingMove) && guard++ < 100) {
    await new Promise(res => setTimeout(res, 100));
  }
  online.applyingRemote = true;
  try {
    // onCellClick と同じコウ例外の帳簿づけ（両端末で判定が一致する）
    const allValid = getValidMoves(current);
    const valid = filterKoMoves(allValid, current);
    const needsKoException = valid.length === 0 && allValid.length > 0;
    if (needsKoException && prevKoException) { endGame(); return; }
    prevKoException = needsKoException && !prevKoException;
    await executeMove(q, r, s, gp === undefined ? null : gp);
  } catch (e) {
    console.error('[online] リモート手の適用に失敗', e);
  } finally {
    if (online) online.applyingRemote = false;
  }
}

// ===== もう1局（両者が押したら色を入れ替えて再戦）=====
// play-again ハンドラから呼ばれる。オンライン中に処理したら true を返す
function olHandlePlayAgain() {
  if (!olActive()) return false;
  if (!online.rematchLocal) {
    online.rematchLocal = true;
    online.transport.send({ t: 'rematch' });
    const btn = document.getElementById('play-again-btn');
    if (btn) { btn.textContent = '相手を待っています…'; btn.disabled = true; }
    _olMaybeRematch();
  }
  return true;
}

function _olMaybeRematch() {
  if (!online || !online.rematchLocal || !online.rematchRemote) return;
  online.rematchLocal = false;
  online.rematchRemote = false;
  online.myColor = opp(online.myColor); // 色を交代（名前欄は終局時に自動交代済み）
  const btn = document.getElementById('play-again-btn');
  if (btn) { btn.textContent = 'もう1局'; btn.disabled = false; }
  document.getElementById('result-modal').style.display = 'none';
  initGame();
  showTurn(`🌐 再戦！ あなたは${online.myColor === 'black' ? '⚫黒（先手）' : '⚪白（後手）'}です`);
}

// ===== 切断・退室 =====
function _olOnDisconnect() {
  if (!online) return;
  const wasInGame = olActive() && typeof gameStarted !== 'undefined' && gameStarted
    && document.getElementById('result-modal').style.display !== 'flex';
  olTeardown(false);
  _olStatus('');
  if (wasInGame) {
    alert('相手との接続が切れました。対局を終了します。');
    if (typeof backToSetupPage === 'function') backToSetupPage();
  } else {
    _olStatus('相手が退室しました');
  }
}

// 退室処理。sendBye=true なら相手に通知してから切る
function olTeardown(sendBye) {
  if (!online) return;
  const t = online.transport;
  const btn = document.getElementById('play-again-btn');
  if (btn) { btn.textContent = 'もう1局'; btn.disabled = false; }
  online = null;
  if (t) {
    try { if (sendBye) t.send({ t: 'bye' }); } catch (e) {}
    setTimeout(() => { try { t.close(); } catch (e) {} }, 200);
  }
}
