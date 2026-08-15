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
                   //  helloReceived, started, moveLog, gameSeq,
                   //  reconnecting, replaying, retryTimer, retryUntil}

// Premium-v120: 中断した対局を復元するための保存キーと有効期限（30分）
const OL_SESSION_KEY = 'rsg-ol-session';
const OL_SESSION_TTL = 2 * 60 * 60 * 1000; // v122: 30分→2時間
const OL_RETRY_MS = 2000;        // 再接続の試行間隔
const OL_RETRY_LIMIT = 300000;   // あきらめるまで（v122: 2分→5分）

// Premium-v122: 数字4桁のほうが口頭でも伝えやすく入力も速いので数字のみに
const OL_CODE_CHARS = '0123456789';

// v140: 画面に出しているバージョンをそのまま使う（相手との食い違いを知らせる用）
function _olVersion() {
  const el = document.querySelector('.app-version');
  return (el && el.textContent.trim()) || '?';
}

function _olNewCode() {
  let c = '';
  for (let i = 0; i < 4; i++) c += OL_CODE_CHARS[Math.floor(Math.random() * OL_CODE_CHARS.length)];
  return c;
}

function olActive() {
  return !!(online && online.connected && online.started);
}

// 自分のターン以外・リモート適用中は盤面入力を無効化（events.js から参照）
function onlineBlocksInput() {
  // Premium-v120: 再接続中・復元中は着手させない（相手と状態がずれるため）
  if (online && (online.reconnecting || online.replaying)) return true;
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

// v133: 名前欄から読み戻す規則(trim → 7文字 → trim)と完全に同じ形にそろえる。
// 以前は trim を通していなかったため、名前の前後に空白がある人がホストになると
// 「黒の名前欄 === 自分の名前」が成立せず、両者とも白と判定されて誰も石を
// 置けなくなっていた。
function _olNorm(s) {
  return String(s == null ? '' : s).trim().slice(0, 7).trim();
}

// 同名対策の印を付けても7文字を超えないようにする
// （超えると名前欄に入れた値と読み戻した値がずれて、色の判定が壊れる）
function _olTagName(s) {
  return _olNorm(s.length >= 7 ? s.slice(0, 6) + '２' : s + '２');
}

function _olMyName() {
  const n = (typeof getPlayerName === 'function' && getPlayerName()) || '';
  return _olNorm(n) || 'プレイヤー';
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
      if (m && m.sys === 'join' && isHost) { ch.postMessage({ sys: 'ack' }); opened = false; open(); return; }
      if (m && m.sys === 'ack' && !isHost) { opened = false; open(); return; }
      if (m && m.sys === 'close') { cb.onClose(); return; }
      if (m && 'd' in m) cb.onData(m.d);
    };
    if (!isHost) ch.postMessage({ sys: 'join' });
    let chClosed = false;
    return {
      send: (obj) => { try { if (!chClosed) ch.postMessage({ d: obj }); } catch (e) {} },
      // Premium-v121: 再接続の再試行（ゲストが名乗り直す。ホストは待つだけ）
      retry: () => { try { if (!chClosed && !isHost) ch.postMessage({ sys: 'join' }); } catch (e) {} },
      dead: () => chClosed,
      isOpen: () => !chClosed,   // v133
      close: () => { try { ch.postMessage({ sys: 'close' }); ch.close(); } catch (e) {} chClosed = true; }
    };
  }
  // ===== PeerJS 版 =====
  // Premium-v125: 役割で挙動を明確に分ける。
  //   ホスト = 待ち受け（電話番号を確保して動かさない）
  //   ゲスト = 掛ける側（自分の電話機は自由に作り直してよい）
  // v123 まではホストも接続を作り直していたため、待ち受け番号が
  // 消えては復活する「動く標的」となり、ゲストの発信とすれ違い続けていた。
  const peerId = 'rsg-p2p-' + code;
  let conn = null;
  let peer = null;
  let destroyed = false;
  let opening = false;
  // v133: 電話機の作り直しを自前で予約する。以前は「作り直す」と書きながら
  // peer を捨てるだけで、外から retry() が呼ばれるのを待っていた。ところが
  // retry() を回すのは対局中の再接続ループだけなので、部屋を作った直後に
  // 失敗すると誰も作り直さず、画面には「接続を待っています」と出たまま
  // 待ち受けが存在しない状態になっていた（2部屋目以降で起きやすい）。
  let remakeTimer = null;
  let dialTimer = null;
  let openTimer = null;   // v134
  let lastErr = '';       // v134
  let attempts = 0;
  let dialFails = 0;
  let idTaken = 0;   // v140
  const scheduleRemake = (ms) => {
    if (destroyed || remakeTimer) return;
    remakeTimer = setTimeout(() => { remakeTimer = null; makePeer(); }, ms);
  };

  const attach = (c) => {
    conn = c;
    c.on('open', () => cb.onOpen());
    c.on('data', (d) => cb.onData(d));
    c.on('close', () => { if (conn === c) conn = null; cb.onClose(); });
    c.on('error', (e) => cb.onError(e));
  };

  const healthy = () => !!(peer && !peer.destroyed && !peer.disconnected && peer.open);

  const dial = () => {
    if (destroyed || isHost || !healthy()) return;  // ホストは待つだけ
    if (conn && conn.open) return;
    if (conn) { try { conn.close(); } catch (e) {} conn = null; }
    try { attach(peer.connect(peerId, { reliable: true })); } catch (e) {}
  };

  // v134: 窓口が混み合っていると、開通も失敗もしないまま黙り込むことがある。
  // その間 opening が立ちっぱなしになり、makePeer() の冒頭で弾かれるため、
  // 以後どの再試行も素通りしていた（結果、30秒待って「開けませんでした」）。
  // 一定時間で見切って電話機ごと作り直す。
  const OPEN_TIMEOUT = 6000;
  const clearOpenTimer = () => { if (openTimer) { clearTimeout(openTimer); openTimer = null; } };

  const makePeer = () => {
    if (destroyed || opening) return;
    opening = true;
    try {
      peer = isHost ? new Peer(peerId) : new Peer();
    } catch (e) {
      opening = false; peer = null; lastErr = 'construct';
      attempts++; scheduleRemake(1500);
      return;
    }
    clearOpenTimer();
    openTimer = setTimeout(() => {
      openTimer = null;
      if (destroyed || !opening) return;
      lastErr = 'timeout';
      try { if (peer) peer.destroy(); } catch (x) {}
      peer = null; opening = false;
      attempts++;
      scheduleRemake(600);
    }, OPEN_TIMEOUT);
    peer.on('open', () => { clearOpenTimer(); opening = false; attempts = 0; dialFails = 0; lastErr = ''; dial(); });
    peer.on('error', (e) => {
      const t = e && e.type;
      lastErr = t || 'unknown';   // v134
      clearOpenTimer();
      // 窓口がまだ古い登録を手放していない → 少し置いて作り直す（次の再試行に任せる）
      if (t === 'unavailable-id') {
        opening = false;
        try { peer.destroy(); } catch (x) {}
        peer = null;
        attempts++;
        idTaken++;
        // v140: 自分の直前の登録がまだ残っているだけなら数秒で解放されるので、
        // まずは同じ番号で粘る。それでも取れないなら本当に他所で使われている
        // ということなので、別の番号に切り替えてもらう（放置すると永久に開かない）。
        if (isHost && idTaken >= 3 && cb.onIdTaken) { cb.onIdTaken(); return; }
        scheduleRemake(Math.min(1200 * attempts, 5000));  // v133: 古い登録が消えるのを待って作り直す
        return;
      }
      // Premium-v129: 対局中の再接続なら相手がまだ戻っていないだけなので再試行に任せる。
      // 新規入室（コード入力）の場合は、部屋が無いことを利用者に知らせる必要がある
      if (t === 'peer-unavailable') {
        opening = false;
        if (online && online.started) return;  // 再接続中は黙って再試行
        // v133: 相手がまだ部屋を開け終えていないだけのことがあるので数回試す
        dialFails++;
        if (dialFails < 4) {
          if (!dialTimer) dialTimer = setTimeout(() => { dialTimer = null; dial(); }, 2500);
          return;
        }
        cb.onError(e);
        return;
      }
      // 通信まわりの一時的な失敗 → 電話機を作り直す
      if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') {
        opening = false;
        try { peer.destroy(); } catch (x) {}
        peer = null;
        attempts++;
        scheduleRemake(Math.min(1500 * attempts, 8000));  // v133
        return;
      }
      opening = false;
      cb.onError(e);
    });
    // 窓口との接続が切れたら復帰を試みる（スリープ復帰時によく起きる）
    peer.on('disconnected', () => {
      if (destroyed) return;
      try { peer.reconnect(); } catch (e) {}
    });
    if (isHost) {
      peer.on('connection', (c) => {
        if (conn && conn.open) { try { c.close(); } catch (e) {} return; } // 2人目は拒否
        attach(c);
      });
    }
  };

  makePeer();

  return {
    send: (obj) => { if (conn && conn.open) conn.send(obj); },
    // 再試行。ホストは待ち受けの健康チェックのみ、ゲストは掛け直す
    retry: () => {
      if (destroyed) return;
      if (!peer || peer.destroyed) { makePeer(); return; }
      if (peer.disconnected) {
        try { peer.reconnect(); }
        catch (e) { try { peer.destroy(); } catch (x) {} peer = null; makePeer(); }
        return;
      }
      if (!peer.open) return; // 開通待ち
      dial();
    },
    // ゲスト専用: 電話機ごと作り直す（ホストの待ち受けは絶対に壊さない）
    hardRetry: () => {
      if (destroyed || isHost) return;
      try { if (conn) conn.close(); } catch (e) {}
      conn = null;
      try { if (peer) peer.destroy(); } catch (e) {}
      peer = null; opening = false;
      makePeer();
    },
    // Premium-v125: 閉じられた通信路は retry も hardRetry も効かないため、
    // 外から作り直せるよう死活を公開する
    dead: () => destroyed,
    // v133: 部屋がほんとうに開けたかを外から確かめられるように
    isOpen: () => healthy(),
    // v134: つながらない原因の切り分け用
    // v138: notFound = 相手の待ち受けが見つからなかった（peer-unavailable を受けた）
    diag: () => ({ err: lastErr, tries: attempts, notFound: dialFails > 0 }),
    close: () => {
      destroyed = true;
      if (remakeTimer) { clearTimeout(remakeTimer); remakeTimer = null; }  // v133
      if (dialTimer) { clearTimeout(dialTimer); dialTimer = null; }
      clearOpenTimer();   // v134
      try { if (conn) conn.close(); } catch (e) {}
      try { if (peer) peer.destroy(); } catch (e) {}
      conn = null; peer = null;
    }
  };
}

// ===== 部屋の作成・参加 =====
function olHost() {
  // Premium-v114: 対局中は「部屋に戻る」として動作（設定画面→ゲーム画面へ復帰）
  if (online && online.started && online.connected) { olReturnToGame(); return; }
  if (online) { olTeardown(false); _olStatus('キャンセルしました'); olUpdateLobbyButtons(); return; }
  let code = '';
  code = _olNewCode();
  _olBegin(code, true);
  _olStatus(`部屋コード【 ${code} 】を用意しています…`);
  _olWatchHostRoom(code);   // v133
}

// v133: 窓口の登録に失敗しても「接続を待っています」と出し続けていたため、
// 相手が正しいコードを入れても永遠に見つからない状態になっていた。
// 実際に部屋が開けたかを見張り、開けたら案内を出し、駄目ならはっきり知らせる。
function _olWatchHostRoom(code) {
  _olStopHostWatch();
  if (!online) return;
  const LIMIT = 30000;
  let waited = 0;
  const tick = (first) => {
    if (!online || !online.isHost) { _olStopHostWatch(); return; }
    if (online.connected || online.started) { _olStopHostWatch(); return; }
    if (online.transport && online.transport.isOpen && online.transport.isOpen()) {
      _olStatus(`部屋コード【 ${code} 】を相手に伝えてください（接続を待っています…もう一度押すと中止）`);
      return;
    }
    if (!first) waited += 1000;
    if (waited >= LIMIT) {
      const diag = _olDiagText();   // v134: olTeardown で online が消える前に控える
      _olStopHostWatch();
      _olStatus('');
      olTeardown(false);
      olUpdateLobbyButtons();
      _olShowNotice('⚠ 部屋を開けませんでした\n中継サーバーに届きませんでした。少し時間をおくと直ることが多いです。\n急ぐときは、Wi-Fiを切ってモバイル通信で試すとつながることがあります。' + diag);
      _olProbeServer();   // v135
      return;
    }
    _olStatus(first ? `部屋コード【 ${code} 】を用意しています…` : `部屋コード【 ${code} 】を用意しています…（あと${Math.ceil((LIMIT - waited) / 1000)}秒）`);
  };
  tick(true);                                   // 開通済みならその場で案内を出す
  online.hostWatch = setInterval(() => tick(false), 1000);
}

function _olStopHostWatch() {
  if (online && online.hostWatch) { clearInterval(online.hostWatch); online.hostWatch = null; }
}

// v134: つながらないときに何が起きているかを短く添える（原因の切り分け用）
// v135: 失敗したとき、HTTP だけは通るのかを確かめて通知に書き足す。
// 「サーバー応答あり」なのに部屋が開けない＝WebSocket(wss) が塞がれている、
// と切り分けられる。逆に「届きません」なら経路ごと遮断されている。
function _olProbeServer() {
  const el = document.getElementById('ol-notice-text');
  if (!el || typeof fetch !== 'function') return;
  const base = el.textContent;
  let done = false;
  const show = (s) => {
    if (done) return;
    done = true;
    if (el.textContent === base) el.textContent = base + s;
  };
  setTimeout(() => show('\n（サーバー確認: 応答なし）'), 8000);
  fetch('https://0.peerjs.com/peerjs/id?ts=' + Date.now(), { cache: 'no-store' })
    .then((r) => show(r.ok ? '\n（サーバー確認: 応答あり → 通路が塞がれている可能性）'
                           : '\n（サーバー確認: ' + r.status + '）'))
    .catch(() => show('\n（サーバー確認: 届きません）'));
}

function _olDiagText() {
  try {
    const d = online && online.transport && online.transport.diag && online.transport.diag();
    if (!d) return '';
    const r = d.err === 'timeout' ? '応答なし'
            : d.err === 'network' ? '通信エラー'
            : d.err === 'server-error' ? 'サーバー応答不良'
            : (d.err || '不明');
    return `\n（診断: ${r} / 再試行${d.tries}回）`;
  } catch (e) { return ''; }
}

function olJoinPrompt() {
  // Premium-v114: 対局中は「退出する」として動作（確認つきで明示的に切断）
  if (online && online.started && online.connected) { olLeaveRoom(); return; }
  if (online) { olTeardown(false); _olStatus('キャンセルしました'); olUpdateLobbyButtons(); return; }
  const input = prompt('相手から聞いた部屋コード（数字4桁）を入力してください');
  if (!input) return;
  const code = input.trim().toLowerCase(); // 旧コード（英字）も受け付ける
  if (code.length < 3) { alert('部屋コードが短すぎます'); return; }
  _olBegin(code, false);
  _olStatus(`部屋【 ${code} 】に接続しています…`);
  // Premium-v129: 打ち間違いに気づけるよう、一定時間で見つからなければ知らせる
  online.joinTimer = setTimeout(() => {
    if (!online || online.started || online.connected) return;
    // v138: これまでは通信路が開けなかった場合まで「部屋が見つかりませんでした」と
    // 出していた。部屋自体は見つかっているのにコードを疑わせるのは筋が悪いので、
    // 「相手が居なかった」のか「相手は居たが道が通らなかった」のかで文言を分ける。
    //
    // 実例（2026-08 に特定）: Mac の Chrome で、同じWi-Fiのスマホとだけ繋がらない。
    //   原因は macOS の「ローカルネットワーク」権限が Chrome に対してオフだったこと。
    //   （システム設定 → プライバシーとセキュリティ → ローカルネットワーク）
    //   同じ機体の Safari では繋がるため、アプリ・ルーター・中継サーバーはいずれも
    //   無関係と切り分けられた。同種の相談があればここを最初に疑うとよい。
    const d = (online.transport && online.transport.diag) ? online.transport.diag() : null;
    const notFound = !d || d.notFound;
    const msg = notFound
      ? `⚠ 部屋【 ${code} 】が見つかりませんでした\n部屋コード（数字4桁）をもう一度ご確認ください`
      : `⚠ 部屋【 ${code} 】は見つかりましたが、通信路を開けませんでした\nブラウザの拡張機能や、お使いのネットワークが端末どうしの直接のやりとりを止めていることがあります。\n別のブラウザで開くか、片方をモバイル通信に切り替えるとつながることがあります。`;
    _olStatus('');
    olTeardown(false);
    olUpdateLobbyButtons();
    _olShowNotice(msg);
  }, 20000);
}

function _olBegin(code, isHost) {
  online = {
    code, isHost, transport: null, myColor: isHost ? 'black' : 'white',
    myName: _olMyName(), oppName: '', connected: false, started: false,
    applyingRemote: false, rematchLocal: false, rematchRemote: false,
    helloReceived: false,
    moveLog: [], gameSeq: 0,          // Premium-v120: 再接続時の照合用
    reconnecting: false, replaying: false, retryTimer: null, retryUntil: 0
  };
  _olConnect();
}

// トランスポートを作って接続する。再接続時も同じ経路を通る (Premium-v120)
function _olConnect() {
  const { code, isHost } = online;
  online.transport = _olCreateTransport(code, isHost, {
    onOpen: () => {
      if (!online) return;
      online.connected = true;
      if (online.joinTimer) { clearTimeout(online.joinTimer); online.joinTimer = null; } // Premium-v129
      if (online.started) {
        // 再接続: 対局の状態を送り合って、遅れている側が復元する
        _olStopReconnect();
        _olSetReconnectOverlay('🔌 再接続しました。対局を復元しています…', false);
        online.transport.send(_olSyncPayload());
      } else {
        online.transport.send({ t: 'hello', name: online.myName, v: _olVersion() });   // v140
        _olStatus('接続しました。相手の情報を待っています…');
      }
    },
    // v140: 部屋コードがすでに使われていた → 別のコードで開き直す
    onIdTaken: () => {
      if (!online || !online.isHost || online.started) return;
      const code = _olNewCode();
      olTeardown(false);
      _olBegin(code, true);
      _olStatus(`部屋コード【 ${code} 】は使われていたので、別のコードに変えました`);
      _olWatchHostRoom(code);
    },
    onData: (m) => _olOnMessage(m),
    onClose: () => _olOnDisconnect('lost'),
    onError: (e) => {
      console.warn('[online] error', e);
      const type = e && e.type;
      if (online && (online.reconnecting || online.started)) return; // 再接続中の失敗は握りつぶして再試行
      if (type === 'peer-unavailable') {
        // Premium-v129: 打ち間違いに気づけるよう、はっきり知らせる
        const _c = online ? online.code : '';
        const _d = _olDiagText();   // v134
        _olStatus('');
        olTeardown(false);
        olUpdateLobbyButtons();
        _olShowNotice(`⚠ 部屋【 ${_c} 】が見つかりませんでした\n部屋コード（数字4桁）をもう一度ご確認ください${_d}`);
      } else if (!olActive()) {
        _olStatus('接続エラーが発生しました。通信環境を変えて再度お試しください');
        olTeardown(false);
        olUpdateLobbyButtons();
      }
    }
  });
}

function _olOnMessage(m) {
  if (!online || !m || typeof m !== 'object') return;
  online.lastRecv = Date.now(); // Premium-v120: 生存確認用

  switch (m.t) {
    case 'hello':
      online.oppName = _olNorm(m.name) || '相手';  // v133
      online.helloReceived = true;
      // v140: 片方だけ古い版が残っていると原因の分からない不具合になるため知らせる
      if (m.v) {
        const _mv = _olVersion(), _ov = String(m.v).slice(0, 20);
        if (_ov !== _mv) _olBubble(`⚠ 相手のバージョンは ${_ov} です（こちらは ${_mv}）。片方が古いと不具合が出ることがあります`, 'cp');
      }
      // Premium-v122: すでに対局中なら新規開始せず、状態を送り返して復元させる
      // （片方が「前回の対局に再接続」、もう片方が新規接続だと、以前は
      //   開始フローが走って対局がリセットされていた）
      if (online.started) {
        online.transport.send(_olSyncPayload());
        _olStopReconnect();
        _olSetReconnectOverlay('', false);
        break;
      }
      // ホストは両者の hello が揃ったら開始合図を送る（対戦形式も同梱: Premium-v117）
      if (online.isHost) {
        online.transport.send({
          t: 'start',
          mode: (typeof tpMatchMode !== 'undefined' ? tpMatchMode : 'single'),
          clock: (typeof clockPreset !== 'undefined' ? clockPreset : 'off') // Premium-v128
        });
        // Premium-v118: ゲストが形式を確認して返事(fmt)するまで待つ
        _olStatus(`${online.oppName}さんが対戦形式を確認しています…`);
      }
      break;
    case 'start':
      // Premium-v122: 対局中なら無視（復帰した相手が新規開始しようとしている）
      if (online.started) { online.transport.send(_olSyncPayload()); break; }
      // Premium-v118: ゲストはホスト提案の形式を確認してから開始（1往復で決着）
      // Premium-v128: 時計はホストの設定に合わせる（部屋の主が決める）
      if (!online.isHost && typeof applyClockFromPeer === 'function') applyClockFromPeer(m.clock || 'off');
      if (!online.isHost) _olAskFormat(m.mode === 'reverse' ? 'reverse' : 'single');
      break;
    case 'fmt':
      if (online.started) break; // Premium-v122: 対局中なら無視（リセット防止）
      // Premium-v118: ゲストの最終決定が届いた（ホスト側で形式を合わせて開始）
      if (online.isHost) {
        if (typeof selectTpMode === 'function') selectTpMode(m.mode === 'reverse' ? 'reverse' : 'single');
        const _changed = m.changed;
        _olStartGame();
        if (_changed) {
          _olBubble(`🤝 ${online.oppName}の希望で${m.mode === 'reverse' ? 'リバースマッチ' : '1局勝負'}になりました`, 'cp');
        }
      }
      break;
    case 'mv':
      _olApplyRemoteMove(m.q, m.r, m.s, m.gp);
      break;
    case 'rematch':
      online.rematchRemote = true;
      _olMaybeRematch();
      break;
    case 'chat':
      _olBubble(`💬 ${online.oppName}「${String(m.text || '').slice(0, 30)}」`, 'chat');
      break;
    case 'gpwait':
      // Premium-v126: 相手が石を置いた場所を先に見せる（色の確定を待つ間も
      // どこに打たれたか分かるように）。以前は選択が終わるまで盤面が動かず、
      // 待っている側は打たれた場所が分からなかった
      if (typeof m.q === 'number' && typeof m.r === 'number') {
        pendingMoveMarker = [m.q, m.r, m.s];
        lastMove = null;
        render([]);
      }
      _olBubble('💠 CPコール待ち…', 'cp', { id: 'gpwait', sticky: true });
      break;
    case 'gpsel':
      // Premium-v114: 相手がCPコールの色を選んだ（待ち表示を置き換え）
      _olRemoveBubble('gpwait');
      // Premium-v126: 直後に本物の着手が届くので仮マーカーは片付ける
      pendingMoveMarker = null;
      _olBubble(m.c === 'black' ? '💠 CPコール黒' : '💠 CPコール白', 'cp');
      break;
    case 'ping':
      // Premium-v120: 心拍。受け取ったこと自体が「生きている」証拠
      break;
    case 'sync':
      // Premium-v120: 再接続後の状態照合。相手が進んでいれば自分が復元する
      _olHandleSync(m);
      break;
    case 'bye':
      _olOnDisconnect('left');
      break;
  }
}

// ===== 再接続と対局の復元 (Premium-v120) =====

// 自分の対局状態をひとまとめにする（相手へ送る / localStorage 保存に使う）
function _olSyncPayload() {
  return {
    t: 'sync',
    seq: online.gameSeq,
    moves: online.moveLog,
    mode: (typeof tpMatchMode !== 'undefined') ? tpMatchMode : 'single',
    blackName: (typeof tpNameFor === 'function') ? tpNameFor('black') : '',
    whiteName: (typeof tpNameFor === 'function') ? tpNameFor('white') : '',
    rm: (typeof tpRm !== 'undefined' && tpRm) ? JSON.parse(JSON.stringify(tpRm)) : null,
    name: online.myName
  };
}

// 相手の状態を受け取って比較。相手が先に進んでいれば自分の盤面を作り直す
async function _olHandleSync(p) {
  if (!online || !online.started) return;
  _olStopReconnect(); // Premium-v122: 相手の状態が届いた＝つながっている
  const mySeq = online.gameSeq, myLen = online.moveLog.length;
  const theirSeq = p.seq || 0, theirLen = (p.moves || []).length;
  const behind = (theirSeq > mySeq) || (theirSeq === mySeq && theirLen > myLen);
  if (behind) {
    await _olApplySync(p);
    _olBubble('🔌 対局を復元しました', 'cp');
  }
  // 進んでいる側は何もしない（相手が自分の sync を受け取って追いつく）
  _olSetReconnectOverlay('', false);
  // Premium-v128: 復元後は時計を仕切り直して再開（残り時間は同期しないため）
  if (typeof clockResetForRestore === 'function') clockResetForRestore();
  if (typeof clockResume === 'function') clockResume();
  _olSaveSession();
  _olStartHeartbeat();
  if (!behind) _olBubble('🔌 再接続しました', 'cp');
}

// 相手の状態にそろえる: 盤面をリセットして手を最初から無音・無アニメで再生する
async function _olApplySync(p) {
  online.replaying = true;
  const savedAnim = (typeof animationsEnabled !== 'undefined') ? animationsEnabled : true;
  if (typeof animationsEnabled !== 'undefined') animationsEnabled = false;
  try {
    if (typeof selectTpMode === 'function') selectTpMode(p.mode === 'reverse' ? 'reverse' : 'single');
    const b = document.getElementById('tp-black-name');
    const w = document.getElementById('tp-white-name');
    if (b) b.value = p.blackName || '';
    if (w) w.value = p.whiteName || '';
    if (typeof tpRm !== 'undefined') tpRm = p.rm ? JSON.parse(JSON.stringify(p.rm)) : null;
    online.gameSeq = p.seq || 0;
    online.moveLog = (p.moves || []).slice();
    // 表示中のモーダルを片付けてから再生
    document.getElementById('gp-modal').style.display = 'none';
    document.getElementById('result-modal').style.display = 'none';
    const _pm = document.getElementById('pass-modal');
    if (_pm) _pm.style.display = 'none';
    pendingMove = null;
    pendingMoveMarker = null; // Premium-v126: 復元時に仮マーカーを持ち越さない
    initGame();
    for (const mv of online.moveLog) {
      // onCellClick と同じコウ例外の帳簿づけ（判定を一致させる）
      const allValid = getValidMoves(current);
      const valid = filterKoMoves(allValid, current);
      const needsKo = valid.length === 0 && allValid.length > 0;
      if (needsKo && prevKoException) { endGame(); break; }
      prevKoException = needsKo && !prevKoException;
      await executeMove(mv.q, mv.r, mv.s, mv.gp === undefined ? null : mv.gp);
    }
    olSyncMyColor();
  } catch (e) {
    console.error('[online] 対局の復元に失敗', e);
  } finally {
    if (typeof animationsEnabled !== 'undefined') animationsEnabled = savedAnim;
    online.replaying = false;
  }
}

// ===== 一言チャット (Premium-v113) =====
function olSendChat() {
  if (!olActive()) return;
  const input = document.getElementById('ol-chat-input');
  if (!input) return;
  const text = input.value.trim().slice(0, 30);
  if (!text) return;
  online.transport.send({ t: 'chat', text });
  // Premium-v116: 自分側の吹き出しはやめて、入力欄からメッセージが
  // シュッと飛んでいくアニメーションで「送れた」ことを表現する
  _olFlyChat(text, input);
  input.value = '';
}

// 送信演出: 入力欄の位置からオレンジの吹き出しが盤面へ飛んで消える (Premium-v116)
function _olFlyChat(text, input) {
  const rect = input.getBoundingClientRect();
  const fly = document.createElement('div');
  fly.className = 'ol-chat-fly';
  fly.textContent = `💬 ${text}`;
  fly.style.left = `${rect.left + 8}px`;
  fly.style.top = `${rect.top}px`;
  document.body.appendChild(fly);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => fly.classList.add('ol-chat-fly-go'));
  });
  setTimeout(() => { if (fly.parentNode) fly.parentNode.removeChild(fly); }, 900);
}

// 盤面中央下寄りにふわっと出る吹き出し（Premium-v114: 種類別に色分け）
// kind: 'chat'(オレンジ) | 'cp'(パープル) / opts: { id, sticky }
function _olBubble(text, kind, opts) {
  const wrap = document.getElementById('ol-bubble-wrap');
  if (!wrap) return;
  opts = opts || {};
  if (opts.id) _olRemoveBubble(opts.id); // 同じIDの吹き出しは置き換え
  const div = document.createElement('div');
  div.className = 'ol-bubble ' + (kind === 'chat' ? 'ol-bubble-chat' : 'ol-bubble-cp');
  if (opts.id) div.dataset.olid = opts.id;
  div.textContent = text; // textContent なのでHTMLは無害化される
  wrap.appendChild(div);
  while (wrap.children.length > 3) wrap.removeChild(wrap.firstChild);
  if (!opts.sticky) {
    setTimeout(() => { div.classList.add('ol-bubble-out'); }, 5200);
    setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 6000);
  }
}

function _olRemoveBubble(id) {
  document.querySelectorAll(`[data-olid="${id}"]`).forEach(el => el.remove());
}

// チャットバーの表示/非表示（対局開始/終了時に切替）
function _olChatBar(show) {
  const bar = document.getElementById('ol-chat-bar');
  if (bar) bar.style.display = show ? 'flex' : 'none';
}

// ===== 部屋に戻る / 退出する (Premium-v114) =====
// 設定画面などから対局画面へ復帰する（接続・対局はそのまま）
function olReturnToGame() {
  document.querySelectorAll('.setup-page').forEach(p => { p.style.display = 'none'; });
  document.body.classList.remove('training-sun-bg', 'training-galaxy-bg', 'juku-mode');
}

// 確認つきで部屋から退出する（相手に通知して切断）
function olLeaveRoom() {
  if (!confirm(`部屋【 ${online.code} 】から退出しますか？\n対局は終了し、相手に通知されます。`)) return;
  _olClearSession();
  olTeardown(true);
  _olStatus('退出しました');
  olUpdateLobbyButtons();
}

// 接続状態に応じてボタンの表示を切り替える
// 通常時: 「部屋を作る」「部屋に入る」 / 対局中: 「▶ 部屋に戻る」「🚪 退出する」
function olUpdateLobbyButtons() {
  if (typeof olUpdateResumeButton === 'function') olUpdateResumeButton();
  const h = document.getElementById('ol-host-btn');
  const j = document.getElementById('ol-join-btn');
  if (!h || !j) return;
  const inRoom = !!(online && online.started && online.connected);
  h.textContent = inRoom ? '▶ 部屋に戻る' : '部屋を作る';
  j.textContent = inRoom ? '🚪 退出する' : '部屋に入る';
  if (inRoom) _olStatus(`対局中の部屋【 ${online.code} 】 相手: ${online.oppName}`);
}

// ===== 対戦形式の合意 (Premium-v118) =====
// ホストが選んだ形式をゲストに確認する。ゲストの選択がそのまま最終決定
// （ホストへの再確認はしない＝行き止まりが発生しない）
function _olAskFormat(hostMode) {
  const modal = document.getElementById('ol-format-modal');
  const text = document.getElementById('ol-format-text');
  const okBtn = document.getElementById('ol-format-ok');
  const altBtn = document.getElementById('ol-format-alt');
  if (!modal || !text || !okBtn || !altBtn) { // 保険: UIが無ければ提案通り開始
    if (typeof selectTpMode === 'function') selectTpMode(hostMode);
    _olFinishFormat(hostMode, false);
    return;
  }
  const isRm = hostMode === 'reverse';
  // Premium-v130: 対局時計も勝負を左右する条件なので必ず知らせる
  const _clockLabel = (typeof CLOCK_PRESETS !== 'undefined' && typeof clockPreset !== 'undefined'
    && CLOCK_PRESETS[clockPreset]) ? CLOCK_PRESETS[clockPreset].label : 'なし';
  const _clockLine = `<br><strong>⏱ 対局時計：${_olEsc(_clockLabel)}</strong>`;
  text.innerHTML = (isRm
    ? `${_olEsc(online.oppName)}さんの部屋は<br><strong>リバースマッチ（2局勝負）</strong>です。`
    : `${_olEsc(online.oppName)}さんの部屋は<br><strong>1局勝負</strong>です。`)
    + _clockLine + `<br>この内容で対戦しますか？`;
  okBtn.textContent = isRm ? '⚔ リバースマッチでOK' : '⚔ 1局勝負でOK';
  altBtn.textContent = isRm ? '1局勝負がいい' : 'リバースマッチがいい';
  okBtn.onclick = () => { modal.style.display = 'none'; _olFinishFormat(hostMode, false); };
  altBtn.onclick = () => {
    modal.style.display = 'none';
    _olFinishFormat(isRm ? 'single' : 'reverse', true);
  };
  modal.style.display = 'flex';
}

function _olEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ゲストの決定を確定してホストに伝え、両者で開始する
function _olFinishFormat(mode, changed) {
  if (!online) return;
  if (typeof selectTpMode === 'function') selectTpMode(mode);
  online.transport.send({ t: 'fmt', mode, changed });
  _olStartGame();
  if (changed) {
    _olBubble(`🤝 ${mode === 'reverse' ? 'リバースマッチ' : '1局勝負'}で対戦します`, 'cp');
  }
}

// ===== ゲーム開始（両端末で同じ状態を作る）=====
function _olStartGame() {
  if (online.started) return;
  online.started = true;
  // Premium-v117: 対戦形式はホストの選択に従う（リバースマッチもオンライン対応）。
  // ホストは自分の選択のまま、ゲストは start メッセージで合わせ済み
  selectBattleMode('two');
  // 同名対策: 両者が同じアカウント名だと色の対応付けが崩れるため、ゲスト側に「２」を付ける
  // （両端末で同じ規則を適用するので表示・記録が一致する）
  if (online.oppName === online.myName) {
    if (online.isHost) online.oppName = _olTagName(online.oppName);   // v133
    else online.myName = _olTagName(online.myName);
  }
  // 名前: ホスト=1局目の黒、ゲスト=白（既存の名前表示・成績・棋譜がそのまま機能する）
  const b = document.getElementById('tp-black-name');
  const w = document.getElementById('tp-white-name');
  const blackName = online.isHost ? online.myName : online.oppName;
  const whiteName = online.isHost ? online.oppName : online.myName;
  if (b) b.value = blackName;
  if (w) w.value = whiteName;
  _olStatus('');
  _olSetLobbyButtons(false);
  online.moveLog = [];   // Premium-v120: 新しい対局なので手ログをリセット
  online.gameSeq = 1;
  _olStartHeartbeat();
  startGame(); // 内部の tpPrepareMatch がリバースマッチなら tpRm を初期化する
  olSyncMyColor();
  _olSaveSession();
  _olChatBar(true);
  olUpdateLobbyButtons();
  showTurn(`🌐 対戦開始！ あなたは${online.myColor === 'black' ? '⚫黒（先手）' : '⚪白（後手）'}です`);
}

// Premium-v117: 自分の色は「黒の名前欄＝自分の名前か」から導出する。
// 名前欄の入れ替え（自動交代・RM2局目）は両端末で同一に走るため、
// これが常に正しい色の対応付けになる（手動で myColor を反転させる方式を廃止）
function olSyncMyColor() {
  if (!online) return;
  online.myColor = (typeof tpNameFor === 'function' && tpNameFor('black') === online.myName)
    ? 'black' : 'white';
}

// ===== 手の送受信 =====
// executeMove の冒頭から呼ばれる（自分の手のみ送信）
function olMaybeSendMove(q, r, s, gpColor) {
  if (!online || online.replaying) return; // 復元の再生中は送らない
  // Premium-v120: 自分・相手どちらの手も記録する（再接続時の照合に使う）
  if (online.started) online.moveLog.push({ q, r, s, gp: gpColor === undefined ? null : gpColor });
  if (!olActive() || online.applyingRemote) { _olSaveSession(); return; }
  online.transport.send({ t: 'mv', q, r, s, gp: gpColor });
  _olSaveSession();
}

// Premium-v114: CPコール選択画面を開いた/選んだことを相手に知らせる
function olNotifyGpWait(q, r, cs) {
  if (!olActive() || online.applyingRemote) return;
  // Premium-v126: 置いた場所も一緒に送り、相手の画面にも仮マーカーを出す
  online.transport.send({ t: 'gpwait', q, r, s: cs, c: current });
}
function olNotifyGpSelect(color) {
  if (!olActive() || online.applyingRemote) return;
  online.transport.send({ t: 'gpsel', c: color });
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
    _olRemoveBubble('gpwait'); // 保険: 選択通知が届かなくても手の適用で待ち表示を消す
    await executeMove(q, r, s, gp === undefined ? null : gp);
    // Premium-v114: CPコール通知は gpwait/gpsel の2段階方式に変更
    // （人間が実際に選択画面で選んだときだけ飛ぶ。自動コールでは飛ばない）
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
  // Premium-v117: リバースマッチ2局目への継続か、新しいマッチかを区別
  const _rmContinuing = (typeof tpRm !== 'undefined' && tpRm && tpRm.round === 2 && tpRm.r1);
  if (!_rmContinuing && typeof tpPrepareMatch === 'function') {
    tpPrepareMatch(); // 新マッチ（RM選択中なら新しいRMのゲーム1として初期化）
  }
  olSyncMyColor(); // 色は名前欄から導出（1局目終了時・終局時に名前は交代済み）
  const btn = document.getElementById('play-again-btn');
  if (btn) { btn.textContent = 'もう1局'; btn.disabled = false; }
  document.getElementById('result-modal').style.display = 'none';
  online.moveLog = [];      // Premium-v120: 次の対局用にリセットして連番を進める
  online.gameSeq = (online.gameSeq || 0) + 1;
  initGame();
  _olSaveSession();
  const _msg = _rmContinuing
    ? `🌐 リバースマッチ2局目！ あなたは${online.myColor === 'black' ? '⚫黒（先手）' : '⚪白（後手）'}です`
    : `🌐 再戦！ あなたは${online.myColor === 'black' ? '⚫黒（先手）' : '⚪白（後手）'}です`;
  showTurn(_msg);
}

// ===== 切断・退室 =====
function _olOnDisconnect(reason) {
  if (!online) return;
  // Premium-v124: 対局中の通信断は、すべて再接続ループに委ねる。
  // 特に再接続の「作り直し」中は自分で閉じた接続の close イベントが
  // 自分に届くが、以前はこれを本物の切断と誤認して終了処理に落ち、
  // 保存まで消していた（PC側が即「通信が切断されました」になり、
  // 再接続ボタンも消えていた原因）。'left'（相手の明示的な退出）のみ即終了。
  if (reason === 'lost' && online.started) {
    if (!online.reconnecting) _olStartReconnect();
    return; // 再接続中の close イベントは無視（ループが面倒を見る）
  }
  const oppName = online.oppName || '相手';
  const started = online.started; // 対局が始まっていたか
  _olClearSession();
  olTeardown(false);
  _olStatus('');
  const msg = reason === 'left'
    ? `🚪 ${oppName}が退室しました`
    : '⚡ 通信が切断されました';
  if (started) {
    // Premium-v116: alert をやめ、閉じるまで消えない専用ポップアップで通知
    _olShowNotice(msg);
  } else {
    // ロビー段階（対局前）はステータス表示だけで十分
    _olStatus(msg);
  }
}

// ===== 退室・切断の常設ポップアップ (Premium-v116) =====
// ボタンを押すまで消えない。押すとゲーム設定画面に戻る
function _olShowNotice(msg) {
  const modal = document.getElementById('ol-notice-modal');
  const text = document.getElementById('ol-notice-text');
  if (!modal || !text) { alert(msg); return; } // 保険
  text.textContent = msg;
  modal.style.display = 'flex';
}

function olNoticeClose() {
  const modal = document.getElementById('ol-notice-modal');
  if (modal) modal.style.display = 'none';
  document.getElementById('result-modal').style.display = 'none';
  if (typeof backToSetupPage === 'function') backToSetupPage();
}

// ===== 心拍による生存確認 (Premium-v120) =====
// スマホのスリープやアプリ破棄では切断通知が飛ばないことがあるため、
// 定期的に ping を送り、一定時間相手から何も届かなければ切断とみなす
const OL_PING_MS = 5000;
const OL_DEAD_MS = 16000;

function _olStartHeartbeat() {
  _olStopHeartbeat();
  if (!online) return;
  online.lastRecv = Date.now();
  online.pingTimer = setInterval(() => {
    if (!online || online.reconnecting) return;
    if (online.connected) { try { online.transport.send({ t: 'ping' }); } catch (e) {} }
    if (online.started && Date.now() - (online.lastRecv || 0) > OL_DEAD_MS) {
      _olStartReconnect(); // 無言のまま応答が途絶えた
    }
  }, OL_PING_MS);
}

function _olStopHeartbeat() {
  if (online && online.pingTimer) { clearInterval(online.pingTimer); online.pingTimer = null; }
}

// ===== 自動再接続 (Premium-v120) =====
function _olStartReconnect(msg) {
  if (!online || online.reconnecting) return;
  online.reconnecting = true;
  online.connected = false;
  online.retryUntil = Date.now() + OL_RETRY_LIMIT;
  online.retryCount = 0;
  // Premium-v128: 再接続中は時計を止める（通信断で時間を失わない）
  if (typeof clockPause === 'function') clockPause();
  _olSaveSession();
  _olSetReconnectOverlay(msg || '🔌 再接続を試みています…', true);
  // Premium-v125: 役割で再試行の中身を分ける。
  //   ホスト: 待ち受けを壊さない。窓口から切れていたら復帰させるだけ
  //   ゲスト: 掛け直す。数回だめなら自分の電話機ごと作り直す
  // （v123 はホストも接続を作り直していたため待ち受けが「動く標的」となり、
  //   ゲストの発信とすれ違い続けて永久に繋がらなかった）
  const tick = () => {
    if (!online || !online.reconnecting) return;
    if (Date.now() > online.retryUntil) { _olGiveUpReconnect(); return; }
    online.retryCount = (online.retryCount || 0) + 1;
    if (!online.transport || (online.transport.dead && online.transport.dead())) {
      // 通信路そのものが閉じられている場合は作り直す
      online.transport = null;
      _olConnect();
    } else {
      if (online.transport.retry) online.transport.retry();
      if (!online.isHost && online.retryCount % 5 === 0 && online.transport.hardRetry) {
        online.transport.hardRetry();
      }
    }
    online.retryTimer = setTimeout(tick, OL_RETRY_MS);
  };
  tick();
}

function _olStopReconnect() {
  if (!online) return;
  online.reconnecting = false;
  if (online.retryTimer) { clearTimeout(online.retryTimer); online.retryTimer = null; }
}

function _olGiveUpReconnect() {
  if (!online) return;
  const oppName = online.oppName || '相手';
  _olStopReconnect();
  _olSetReconnectOverlay('', false);
  // Premium-v121: 保存は残す（あとで「🔄 前回の対局に再接続」から再開できる）
  _olSaveSession();
  olTeardown(false);
  _olStatus('');
  olUpdateResumeButton();
  _olShowNotice(`⚡ ${oppName}と再接続できませんでした\n（ゲーム設定の「🔄 前回の対局に再接続」からやり直せます）`);
}

// ユーザーが「あきらめる」を押したとき
function olCancelReconnect() {
  if (!online) return;
  _olGiveUpReconnect();
}

// 再接続中のオーバーレイ表示。msg が空なら隠す
function _olSetReconnectOverlay(msg, showCancel) {
  const el = document.getElementById('ol-reconnect-modal');
  const tx = document.getElementById('ol-reconnect-text');
  const btn = document.getElementById('ol-reconnect-cancel');
  const sub = document.getElementById('ol-reconnect-sub');
  if (!el || !tx) return;
  if (!msg) { el.style.display = 'none'; return; }
  tx.textContent = msg;
  // Premium-v123: 残り秒数は「あと◯分待つのか」と不安にさせるので出さない
  if (sub) sub.style.display = showCancel ? '' : 'none';
  if (btn) btn.style.display = showCancel ? '' : 'none';
  el.style.display = 'flex';
}

// ===== 中断した対局の保存と復元 (Premium-v120) =====
// ページごと閉じられた場合（スマホがアプリを破棄した等）に備えて
// 部屋コードと対局内容を保存しておき、次回起動時に再開できるようにする
function _olSaveSession() {
  if (!online || !online.started) return;
  try {
    const p = _olSyncPayload();
    p.code = online.code;
    p.isHost = online.isHost;
    p.oppName = online.oppName;
    p.ts = Date.now();
    localStorage.setItem(OL_SESSION_KEY, JSON.stringify(p));
  } catch (e) {}
}

function _olClearSession() {
  try { localStorage.removeItem(OL_SESSION_KEY); } catch (e) {}
  olUpdateResumeButton();
}

function _olLoadSession() {
  try {
    const raw = localStorage.getItem(OL_SESSION_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || !p.code || !p.ts || (Date.now() - p.ts) > OL_SESSION_TTL) {
      localStorage.removeItem(OL_SESSION_KEY);
      return null;
    }
    return p;
  } catch (e) { return null; }
}

// 「前回の対局に再接続」ボタンの表示を更新（保存があるときだけ出す）
function olUpdateResumeButton() {
  const btn = document.getElementById('ol-resume-btn');
  if (!btn) return;
  const p = (online ? null : _olLoadSession());
  if (p) {
    btn.style.display = '';
    btn.textContent = `🔄 前回の対局に再接続（相手: ${p.oppName || '?'}）`;
  } else {
    btn.style.display = 'none';
  }
}

// 保存された対局を復元して同じ部屋につなぎ直す
async function olResumeSession() {
  const p = _olLoadSession();
  if (!p) { olUpdateResumeButton(); return; }
  // Premium-v121: 先に状態を組み立ててから接続する
  // （started を立てる前に開通すると hello が飛んで新規対局扱いになるため）
  online = {
    code: p.code, isHost: !!p.isHost, transport: null,
    myColor: 'black', myName: _olNorm(p.name) || _olMyName(), oppName: _olNorm(p.oppName) || '相手',  // v133
    connected: false, started: true,
    applyingRemote: false, rematchLocal: false, rematchRemote: false,
    helloReceived: true, moveLog: [], gameSeq: p.seq || 0,
    reconnecting: false, replaying: false, retryTimer: null, retryUntil: 0
  };
  selectBattleMode('two');
  await _olApplySync(p);      // 保存内容から盤面を復元
  _olChatBar(true);
  olUpdateLobbyButtons();
  olUpdateResumeButton();
  _olConnect();               // ここで初めて接続（onOpen では sync が飛ぶ）
  // Premium-v123: 復元した盤面をすぐ見せる（以前は設定画面のままで、
  // 「部屋を作る」を押して初めて盤面が出るため繋がったことに気づけなかった）
  olReturnToGame();
  _olStartReconnect('🔌 相手に接続しています…');
}

// Premium-v122: スリープ中はタイマーも止まるため、復帰した瞬間に
// 「制限時間はとっくに過ぎている」と判定されて即あきらめてしまっていた。
// 画面に戻ってきたら時間を仕切り直し、その場で再試行する。
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (!online || !online.started) return;
  if (online.connected) {
    // つながっているように見えても実際は切れていることがあるので、
    // 生存確認の基準時刻をリセットして ping を投げ直す
    online.lastRecv = Date.now();
    try { online.transport.send({ t: 'ping' }); } catch (e) {}
    return;
  }
  online.retryUntil = Date.now() + OL_RETRY_LIMIT;
  if (!online.reconnecting) _olStartReconnect();
  else if (online.transport && online.transport.retry) online.transport.retry();
});

// 退室処理。sendBye=true なら相手に通知してから切る
function olTeardown(sendBye) {
  if (!online) return;
  _olStopHostWatch();  // v133
  if (online.joinTimer) { clearTimeout(online.joinTimer); online.joinTimer = null; } // Premium-v129
  _olStopHeartbeat();
  _olStopReconnect();
  _olSetReconnectOverlay('', false);
  _olChatBar(false);
  const _bw = document.getElementById('ol-bubble-wrap');
  if (_bw) _bw.innerHTML = '';
  const t = online.transport;
  const btn = document.getElementById('play-again-btn');
  if (btn) { btn.textContent = 'もう1局'; btn.disabled = false; }
  online = null;
  if (t) {
    try { if (sendBye) t.send({ t: 'bye' }); } catch (e) {}
    setTimeout(() => { try { t.close(); } catch (e) {} }, 200);
  }
  olUpdateLobbyButtons();
}
