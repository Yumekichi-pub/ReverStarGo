/* ============================================================
   effects.js — 花火 + レベル解放演出
   ランクアップ・レベル解放時の祝福アニメーション。
   - launchFireworks: HTML5 Canvas での花火エフェクト
   - showLevelUnlock / showPromoAnnounce: 専用モーダル表示
   依存：DOM、updateLevelButtons（settings.js）。
   ============================================================ */

// ===== 花火アニメーション =====
function launchFireworks(duration) {
  const canvas = document.getElementById('fireworks-canvas');
  canvas.style.display = '';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const particles = [];
  const colors = ['#ff4444','#ffaa00','#ffff00','#44ff44','#4488ff','#ff44ff','#00ffff','#ffd700'];
  const startTime = Date.now();

  function createBurst(x, y) {
    const color = colors[Math.floor(nextRandom() * colors.length)];
    const count = 30 + Math.floor(nextRandom() * 20);
    for (let i = 0; i < count; i++) {
      const angle = nextRandom() * Math.PI * 2;
      const speed = 2 + nextRandom() * 4;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.01 + nextRandom() * 0.015,
        color,
        size: 2 + nextRandom() * 3,
      });
    }
  }

  let lastBurst = 0;
  function animate() {
    const elapsed = Date.now() - startTime;
    if (elapsed > duration) {
      canvas.style.display = 'none';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 定期的に新しい花火を打ち上げ
    if (elapsed - lastBurst > 300 + nextRandom() * 400) {
      createBurst(
        canvas.width * 0.2 + nextRandom() * canvas.width * 0.6,
        canvas.height * 0.15 + nextRandom() * canvas.height * 0.4
      );
      lastBurst = elapsed;
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05; // 重力
      p.life -= p.decay;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
      // キラキラの尾
      ctx.globalAlpha = p.life * 0.3;
      ctx.beginPath();
      ctx.arc(p.x - p.vx, p.y - p.vy, p.size * p.life * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(animate);
  }

  // 最初の花火をすぐ打ち上げ
  createBurst(canvas.width * 0.5, canvas.height * 0.3);
  createBurst(canvas.width * 0.3, canvas.height * 0.25);
  createBurst(canvas.width * 0.7, canvas.height * 0.35);
  animate();
}

// ===== レベル解放演出 =====
function checkLevelUnlock(rankIdx) {
  // どのレベルが新しく解放されたかチェック（ランクを飛び越えた場合も対応）
  // 注: prevRank は既に更新済みのため、lastRankUpPrev（更新前の値）と比較する
  let highestUnlock = 0;
  for (let lv = 2; lv <= 7; lv++) {
    if (LEVEL_UNLOCK_RANK[lv] <= rankIdx && LEVEL_UNLOCK_RANK[lv] > lastRankUpPrev) {
      highestUnlock = lv;
    }
  }
  return highestUnlock;
}

let _unlockedLevel = 0; // 解放されたレベルを保持
function showLevelUnlock(level) {
  _unlockedLevel = level;
  const lvLabel = level >= 6 ? LEVEL_NAMES[level-1] : `Lv.${level}`;
  document.getElementById('level-unlock-icon').textContent = '🎊';
  document.getElementById('level-unlock-title').textContent = `${lvLabel} 解放！`;
  document.getElementById('level-unlock-desc').textContent = `おめでとうございます！\n新しいレベルで遊べるようになりました！`;
  document.getElementById('level-unlock-note').textContent = `※ 次のランクへ進むには ${lvLabel} での挑戦が必要です`;
  document.getElementById('level-unlock-yes-btn').textContent = `${lvLabel} に進む`;
  document.getElementById('level-unlock-modal').style.display = 'flex';
  launchFireworks(4000);
}

// v70: ランクアップマッチ説明モーダルは showPromoAnnounce 側でフック (events.js)
//      ここでは昇格試験案内のみを呼ぶ (Lv.5 解放時の説明モーダルは廃止)
function _showPromoIfAnyAfterUnlock() {
  const promo = getAvailablePromotion();
  if (promo && !promotionExam) {
    showPromoAnnounce(promo);
  }
}

document.getElementById('level-unlock-yes-btn').addEventListener('click', () => {
  document.getElementById('level-unlock-modal').style.display = 'none';
  // 解放されたレベルに切り替えて次の試合を開始
  cpuLevel = _unlockedLevel;
  document.querySelectorAll('[data-level]').forEach(b => b.classList.remove('selected'));
  const lvBtn = document.querySelector(`[data-level="${_unlockedLevel}"]`);
  if (lvBtn) lvBtn.classList.add('selected');
  saveSettings();
  prevRank = calculateRank();
  initGame();
  _showPromoIfAnyAfterUnlock();
});

document.getElementById('level-unlock-no-btn').addEventListener('click', () => {
  document.getElementById('level-unlock-modal').style.display = 'none';
  _showPromoIfAnyAfterUnlock();
});
