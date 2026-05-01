/* ============================================================
   perfect.js — パーフェクト/盤面制覇 演出 (v67 新規)

   仕様:
   - battleMode === 'cpu' のみ
   - 通常対戦のみ（reverseMatch 中は対象外）
   - チュートリアル外
   - プレイヤー (humanColor) が勝者
   - 盤面の全 37 マスが自分の色で埋まっている（空白なし、敵の盤面駒なし）
   - moveQualityEnabled === false の時は完全に黙る（称賛メッセージ OFF と連動）

   2段階:
   - perfect : 上記 + 敵の合計石数 = 0 (取られた石も0) → 「パーフェクト🎉/完全制覇🎉」+ 花火 + ファンファーレ
   - dominant: 上記 + 敵の合計石数 > 0 → 「盤面制覇！/真っ◯に染めた！」+ 紙吹雪 + 拍手音

   依存: state (humanColor, battleMode, moveQualityEnabled, reverseMatch, isTutorial,
                tutorialMiniGame), config (ALL_CELLS), sound (playSound)
   ============================================================ */

const PERFECT_MESSAGES = ['パーフェクト🎉', '完全制覇🎉'];

function pickPerfectMessage() {
  return PERFECT_MESSAGES[Math.floor(Math.random() * PERFECT_MESSAGES.length)];
}

function pickDominantMessage() {
  // humanColor に応じて「真っ白／真っ黒」を切り替え
  const colorWord = humanColor === 'black' ? '真っ黒' : '真っ白';
  const messages = ['盤面制覇！', `${colorWord}に染めた！`];
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * パーフェクト/盤面制覇の判定。
 * @param {number} bTotal - 黒の合計石数（盤面+取り）
 * @param {number} wTotal - 白の合計石数
 * @param {number} bCount - 黒の盤面石数
 * @param {number} wCount - 白の盤面石数
 * @returns {'perfect'|'dominant'|null}
 */
function checkPerfectBonus(bTotal, wTotal, bCount, wCount) {
  if (!moveQualityEnabled) return null;            // 称賛メッセージ OFF と連動
  if (battleMode !== 'cpu') return null;
  if (reverseMatch) return null;                    // RM は通常勝負と扱いが違うので除外
  if (isTutorial || tutorialMiniGame) return null;

  // 勝者がプレイヤーか
  const isHumanWin = humanColor === 'black' ? bTotal > wTotal : wTotal > bTotal;
  if (!isHumanWin) return null;

  // 敵の盤面駒数 = 0 か（盤面に敵の駒が1つも残っていない）
  const enemyBoardCount = humanColor === 'black' ? wCount : bCount;
  if (enemyBoardCount > 0) return null;

  // 盤面の空白なし（自分の駒で全マスが埋まっている）
  const myBoardCount = humanColor === 'black' ? bCount : wCount;
  if (myBoardCount < ALL_CELLS.length) return null;

  // 敵の合計石数（取られた石含む）
  const enemyTotal = humanColor === 'black' ? wTotal : bTotal;

  return enemyTotal === 0 ? 'perfect' : 'dominant';
}

/**
 * パーフェクト or 盤面制覇の演出を実行する。
 * @param {'perfect'|'dominant'} kind
 */
function triggerPerfectBonus(kind) {
  const toast = document.getElementById('move-quality-toast');
  if (!toast) return;

  if (kind === 'perfect') {
    toast.className = 'mq-toast mq-perfect';
    toast.textContent = pickPerfectMessage();
    toast.style.display = 'block';
    toast.style.animation = 'none';
    void toast.offsetWidth;
    toast.style.animation = 'mqFadeInOut 4.5s ease forwards';
    setTimeout(() => { toast.style.display = 'none'; }, 4500);

    try { playSound('fanfare'); } catch (e) {}
    showFireworks(4500);
  } else {
    // dominant
    toast.className = 'mq-toast mq-dominant';
    toast.textContent = pickDominantMessage();
    toast.style.display = 'block';
    toast.style.animation = 'none';
    void toast.offsetWidth;
    toast.style.animation = 'mqFadeInOut 3s ease forwards';
    setTimeout(() => { toast.style.display = 'none'; }, 3000);

    try { playSound('applause'); } catch (e) {}
    showConfetti(3000);
  }
}

/**
 * 花火演出（Canvas不要、CSS animation の連射）。
 * @param {number} durationMs - 演出全体の長さ
 */
function showFireworks(durationMs) {
  const layer = document.getElementById('fireworks-layer');
  if (!layer) return;
  layer.innerHTML = '';
  layer.style.display = 'block';

  const colors = ['#ff4040', '#ffd700', '#40c0ff', '#ff80c0', '#a0ff40', '#ff8040', '#c080ff'];
  const burstCount = Math.max(4, Math.floor(durationMs / 700));
  const particlesPerBurst = 18;

  for (let b = 0; b < burstCount; b++) {
    setTimeout(() => {
      const cx = 18 + Math.random() * 64;  // %
      const cy = 22 + Math.random() * 46;  // %
      const color = colors[Math.floor(Math.random() * colors.length)];

      for (let p = 0; p < particlesPerBurst; p++) {
        const particle = document.createElement('div');
        particle.className = 'firework-particle';
        const angle = (p / particlesPerBurst) * 2 * Math.PI + Math.random() * 0.2;
        const distance = 70 + Math.random() * 70;
        const dx = Math.cos(angle) * distance;
        const dy = Math.sin(angle) * distance;
        particle.style.left = cx + '%';
        particle.style.top = cy + '%';
        particle.style.background = color;
        particle.style.color = color;  // box-shadow currentColor 用
        particle.style.setProperty('--dx', dx + 'px');
        particle.style.setProperty('--dy', dy + 'px');
        layer.appendChild(particle);
        setTimeout(() => { try { particle.remove(); } catch(e) {} }, 1500);
      }
    }, b * 600);
  }

  setTimeout(() => {
    layer.style.display = 'none';
    layer.innerHTML = '';
  }, durationMs + 800);
}

/**
 * 紙吹雪演出（盤面制覇用、controlled 派手さ）。
 * @param {number} durationMs
 */
function showConfetti(durationMs) {
  const layer = document.getElementById('confetti-layer');
  if (!layer) return;
  layer.innerHTML = '';
  layer.style.display = 'block';

  const colors = ['#ff4040', '#ffd700', '#40c0ff', '#ff80c0', '#a0ff40', '#ff8040', '#c080ff', '#ffffff'];
  const count = 70;

  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = (Math.random() * 0.8) + 's';
    piece.style.animationDuration = (1.8 + Math.random() * 1.4) + 's';
    piece.style.setProperty('--rot', (Math.random() * 540 + 180) + 'deg');
    piece.style.setProperty('--xshift', (Math.random() * 60 - 30) + 'px');
    layer.appendChild(piece);
  }

  setTimeout(() => {
    layer.style.display = 'none';
    layer.innerHTML = '';
  }, durationMs + 800);
}
