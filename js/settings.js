/* ============================================================
   settings.js — カスタム設定の保存/読み込み + プレイヤー UI
   localStorage でカスタム設定を永続化。プレイヤー名・ランク表示・
   ランク一覧モーダル・レベルボタン状態の更新を含む。
   依存：state.js, records.js（calculateRank 等）, navigation.js
   ============================================================ */

// ===== カスタム設定の保存/読み込み =====
const SETTINGS_KEY = 'reverstargo-settings';

// プレイヤー表示名を返す（未設定なら「あなた」）
function getPlayerName() {
  return playerName || 'あなた';
}

function updatePlayerNameDisplay() {
  const el = document.getElementById('player-name-display');
  if (el) {
    el.textContent = getPlayerName();
  }
}

/**
 * ヘッダーや設定画面のランク表示（アイコン＋名前）を更新する。
 * calculateRank() の結果に基づいて DOM 要素を書き換える。
 */
function updateRankDisplay() {
  const el = document.getElementById('player-rank-display');
  if (el) {
    const idx = calculateRank();
    el.innerHTML = `${rankIcon(idx, 56)} ランク${idx + 1}：${RANKS[idx].name}`;
  }
}

function updateAccountRankDisplay() {
  const el = document.getElementById('account-rank-display');
  if (el) {
    const idx = calculateRank();
    el.innerHTML = `${rankIcon(idx, 56)} ランク${idx + 1}：${RANKS[idx].name}`;
  }
}

/**
 * 全 30 ランクの一覧モーダルを表示する。
 * 各ランクの条件・解放レベル・現在ランクのハイライトを含む。
 */
function showRankList() {
  const currentRank = calculateRank();
  let html = '<div class="rank-list-modal-overlay" onclick="closeRankList()">';
  html += '<div class="rank-list-modal" onclick="event.stopPropagation()">';
  html += `<div class="rank-list-title">📊 ランク一覧${devMode ? '<br><span style="font-size:0.7rem;color:#ff8060;">※ タップでランク変更</span>' : ''}</div>`;
  html += '<div class="rank-list-scroll">';
  html += '<table class="rank-list-table">';
  html += '<thead><tr><th></th><th>ランク</th><th>条件</th><th>解放</th></tr></thead>';
  html += '<tbody>';
  for (let i = 0; i < RANKS.length; i++) {
    const isCurrent = i === currentRank;
    const achieved = i <= currentRank;
    const cls = isCurrent ? ' class="rank-current"' : (achieved ? ' class="rank-achieved"' : '');
    // Find which level this rank unlocks
    let unlockLabel = '';
    for (let lv = 1; lv <= 7; lv++) {
      if (LEVEL_UNLOCK_RANK[lv] === i) {
        unlockLabel = lv >= 6 ? `🔓${LEVEL_NAMES[lv-1]}` : `🔓Lv.${lv}`;
      }
    }
    const clickAttr = devMode ? ` onclick="devSetRank(${i})"` : '';
    const cursorStyle = devMode ? ' style="cursor:pointer; -webkit-tap-highlight-color:rgba(255,128,96,0.3);"' : '';
    html += `<tr${cls}${clickAttr}${cursorStyle}>`;
    html += `<td>${rankIcon(i, 24)}</td>`;
    html += `<td>${i + 1}. ${RANKS[i].name}</td>`;
    const exam = PROMOTION_EXAMS[i];
    const careerPrefix = (exam && exam.level >= 5) ? 'RM ' : '';
    const condLine2 = (exam && exam.careerWins > 0) ? `<br><span style="font-size:0.7rem;color:#e0a050;">または${careerPrefix}通算${exam.careerWins}勝</span>` : '';
    html += `<td>${RANKS[i].condition}${condLine2}</td>`;
    html += `<td>${unlockLabel}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table>';
  html += '<p style="text-align:center;margin-top:8px;padding:4px 12px;">※ RM ＝ リバースマッチ</p>';
  html += '</div>';
  html += '<button class="rank-list-close-btn" onclick="closeRankList()">閉じる</button>';
  html += '</div></div>';

  const div = document.createElement('div');
  div.id = 'rank-list-container';
  div.innerHTML = html;
  document.body.appendChild(div);
}

function closeRankList() {
  const el = document.getElementById('rank-list-container');
  if (el) el.remove();
}

/**
 * CPU レベル選択ボタン（Lv.1〜MAX/FINAL）の状態を更新する。
 * 解放済みレベルのみ有効化、未解放はロックアイコン付きで表示。
 */
function updateLevelButtons() {
  for (let lv = 1; lv <= 7; lv++) {
    const btn = document.querySelector(`[data-level="${lv}"]`);
    if (!btn) continue;
    const unlocked = isLevelUnlocked(lv);
    if (unlocked) {
      btn.classList.remove('locked');
      btn.disabled = false;
      if (lv >= 6) {
        btn.textContent = LEVEL_NAMES[lv-1];
      } else {
        btn.textContent = `Lv.${lv} ${LEVEL_NAMES[lv-1]}`;
      }
    } else {
      btn.classList.add('locked');
      btn.disabled = false; // Keep clickable for hint
      if (lv >= 6) {
        btn.textContent = `🔒 ${LEVEL_NAMES[lv-1]}`;
      } else {
        btn.textContent = `🔒 Lv.${lv}`;
      }
    }
  }
  // If current selected level is locked, reset to highest unlocked
  if (!isLevelUnlocked(cpuLevel)) {
    let highest = 1;
    for (let lv = 7; lv >= 1; lv--) {
      if (isLevelUnlocked(lv)) { highest = lv; break; }
    }
    selectLevel(highest);
  }
}

/**
 * カスタム設定（速度・アニメ・テーマ・棋譜表記・ヒント・効果音・対戦モード等）を
 * localStorage に保存する。ゲーム開始や画面遷移時に呼び出される。
 */
function saveSettings() {
  const settings = {
    speed: cpuSpeedLevel,
    anim: animationsEnabled,
    hint: hintEnabled,
    sound: soundEnabled,
    moveQuality: moveQualityEnabled,
    moveQualityTwo: moveQualityTwoPlayerEnabled,
    theme: currentThemeKey,
    bg: currentBgKey,
    name: playerName,
    // ゲーム設定（v40〜：前回プレイした設定を保持）
    cpuLevel: cpuLevel,
    humanColor: humanColor,
    battleMode: battleMode
  };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch(e) {}
}

/**
 * localStorage に保存されたカスタム設定を読み込み、グローバル変数と UI に反映する。
 * 初回起動や画面遷移時に呼び出される。設定がなければデフォルト値のまま。
 */
function loadSettings() {
  try {
    const data = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (data) {
      if (data.speed) selectSpeed(data.speed);
      if (data.anim !== undefined) selectAnim(data.anim);
      if (data.hint !== undefined) selectHint(data.hint);
      if (data.sound !== undefined) selectSound(data.sound);
      if (data.moveQuality !== undefined) selectMoveQuality(data.moveQuality);
      if (data.moveQualityTwo !== undefined) selectMoveQualityTwo(data.moveQualityTwo);
      if (data.theme) selectTheme(data.theme);
      if (data.bg) selectBgColor(data.bg);
      if (data.name) {
        playerName = data.name;
        document.getElementById('player-name-input').value = playerName;
      }
    }
    // HTML 初期 selected の補強：保存値がなければ現在のキー（=デフォルト）を再適用
    if (!data || !data.theme) selectTheme(currentThemeKey);
    if (!data || !data.bg) selectBgColor(currentBgKey);
  } catch(e) {}
}

// 前回プレイしたゲーム設定の復元（v40〜）
// updateLevelButtons() でロック状態が確定した後に呼ぶ必要がある
/**
 * ゲーム設定（プレイヤー色・CPUレベル・対戦モード）を localStorage から復元する。
 * カスタム設定（loadSettings）とは別の保存領域で、ゲーム開始時に使用。
 */
function loadGameSettings() {
  try {
    const data = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (!data) return;
    // CPUレベル：ロックされていない場合のみ復元
    if (data.cpuLevel && isLevelUnlocked(data.cpuLevel)) {
      cpuLevel = data.cpuLevel;
      document.querySelectorAll('[data-level]').forEach(b => b.classList.remove('selected'));
      const btn = document.querySelector(`[data-level="${data.cpuLevel}"]`);
      if (btn) btn.classList.add('selected');
    }
    // プレイヤーの色
    if (data.humanColor === 'black' || data.humanColor === 'white') {
      selectColor(data.humanColor);
    }
    // 対戦モード
    if (data.battleMode === 'cpu' || data.battleMode === 'two') {
      selectBattleMode(data.battleMode);
    }
  } catch(e) {}
}

function saveSettingsAndBack() {
  saveSettings();
  showPage('main');
}

function saveSettingsAndGoToGame() {
  saveSettings();
  showPage('game-setup');
}

let koMessageTimer = null;     // コウメッセージ表示タイマー
