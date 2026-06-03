/* ============================================================
   sound.js — Web Audio API による効果音
   getAudioCtx() で AudioContext を遅延生成、playSound(type) で
   効果音を再生。soundEnabled フラグで全体オフ可能。
   ============================================================ */

// ===== 効果音（Web Audio API）=====
let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}

function playSound(type) {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;

    if (type === 'place') {
      // 石を置く：コツっとした低い打撃音
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (nextRandom() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.012));
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.55, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 320;
      filter.Q.value = 1.2;
      src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
      src.start(now);

    } else if (type === 'flip') {
      // ひっくり返す：軽いカチッ音
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(900, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.06);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.07);

    } else if (type === 'capture') {
      // 取り除き：ポン！という明るい音
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.18);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.18);

    } else if (type === 'win') {
      // 勝利：上昇する明るいファンファーレ
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = now + i * 0.13;
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0, t);
        gain.gain.linearRampToValueAtTime(0.28, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.28);
      });

    } else if (type === 'lose') {
      // 負け：下降する音
      const notes = [523, 415, 330, 262];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = now + i * 0.13;
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0, t);
        gain.gain.linearRampToValueAtTime(0.22, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.28);
      });

    } else if (type === 'draw') {
      // 引き分け：揺れる中音
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.linearRampToValueAtTime(480, now + 0.2);
      osc.frequency.linearRampToValueAtTime(440, now + 0.4);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.45);

    } else if (type === 'praise') {
      // v63: 「いい手」表示用 — 控えめな2音チャイム（A5 → D6）
      // 軽やかで上品、目立ちすぎない
      const notes = [880, 1175];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = now + i * 0.06;
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0, t);
        gain.gain.linearRampToValueAtTime(0.13, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.22);
      });

    } else if (type === 'capture-praise') {
      // v66: キャプチャ称賛 — 短い上昇3音（達成感のある成功音）
      // E5 → A5 → D6 の上昇形、triangle 波で温かみを出す
      const notes = [659, 880, 1175];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = now + i * 0.07;
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0, t);
        gain.gain.linearRampToValueAtTime(0.20, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.30);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.30);
      });

    } else if (type === 'fanfare') {
      // v67: パーフェクト用 — 豪華なファンファーレ
      // C5→E5→G5→C6→E6→G6 上昇形 + 最後にトレモロ
      const notes = [523, 659, 784, 1047, 1319, 1568];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = now + i * 0.10;
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0, t);
        gain.gain.linearRampToValueAtTime(0.30, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.40);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.40);
      });
      // 最後のトレモロ（G6 が華やかにシャラララ）
      for (let r = 0; r < 8; r++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = now + 0.7 + r * 0.08;
        osc.type = 'sine';
        osc.frequency.value = r % 2 === 0 ? 1568 : 1976;  // G6 / B6
        gain.gain.setValueAtTime(0.0, t);
        gain.gain.linearRampToValueAtTime(0.16, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.10);
      }

    } else if (type === 'applause') {
      // v67: 盤面制覇用 — 拍手音（高速ホワイトノイズバースト）
      const duration = 1.6;
      const bursts = 28;
      for (let i = 0; i < bursts; i++) {
        const t = now + i * (duration / bursts) + (Math.random() * 0.04);
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.04, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let j = 0; j < data.length; j++) {
          data[j] = (Math.random() * 2 - 1) * Math.exp(-j / (ctx.sampleRate * 0.008));
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 1500;
        gain.gain.setValueAtTime(0.20, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
        src.start(t);
      }
    }
  } catch(e) { /* AudioContext unavailable */ }
}
