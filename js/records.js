/* ============================================================
   records.js — ランク・戦績・昇格試験・レベル解放・当日成績
   localStorage を使ったプレイヤー記録の保存と読み出し。
   ランク計算（calculateRank）は戦績と昇格試験から決まる。
   依存：RANKS, LEVEL_NAMES, BATTLE_RECORD_KEY 等（config.js）
          + humanColor / cpuLevel 等のグローバル状態。
   ============================================================ */

function rankIcon(idx, size) {
  size = size || 20;
  return `<img src="${RANKS[idx].icon}" alt="${RANKS[idx].name}" style="width:${size}px;height:${size}px;object-fit:contain;vertical-align:middle;">`;
}

/**
 * 戦績と合格済み試験から現在のランクを計算する。
 * 累計勝利数 + 合格試験 + 開発者モード設定 を考慮して 1〜30 のランクインデックスを返す。
 * @returns {number} ランクインデックス（1=ペーパー〜30=ゼウス）
 */
function calculateRank() {
  const record = loadBattleRecord();  // 累計
  const daily = loadDailyRecord();    // 当日

  // 累計の勝ち数
  const getWins = (lv) => record[String(lv)] ? record[String(lv)].win : 0;
  const totalWins = () => {
    let sum = 0;
    for (let lv = 1; lv <= 7; lv++) sum += getWins(lv);
    return sum;
  };

  // devMode: ランクオーバーライド
  if (devMode && devOverrideRank !== null) return devOverrideRank;

  // devMode: どのレベルでも1勝でクリア
  if (devMode) {
    const tw = totalWins();
    const passed = (r) => hasPassedPromotion(r);
    if (passed(29)) return 29;
    if (passed(28)) return 28;
    if (tw >= 28) return 27;
    if (tw >= 27) return 26;
    if (tw >= 26) return 25;
    if (passed(24)) return 24;
    if (passed(23)) return 23;
    if (tw >= 23) return 22;
    if (tw >= 22) return 21;
    if (tw >= 21) return 20;
    if (tw >= 20) return 19;
    if (passed(18)) return 18;
    if (tw >= 18) return 17;
    if (tw >= 17) return 16;
    if (tw >= 16) return 15;
    if (tw >= 15) return 14;
    if (passed(13)) return 13;
    if (tw >= 13) return 12;
    if (tw >= 12) return 11;
    if (tw >= 11) return 10;
    if (passed(9)) return 9;
    if (tw >= 9) return 8;
    if (tw >= 8) return 7;
    if (passed(6)) return 6;
    if (tw >= 6) return 5;
    if (tw >= 5) return 4;
    if (passed(3)) return 3;
    if (tw >= 3) return 2;
    if (tw >= 1) return 1;
    return 0;
  }

  // 当日の勝ち越し判定（7番勝負: 7戦以上で勝率51%超）
  const getDailyTotal = (lv) => {
    const r = daily[String(lv)];
    return r ? r.win + r.lose + r.draw : 0;
  };
  const getDailyWinRate = (lv) => {
    const r = daily[String(lv)];
    if (!r) return 0;
    const total = r.win + r.lose + r.draw;
    return total === 0 ? 0 : r.win / total;
  };

  // 昇格試験合格チェック
  const passed = (r) => hasPassedPromotion(r);

  // Check from highest rank down
  // 30. ゼウス - 21番勝負で勝ち越し
  if (passed(29)) return 29;
  // 29. ゴッド - 11番勝負で勝ち越し
  if (passed(28)) return 28;
  // 28. デミゴッド - FINALに累計50勝
  if (getWins(7) >= 50) return 27;
  // 27. オーバーロード - FINALに累計30勝
  if (getWins(7) >= 30) return 26;
  // 26. アークマスター - FINALに累計10勝
  if (getWins(7) >= 10) return 25;
  // 25. グランドマスター - 15番勝負で勝ち越し
  if (passed(24)) return 24;
  // 24. レジェンド - 7番勝負で勝ち越し
  if (passed(23)) return 23;
  // 23. マスター - MAXに累計20勝
  if (getWins(6) >= 20) return 22;
  // 22. チャンピオン - MAXに累計10勝
  if (getWins(6) >= 10) return 21;
  // 21. エキスパート - MAXに累計5勝
  if (getWins(6) >= 5) return 20;
  // 20. スペシャリスト - MAXに累計2勝
  if (getWins(6) >= 2) return 19;
  // 19. ダイヤモンド - 7番勝負で勝ち越し
  if (passed(18)) return 18;
  // 18. エメラルド - Lv.5に累計20勝
  if (getWins(5) >= 20) return 17;
  // 17. サファイア - Lv.5に累計10勝
  if (getWins(5) >= 10) return 16;
  // 16. ルビー - Lv.5に累計5勝
  if (getWins(5) >= 5) return 15;
  // 15. アメジスト - Lv.5に累計2勝
  if (getWins(5) >= 2) return 14;
  // 14. トパーズ - 7番勝負で勝ち越し
  if (passed(13)) return 13;
  // 13. ガーネット - Lv.4に累計10勝
  if (getWins(4) >= 10) return 12;
  // 12. アクアマリン - Lv.4に累計5勝
  if (getWins(4) >= 5) return 11;
  // 11. ターコイズ - Lv.4に累計2勝
  if (getWins(4) >= 2) return 10;
  // Rank 10: Lv.3 7番勝負で勝ち越し（昇格試験）
  if (passed(9)) return 9;
  // Rank 9: Lv.3 累計10勝
  if (getWins(3) >= 10) return 8;
  // Rank 8: Lv.3 累計5勝
  if (getWins(3) >= 5) return 7;
  // Rank 7: Lv.2 7番勝負で勝ち越し（昇格試験）
  if (passed(6)) return 6;
  // Rank 6: Lv.2 累計10勝
  if (getWins(2) >= 10) return 5;
  // Rank 5: Lv.2 累計5勝
  if (getWins(2) >= 5) return 4;
  // Rank 4: Lv.1 3番勝負で勝ち越し（昇格試験）
  if (passed(3)) return 3;
  // Rank 3: Lv.1 累計3勝
  if (getWins(1) >= 3) return 2;
  // Rank 2: 累計1勝
  if (totalWins() >= 1) return 1;
  // Rank 1: default
  return 0;
}

// ===== 昇格試験システム =====
const PROMOTION_KEY = 'reverstargo-promotions';
const PROMOTION_EXAM_KEY = 'reverstargo-promotion-exam';
const PROMOTION_CAREER_KEY = 'reverstargo-promotion-career'; // 昇格試験通算成績

// 昇格試験が必要なランク: rankIndex → { level, winsNeeded }
// careerWins: 通算勝利数での昇格条件（0=勝ち越しのみ）
const PROMOTION_EXAMS = {
  3:  { level: 1, winsNeeded: 2, maxLosses: 2, label: 'Lv.2 解放', careerWins: 0 },   // ストーン（3番勝負）
  6:  { level: 2, winsNeeded: 3, maxLosses: 3, label: 'Lv.3 解放', careerWins: 0 },   // ブロンズ（5番勝負）
  9:  { level: 3, winsNeeded: 4, maxLosses: 4, label: 'Lv.4 解放', careerWins: 20 },   // プラチナ（7番勝負）
  13: { level: 4, winsNeeded: 4, maxLosses: 4, label: 'Lv.5 解放', careerWins: 20 },   // トパーズ（7番勝負）
  18: { level: 5, winsNeeded: 3, maxLosses: 3, label: 'MAX 解放', careerWins: 20 },    // ダイヤモンド（RM 5番勝負）
  23: { level: 6, winsNeeded: 4, maxLosses: 4, label: 'レジェンド', careerWins: 20 },   // レジェンド（RM 7番勝負）
  24: { level: 6, winsNeeded: 8, maxLosses: 8, label: 'グランドマスター', careerWins: 0 }, // グランドマスター（RM 15番勝負）
  28: { level: 7, winsNeeded: 6, maxLosses: 6, label: 'ゴッド', careerWins: 0 },        // ゴッド（RM 11番勝負）
  29: { level: 7, winsNeeded: 11, maxLosses: 11, label: 'ゼウス', careerWins: 0 },      // ゼウス（RM 21番勝負）
};

// 合格済みの昇格試験を読み込み/保存
function loadPromotions() {
  try {
    const data = JSON.parse(localStorage.getItem(PROMOTION_KEY));
    if (data) return data;
  } catch(e) {}
  return {};
}
function savePromotion(rankIndex) {
  const data = loadPromotions();
  data[String(rankIndex)] = true;
  try { localStorage.setItem(PROMOTION_KEY, JSON.stringify(data)); } catch(e) {}
}
function hasPassedPromotion(rankIndex) {
  return !!loadPromotions()[String(rankIndex)];
}

// 昇格試験の通算成績を読み込み/保存
function loadPromotionCareer() {
  try {
    const data = JSON.parse(localStorage.getItem(PROMOTION_CAREER_KEY));
    if (data) return data;
  } catch(e) {}
  return {};
}
function savePromotionCareer(rankIndex, wins, losses) {
  const data = loadPromotionCareer();
  data[String(rankIndex)] = { wins, losses };
  try { localStorage.setItem(PROMOTION_CAREER_KEY, JSON.stringify(data)); } catch(e) {}
}
function getPromotionCareer(rankIndex) {
  const data = loadPromotionCareer();
  return data[String(rankIndex)] || { wins: 0, losses: 0 };
}

// 進行中の昇格試験
let promotionExam = null; // { targetRank, level, wins, losses, winsNeeded, maxLosses }

// ===== Reverse Match 進行中フラグ（v44〜：中断検知） =====
// スマホ戻るボタン・タブ閉じる等の予期せぬ離脱を検知して1敗記録するため
const REVERSE_MATCH_PENDING_KEY = 'rsg_reverse_match_pending';

function markReverseMatchPending() {
  try {
    localStorage.setItem(REVERSE_MATCH_PENDING_KEY, JSON.stringify({
      cpuLevel: cpuLevel,
      promotionExamTargetRank: promotionExam ? promotionExam.targetRank : null,
      timestamp: Date.now()
    }));
  } catch(e) {}
}

function clearReverseMatchPending() {
  try { localStorage.removeItem(REVERSE_MATCH_PENDING_KEY); } catch(e) {}
}

function loadReverseMatchPending() {
  try {
    return JSON.parse(localStorage.getItem(REVERSE_MATCH_PENDING_KEY));
  } catch(e) { return null; }
}

// startGame 冒頭で前回の離脱を検知 → 1敗として記録
function handlePendingReverseMatchOnStart() {
  const pending = loadReverseMatchPending();
  if (!pending) return;
  const lvKey = String(pending.cpuLevel);
  // 戦績に1敗
  const record = loadBattleRecord();
  if (record[lvKey]) {
    record[lvKey].lose++;
    saveBattleRecord(record);
  }
  // 当日成績にも1敗
  const dailyRec = loadDailyRecord();
  if (dailyRec[lvKey]) {
    dailyRec[lvKey].lose++;
    saveDailyRecord(dailyRec);
  }
  // 昇格試験中なら1敗
  if (pending.promotionExamTargetRank !== null) {
    const pex = loadPromotionExam();
    if (pex && pex.targetRank === pending.promotionExamTargetRank) {
      pex.losses++;
      savePromotionExam(pex);
      const career = getPromotionCareer(pex.targetRank);
      career.losses++;
      savePromotionCareer(pex.targetRank, career.wins, career.losses);
      // 敗退判定
      if (pex.losses >= pex.maxLosses) {
        clearPromotionExam();
      }
    }
  }
  clearReverseMatchPending();
}

// Reverse Match を適用すべきか判定（v41〜）
// 適用条件: Lv.5以上の全対戦、または Lv.5以上の昇格試験
// ただし 2人対戦・チュートリアルは除外
/**
 * 現在の対戦設定で Reverse Match を適用すべきかを判定する。
 * 適用条件: トパーズ以上のランク × Lv.5 以上の対戦、または Lv.5+ の昇格試験中。
 * 2 人対戦・チュートリアル・Lv.4 以下では false。
 * @returns {boolean} RM を適用するなら true
 */
function shouldUseReverseMatch() {
  if (battleMode === 'two') return false;
  if (tutorialMiniGame) return false;
  if (promotionExam) {
    // 昇格試験: 対象レベルが Lv.5 以上なら適用
    return promotionExam.level >= 5;
  }
  // 通常対戦: Lv.5 以上の全対戦（白有利解消のため）
  // Lv.5 以降は全対戦を RM 化（先手後手の有利不利を解消するため）
  return cpuLevel >= 5;
}

function loadPromotionExam() {
  try {
    const data = JSON.parse(localStorage.getItem(PROMOTION_EXAM_KEY));
    if (data) return data;
  } catch(e) {}
  return null;
}
function savePromotionExam(exam) {
  try { localStorage.setItem(PROMOTION_EXAM_KEY, JSON.stringify(exam)); } catch(e) {}
}
function clearPromotionExam() {
  promotionExam = null;
  try { localStorage.removeItem(PROMOTION_EXAM_KEY); } catch(e) {}
}

// 昇格試験の受験資格チェック: 次に受けられる試験を返す（なければnull）
function getAvailablePromotion() {
  const rank = calculateRank();
  // 各昇格試験のランクをチェック（低い方から）
  const examRanks = [3, 6, 9, 13, 18, 23, 24, 28, 29];
  for (const targetRank of examRanks) {
    if (hasPassedPromotion(targetRank)) continue; // 合格済み
    // 受験資格: 一つ手前のランクに到達している（devMode も同じ条件）
    if (rank >= targetRank - 1) return { targetRank, ...PROMOTION_EXAMS[targetRank] };
  }
  return null;
}

// 昇格試験を開始
/**
 * 昇格試験（ランクアップマッチ）を開始する。
 * 試験タイプに応じた連戦数（3〜21番勝負）と勝利条件を設定し、
 * RM 適用の場合は Reverse Match 形式で進行。途中離脱は不合格扱い。
 */
function startPromotionExam() {
  const promo = getAvailablePromotion();
  if (!promo) return;
  // devMode: 現在選択中のレベルで試験を受けられる
  const examLevel = devMode ? cpuLevel : promo.level;
  // 進行中の試験があり、同じ対象ランクなら継続（勝敗数を保持）
  const existing = loadPromotionExam();
  if (existing && existing.targetRank === promo.targetRank) {
    promotionExam = { ...existing, level: examLevel };
  } else {
    promotionExam = {
      targetRank: promo.targetRank,
      level: examLevel,
      wins: 0,
      losses: 0,
      winsNeeded: promo.winsNeeded,
      maxLosses: promo.maxLosses,
    };
  }
  savePromotionExam(promotionExam);
  // レベルと対戦モードを設定して開始
  cpuLevel = examLevel;
  battleMode = 'cpu';
  document.querySelectorAll('[data-level]').forEach(b => b.classList.remove('selected'));
  const lvBtn = document.querySelector(`[data-level="${examLevel}"]`);
  if (lvBtn) lvBtn.classList.add('selected');
  saveSettings();
  prevRank = calculateRank();
  // Reverse Match を発動判定（Lv.5 以上の昇格試験で必須）
  // これが無いと、ダイヤモンド／レジェンド／グランドマスター等で
  // リバースマッチにならず、普通の1局対戦になってしまう
  if (shouldUseReverseMatch()) {
    reverseMatch = {
      round: 1,
      round1Result: null,
      initialHumanColor: humanColor
    };
    markReverseMatchPending();
    try { history.pushState({reverseMatchActive: true}, '', location.href); } catch(e) {}
  } else {
    reverseMatch = null;
  }
  document.getElementById('setup-game').style.display = 'none';
  document.getElementById('setup-main').style.display = 'none';
  initGame();
}

// 昇格試験の結果を記録
/**
 * 昇格試験中の 1 局の結果を記録し、合格・不合格・続行を判定する。
 * 連勝数が必要勝利数に達したら合格 → ランクアップ、必要敗北数なら不合格。
 * @param {boolean} isWin - その局でプレイヤーが勝利したか
 */
function recordPromotionResult(isWin) {
  if (!promotionExam) return null;
  if (isWin) promotionExam.wins++;
  else promotionExam.losses++;
  savePromotionExam(promotionExam);

  // 通算成績を更新
  const career = getPromotionCareer(promotionExam.targetRank);
  if (isWin) career.wins++;
  else career.losses++;
  savePromotionCareer(promotionExam.targetRank, career.wins, career.losses);

  // 合格判定（勝ち越し）
  if (promotionExam.wins >= promotionExam.winsNeeded) {
    savePromotion(promotionExam.targetRank);
    const result = { passed: true, exam: { ...promotionExam }, career };
    clearPromotionExam();
    return result;
  }

  // 通算勝利数による合格判定
  const examDef = PROMOTION_EXAMS[promotionExam.targetRank];
  if (examDef.careerWins > 0 && career.wins >= examDef.careerWins) {
    savePromotion(promotionExam.targetRank);
    const result = { passed: true, careerPass: true, exam: { ...promotionExam }, career };
    clearPromotionExam();
    return result;
  }

  // 不合格判定
  if (promotionExam.losses >= promotionExam.maxLosses) {
    const result = { passed: false, exam: { ...promotionExam }, career };
    clearPromotionExam();
    return result;
  }
  return null; // まだ続行中
}

// ===== レベル解放システム =====
const LEVEL_UNLOCK_RANK = [0, 0, 3, 6, 9, 13, 18, 24]; // index 0 unused, levels 1-7(FINAL)

/**
 * 指定 CPU レベルが解放されているかを判定する。
 * Lv.1 は最初から解放、Lv.2 以降はランクと昇格試験合格状況で判定。
 * @param {number} level - CPU レベル（1〜5 + MAX/FINAL 相当）
 * @returns {boolean} 解放済みなら true
 */
function isLevelUnlocked(level) {
  if (devMode) return true; // devMode: 全レベル解放
  return calculateRank() >= LEVEL_UNLOCK_RANK[level];
}

function getLevelUnlockHint(level) {
  const requiredRank = LEVEL_UNLOCK_RANK[level];
  return `${rankIcon(requiredRank)} ${RANKS[requiredRank].name}（ランク${requiredRank + 1}）で解放`;
}

function loadBattleRecord() {
  try {
    const data = JSON.parse(localStorage.getItem(BATTLE_RECORD_KEY));
    if (data && data['1']) {
      // 旧5段階データを6段階に移行
      if (!data['6']) {
        // 旧Lv.2→新Lv.3, 旧Lv.3→新Lv.4, 旧Lv.4→新Lv.5, 旧Lv.5→新Lv.6
        const migrated = {
          '1': data['1'],
          '2': {win:0,lose:0,draw:0},
          '3': data['2'] || {win:0,lose:0,draw:0},
          '4': data['3'] || {win:0,lose:0,draw:0},
          '5': data['4'] || {win:0,lose:0,draw:0},
          '6': data['5'] || {win:0,lose:0,draw:0}
        };
        saveBattleRecord(migrated);
        return migrated;
      }
      return data;
    }
  } catch(e) {}
  return { '1':{win:0,lose:0,draw:0}, '2':{win:0,lose:0,draw:0}, '3':{win:0,lose:0,draw:0}, '4':{win:0,lose:0,draw:0}, '5':{win:0,lose:0,draw:0}, '6':{win:0,lose:0,draw:0}, '7':{win:0,lose:0,draw:0} };
}

function saveBattleRecord(record) {
  try { localStorage.setItem(BATTLE_RECORD_KEY, JSON.stringify(record)); } catch(e) {}
}

// ===== 当日成績（localStorage） =====
const DAILY_RECORD_KEY = 'reverstargo-daily-battle';

function getTodayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function loadDailyRecord() {
  try {
    const data = JSON.parse(localStorage.getItem(DAILY_RECORD_KEY));
    if (data && data.date === getTodayDateStr() && data.record) return data.record;
  } catch(e) {}
  return { '1':{win:0,lose:0,draw:0}, '2':{win:0,lose:0,draw:0}, '3':{win:0,lose:0,draw:0}, '4':{win:0,lose:0,draw:0}, '5':{win:0,lose:0,draw:0}, '6':{win:0,lose:0,draw:0}, '7':{win:0,lose:0,draw:0} };
}

function saveDailyRecord(record) {
  try {
    localStorage.setItem(DAILY_RECORD_KEY, JSON.stringify({ date: getTodayDateStr(), record: record }));
  } catch(e) {}
}

function updateTodayRecordDisplay() {
  const el = document.getElementById('today-record');
  if (!el) return;
  if (battleMode !== 'cpu') { el.style.display = 'none'; return; }
  const daily = loadDailyRecord();
  if (!daily) { el.style.display = 'none'; return; }
  const r = daily[String(cpuLevel)];
  if (!r) { el.style.display = 'none'; return; }
  const total = r.win + r.lose + r.draw;
  if (total === 0) { el.style.display = 'none'; return; }
  const rate = Math.round(r.win / total * 100);
  const lvLabel = cpuLevel >= 6 ? LEVEL_NAMES[cpuLevel-1] : `Lv.${cpuLevel}`;
  el.style.display = 'block';
  el.innerHTML = `<div class="today-title">📊 本日の成績（${lvLabel}）</div><div class="today-stats">${r.win}勝 ${r.lose}敗 ${r.draw}分（${total}戦・勝率${rate}%）</div>`;
}

function updateBattleRecordDisplay() {
  const record = loadBattleRecord();
  const tbody = document.getElementById('battle-record-body');
  tbody.innerHTML = '';
  for (let lv = 1; lv <= 7; lv++) {
    const r = record[String(lv)] || {win:0,lose:0,draw:0};
    const total = r.win + r.lose + r.draw;
    const rate = total === 0 ? '-' : Math.round(r.win / total * 100) + '%';
    const tr = document.createElement('tr');
    const lvLabel = lv >= 6 ? LEVEL_NAMES[lv-1] : `Lv.${lv} ${LEVEL_NAMES[lv-1]}`;
    tr.innerHTML = `<td>${lvLabel}</td><td>${r.win}</td><td>${r.lose}</td><td>${r.draw}</td><td>${rate}</td>`;
    tbody.appendChild(tr);
  }
}
