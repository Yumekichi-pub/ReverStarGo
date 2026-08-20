/* ============================================================
   records.js — ランク・戦績・昇格試験・レベル解放・当日成績
   localStorage を使ったプレイヤー記録の保存と読み出し。
   ランク計算（calculateRank）は戦績と昇格試験から決まる。
   依存：RANKS, LEVEL_NAMES, BATTLE_RECORD_KEY 等（config.js）
          + humanColor / cpuLevel 等のグローバル状態。
   ============================================================ */

/* ============================================================
   Premium-v54: 戦績データの軽い改ざん対策（署名 + 難読化）
   公開版 RSG-v81 と同じ仕組み。localStorage 直接書き換えによる
   ランク不正（ペーパー→ゼウス 一発到達）を「カジュアルには無理」にする。
   ============================================================ */
const _RSG_SALT = 'rSg♯2026★ykµ51zeus';

function _rsgHash(str) {
  str = String(str) + _RSG_SALT;
  let h1 = 0xdeadbeef ^ str.length, h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function _rsgPack(obj) {
  const json = JSON.stringify(obj);
  const payload = JSON.stringify({ d: json, s: _rsgHash(json) });
  try { return btoa(unescape(encodeURIComponent(payload))); } catch (e) { return payload; }
}

function _rsgUnpack(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  try {
    const payload = JSON.parse(decodeURIComponent(escape(atob(raw))));
    if (payload && typeof payload.d === 'string' && typeof payload.s === 'string') {
      if (_rsgHash(payload.d) === payload.s) return JSON.parse(payload.d);
      return '__TAMPERED__';
    }
  } catch (e) {}
  try {
    const legacy = JSON.parse(raw);
    if (legacy && typeof legacy === 'object') return { __legacy__: legacy };
  } catch (e) {}
  return null;
}

const _RSG_INIT_KEY = '_rsg_v';
function _rsgMigrated() {
  const u = _rsgUnpack(localStorage.getItem(_RSG_INIT_KEY));
  return !!(u && u !== '__TAMPERED__' && !u.__legacy__);
}
function _rsgMarkMigrated() {
  try { localStorage.setItem(_RSG_INIT_KEY, _rsgPack({ t: Date.now() })); } catch(e) {}
}
function _rsgLegacyAction() {
  return _rsgMigrated() ? 'reject' : 'accept';
}

// Premium-v54: 起動時に一度だけ。既存データを署名付きに移行しフラグを立てる。
//   修行コース戦績 (training-record) も対象に含む。
function _rsgInit() {
  if (_rsgMigrated()) return;
  try { loadBattleRecord(); } catch(e) {}
  try { loadDailyRecord(); } catch(e) {}
  try { loadPromotions(); } catch(e) {}
  try { loadPromotionCareer(); } catch(e) {}
  try { loadTrainingRecord(); } catch(e) {}
  _rsgMarkMigrated();
}

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
  const unpacked = _rsgUnpack(localStorage.getItem(PROMOTION_KEY));
  if (unpacked === '__TAMPERED__') { try { localStorage.setItem(PROMOTION_KEY, _rsgPack({})); } catch(e) {} return {}; }
  const isLegacy = !!(unpacked && unpacked.__legacy__);
  if (isLegacy && _rsgLegacyAction() === 'reject') { try { localStorage.setItem(PROMOTION_KEY, _rsgPack({})); } catch(e) {} return {}; }
  const data = isLegacy ? unpacked.__legacy__ : unpacked;
  if (data && typeof data === 'object') {
    if (isLegacy) { try { localStorage.setItem(PROMOTION_KEY, _rsgPack(data)); } catch(e) {} }
    return data;
  }
  return {};
}
function savePromotion(rankIndex) {
  const data = loadPromotions();
  data[String(rankIndex)] = true;
  try { localStorage.setItem(PROMOTION_KEY, _rsgPack(data)); } catch(e) {}
}
function hasPassedPromotion(rankIndex) {
  return !!loadPromotions()[String(rankIndex)];
}

// 昇格試験の通算成績を読み込み/保存
function loadPromotionCareer() {
  const unpacked = _rsgUnpack(localStorage.getItem(PROMOTION_CAREER_KEY));
  if (unpacked === '__TAMPERED__') { try { localStorage.setItem(PROMOTION_CAREER_KEY, _rsgPack({})); } catch(e) {} return {}; }
  const isLegacy = !!(unpacked && unpacked.__legacy__);
  if (isLegacy && _rsgLegacyAction() === 'reject') { try { localStorage.setItem(PROMOTION_CAREER_KEY, _rsgPack({})); } catch(e) {} return {}; }
  const data = isLegacy ? unpacked.__legacy__ : unpacked;
  if (data && typeof data === 'object') {
    if (isLegacy) { try { localStorage.setItem(PROMOTION_CAREER_KEY, _rsgPack(data)); } catch(e) {} }
    return data;
  }
  return {};
}
function savePromotionCareer(rankIndex, wins, losses) {
  const data = loadPromotionCareer();
  data[String(rankIndex)] = { wins, losses };
  try { localStorage.setItem(PROMOTION_CAREER_KEY, _rsgPack(data)); } catch(e) {}
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
  const DEFAULT = () => ({ '1':{win:0,lose:0,draw:0}, '2':{win:0,lose:0,draw:0}, '3':{win:0,lose:0,draw:0}, '4':{win:0,lose:0,draw:0}, '5':{win:0,lose:0,draw:0}, '6':{win:0,lose:0,draw:0}, '7':{win:0,lose:0,draw:0} });
  const unpacked = _rsgUnpack(localStorage.getItem(BATTLE_RECORD_KEY));
  if (unpacked === '__TAMPERED__') { const def = DEFAULT(); saveBattleRecord(def); return def; }
  const isLegacy = !!(unpacked && unpacked.__legacy__);
  if (isLegacy && _rsgLegacyAction() === 'reject') { const def = DEFAULT(); saveBattleRecord(def); return def; }
  const data = isLegacy ? unpacked.__legacy__ : unpacked;
  if (data && data['1']) {
    // 旧5段階データを6段階に移行
    if (!data['6']) {
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
    if (isLegacy) saveBattleRecord(data); // 初回移行で署名付与
    return data;
  }
  return DEFAULT();
}

function saveBattleRecord(record) {
  try { localStorage.setItem(BATTLE_RECORD_KEY, _rsgPack(record)); } catch(e) {}
}

// ===== 修行コース戦績（Premium-v19）=====
// 通常戦績 (BATTLE_RECORD_KEY) とは独立した key で管理。
// 内部 cpuLevel をそのまま key に使う:
//   21 → 太陽系 Lv.6, 11 → 太陽系 Lv.7, 13 → 銀河系 Lv.9, 14 → 銀河系 Lv.10
const TRAINING_RECORD_KEY = 'reverstargo-training-record';

function loadTrainingRecord() {
  const DEFAULT = () => ({
    '21': { win: 0, lose: 0, draw: 0 },  // 太陽系 Lv.6
    '11': { win: 0, lose: 0, draw: 0 },  // 太陽系 Lv.7
    '13': { win: 0, lose: 0, draw: 0 },  // 銀河系 Lv.9
    '14': { win: 0, lose: 0, draw: 0 }   // 銀河系 Lv.10
  });
  const unpacked = _rsgUnpack(localStorage.getItem(TRAINING_RECORD_KEY));
  if (unpacked === '__TAMPERED__') { const def = DEFAULT(); saveTrainingRecord(def); return def; }
  const isLegacy = !!(unpacked && unpacked.__legacy__);
  if (isLegacy && _rsgLegacyAction() === 'reject') { const def = DEFAULT(); saveTrainingRecord(def); return def; }
  const data = isLegacy ? unpacked.__legacy__ : unpacked;
  if (data && typeof data === 'object') {
    if (isLegacy) saveTrainingRecord(data); // 初回移行で署名付与
    return data;
  }
  return DEFAULT();
}

function saveTrainingRecord(record) {
  try { localStorage.setItem(TRAINING_RECORD_KEY, _rsgPack(record)); } catch(e) {}
}

/* ============================================================
   Premium-v145.3: 修行コースの昇格試験（ランクアップマッチ）

   19.4 ルナ・19.9 ネプチューン・25.4 スピカ・25.9 デネブ の 4 つは
   「RM 7番勝負で勝ち越し、または試験の通算20勝」で上がる。
   メインの昇格試験（PROMOTION_EXAMS）と同じ考え方だが、ランクの
   体系が別（19.x / 25.x）なので、混ざらないよう別の一組として持つ。

   ※ v145.2 までは、この 4 つも「ふつうの対局の勝ち数」で上がって
     いた（表示と実装が食い違っていた）。ザラメさんが「7番勝負が
     出てこなかった」と気づかれたのがこの食い違い。
   ============================================================ */
const TRAINING_PROMOTION_KEY = 'reverstargo-training-promotions';
const TRAINING_EXAM_KEY      = 'reverstargo-training-exam';
const TRAINING_CAREER_KEY    = 'reverstargo-training-exam-career';

// 試験が要る修行ランク。key は太陽系/銀河系とランク番号の組。
//   tLevel = 相手の修行レベル（表示 Lv.6/7/9/10）
//   winsNeeded 4 / maxLosses 4 = 7番勝負（先に4勝で合格、4敗で不合格）
const TRAINING_EXAMS = {
  sun4:    { course: 'sun',    rankIdx: 4, tLevel: 6,  winsNeeded: 4, maxLosses: 4, careerWins: 20, label: 'Lv.7 解放' },
  sun9:    { course: 'sun',    rankIdx: 9, tLevel: 7,  winsNeeded: 4, maxLosses: 4, careerWins: 20, label: '太陽系 修了 → MAX へ' },
  galaxy4: { course: 'galaxy', rankIdx: 4, tLevel: 9,  winsNeeded: 4, maxLosses: 4, careerWins: 20, label: 'Lv.10 解放' },
  galaxy9: { course: 'galaxy', rankIdx: 9, tLevel: 10, winsNeeded: 4, maxLosses: 4, careerWins: 20, label: '銀河系 修了 → FINAL へ' },
};

// 署名付きで読み書きする共通ヘルパ（他の記録と同じ扱い）
function _tExamLoad(key) {
  const unpacked = _rsgUnpack(localStorage.getItem(key));
  if (unpacked === '__TAMPERED__') { try { localStorage.setItem(key, _rsgPack({})); } catch(e) {} return {}; }
  const isLegacy = !!(unpacked && unpacked.__legacy__);
  if (isLegacy && _rsgLegacyAction() === 'reject') { try { localStorage.setItem(key, _rsgPack({})); } catch(e) {} return {}; }
  const data = isLegacy ? unpacked.__legacy__ : unpacked;
  if (data && typeof data === 'object') {
    if (isLegacy) { try { localStorage.setItem(key, _rsgPack(data)); } catch(e) {} }
    return data;
  }
  return {};
}
function _tExamSave(key, data) {
  try { localStorage.setItem(key, _rsgPack(data)); } catch(e) {}
}

// ---- 合格記録 ----
function loadTrainingPromotions() { return _tExamLoad(TRAINING_PROMOTION_KEY); }
function saveTrainingPromotion(examKey) {
  const data = loadTrainingPromotions();
  data[examKey] = true;
  _tExamSave(TRAINING_PROMOTION_KEY, data);
}
function hasPassedTrainingExam(examKey) {
  return !!loadTrainingPromotions()[examKey];
}

// ---- 試験の通算成績（「通算20勝で昇格」の分母）----
function loadTrainingExamCareer() { return _tExamLoad(TRAINING_CAREER_KEY); }
function getTrainingExamCareer(examKey) {
  return loadTrainingExamCareer()[examKey] || { wins: 0, losses: 0 };
}
function saveTrainingExamCareer(examKey, wins, losses) {
  const data = loadTrainingExamCareer();
  data[examKey] = { wins, losses };
  _tExamSave(TRAINING_CAREER_KEY, data);
}

// ---- 進行中の試験 ----
let trainingExam = null;  // { examKey, tLevel, wins, losses, winsNeeded, maxLosses }

function loadTrainingExam() {
  try { return JSON.parse(localStorage.getItem(TRAINING_EXAM_KEY)); } catch(e) { return null; }
}
function saveTrainingExam(exam) {
  try { localStorage.setItem(TRAINING_EXAM_KEY, JSON.stringify(exam)); } catch(e) {}
}
function clearTrainingExam() {
  trainingExam = null;
  try { localStorage.removeItem(TRAINING_EXAM_KEY); } catch(e) {}
}

/**
 * Premium-v145.3: v145.2 以前に「ふつうの対局の勝ち数」で上がっていた人を救済する。
 *
 * 判定を試験合格に切り替えると、旧条件で 19.4 まで来ていた人が 19.3 に
 * 下がってしまう。すでに手にしたランクを取り上げるのは筋が通らないので、
 * 旧条件を満たしていれば、その試験は合格済みとして引き継ぐ。
 * 起動時に一度だけ走る。
 */
const _TRAINING_EXAM_MIGRATED_KEY = 'reverstargo-training-exam-migrated';
function _migrateTrainingExams() {
  try {
    if (localStorage.getItem(_TRAINING_EXAM_MIGRATED_KEY)) return;
    const r = (typeof loadTrainingRecord === 'function') ? loadTrainingRecord() : {};
    const w = k => (r[k] && r[k].win) || 0;
    const lv6 = w('21'), lv7 = w('11'), lv9 = w('13'), lv10 = w('14');
    // v145.2 までの解放条件をそのまま使う
    if (lv6 >= 20)          saveTrainingPromotion('sun4');
    if (lv6 + lv7 >= 50)    saveTrainingPromotion('sun9');
    if (lv9 >= 20)          saveTrainingPromotion('galaxy4');
    if (lv9 + lv10 >= 50)   saveTrainingPromotion('galaxy9');
    localStorage.setItem(_TRAINING_EXAM_MIGRATED_KEY, '1');
  } catch (e) {}
}

// Premium-v22: 修行コースランクの計算
// 戦績から現在の太陽系/銀河系ランクを算出する。0 = 未達成, 1〜9 = 19.1〜19.9 / 25.1〜25.9 に対応。
//
// 解放条件（既存定義をベースに、「RM 7番勝負勝ち越し」は累計勝利数で代用）:
//   太陽系:
//     1: 19.1 水星 — Lv.6 に RM 累計 2勝
//     2: 19.2 金星 — Lv.6 に RM 累計 5勝
//     3: 19.3 地球 — Lv.6 に RM 累計 10勝
//     4: 19.4 月   — Lv.6 に RM 累計 20勝（→ Lv.7 解放）
//     5: 19.5 火星 — Lv.7 に RM 累計 2勝
//     6: 19.6 木星 — Lv.7 に RM 累計 5勝
//     7: 19.7 土星 — Lv.7 に RM 累計 10勝
//     8: 19.8 天王星 — Lv.7 に RM 累計 20勝
//     9: 19.9 海王星 — Lv.6+Lv.7 通算 50勝（→ 修行終了 MAX へ）
//   銀河系:
//     同様の条件で Lv.9 / Lv.10、最後の 25.9 デネブで → 修行終了 FINAL へ
function calculateTrainingRank() {
  const record = (typeof loadTrainingRecord === 'function') ? loadTrainingRecord() : {};
  const lv6 = (record['21'] && record['21'].win) || 0;
  const lv7 = (record['11'] && record['11'].win) || 0;
  const lv9 = (record['13'] && record['13'].win) || 0;
  const lv10 = (record['14'] && record['14'].win) || 0;

  // Premium-v145.3: 19.4 / 19.9 / 25.4 / 25.9 は昇格試験（7番勝負）に変更。
  //   ふつうの対局の勝ち数では上がらない。メインのランクと同じ考え方。
  const passed = (typeof hasPassedTrainingExam === 'function') ? hasPassedTrainingExam : () => false;

  // 太陽系ランク
  let sunRank = 0;
  if (lv6 >= 2)  sunRank = 1;
  if (lv6 >= 5)  sunRank = 2;
  if (lv6 >= 10) sunRank = 3;
  if (passed('sun4')) sunRank = 4;  // 7番勝負 合格 → Lv.7 解放
  if (lv7 >= 2)  sunRank = 5;
  if (lv7 >= 5)  sunRank = 6;
  if (lv7 >= 10) sunRank = 7;
  if (lv7 >= 20) sunRank = 8;
  if (passed('sun9')) sunRank = 9;  // 7番勝負 合格 → 修行終了 (MAX へ)

  // 銀河系ランク
  let galaxyRank = 0;
  if (lv9  >= 2)  galaxyRank = 1;
  if (lv9  >= 5)  galaxyRank = 2;
  if (lv9  >= 10) galaxyRank = 3;
  if (passed('galaxy4')) galaxyRank = 4;  // 7番勝負 合格 → Lv.10 解放
  if (lv10 >= 2)  galaxyRank = 5;
  if (lv10 >= 5)  galaxyRank = 6;
  if (lv10 >= 10) galaxyRank = 7;
  if (lv10 >= 20) galaxyRank = 8;
  if (passed('galaxy9')) galaxyRank = 9;  // 7番勝負 合格 → 修行終了 (FINAL へ)

  return { sunRank, galaxyRank };
}

// 太陽系 Lv.7 が解放されているか（19.4 月以上達成 = sunRank >= 4）
function isTrainingSunLv7Unlocked() {
  const { sunRank } = calculateTrainingRank();
  return sunRank >= 4;
}
// 銀河系 Lv.10 が解放されているか（25.4 スピカ以上達成）
function isTrainingGalaxyLv10Unlocked() {
  const { galaxyRank } = calculateTrainingRank();
  return galaxyRank >= 4;
}
// 太陽系修行終了（→ MAX へ）達成済みか
function hasFinishedTrainingSun() {
  return calculateTrainingRank().sunRank >= 9;
}
// 銀河系修行終了（→ FINAL へ）達成済みか
function hasFinishedTrainingGalaxy() {
  return calculateTrainingRank().galaxyRank >= 9;
}

/* ===== Premium-v145.3: 修行コースの昇格試験 進行まわり ===== */

/**
 * いま受けられる修行コースの試験を返す（なければ null）。
 * 受験資格は「1つ手前のランクに届いている」こと（メインと同じ）。
 * 例: 19.4 ルナの試験は 19.3 アース に届いていれば受けられる。
 */
function getAvailableTrainingExam() {
  const { sunRank, galaxyRank } = calculateTrainingRank();
  for (const examKey of ['sun4', 'sun9', 'galaxy4', 'galaxy9']) {
    if (hasPassedTrainingExam(examKey)) continue;
    const def = TRAINING_EXAMS[examKey];
    // 銀河系はコース自体が開いていないと受けられない（メインで MAX 撃破）
    if (def.course === 'galaxy'
        && typeof hasDefeatedMainMax === 'function' && !hasDefeatedMainMax()) continue;
    const cur = def.course === 'sun' ? sunRank : galaxyRank;
    if (cur >= def.rankIdx - 1) return { examKey, ...def };
  }
  return null;
}

/**
 * 修行コースの昇格試験を始める。
 * 中断して戻ってきた場合は、同じ試験なら勝敗数を引き継いで再開する。
 */
function startTrainingExam() {
  const ex = getAvailableTrainingExam();
  if (!ex) return;
  const existing = loadTrainingExam();
  if (existing && existing.examKey === ex.examKey) {
    trainingExam = Object.assign({}, existing, { tLevel: ex.tLevel });
  } else {
    trainingExam = {
      examKey: ex.examKey, tLevel: ex.tLevel,
      wins: 0, losses: 0,
      winsNeeded: ex.winsNeeded, maxLosses: ex.maxLosses
    };
  }
  saveTrainingExam(trainingExam);
  // 相手のレベルは試験で決まる（選び直せない）
  if (typeof selectTrainingLevel === 'function') selectTrainingLevel(ex.tLevel);
  else if (typeof trainingLevel !== 'undefined') trainingLevel = ex.tLevel;
  if (typeof startTrainingGame === 'function') startTrainingGame();
}

/**
 * 試験中の 1 局の結果を記録し、合格・不合格・続行を判定する。
 * メインの recordPromotionResult と同じ流れ。
 * @param {boolean} isWin プレイヤーが勝ったか
 * @returns {object|null} 決着したら結果、まだ続くなら null
 */
function recordTrainingExamResult(isWin) {
  if (!trainingExam) return null;
  if (isWin) trainingExam.wins++;
  else trainingExam.losses++;
  saveTrainingExam(trainingExam);

  // 通算成績（「試験の通算20勝で昇格」の分母）
  const career = getTrainingExamCareer(trainingExam.examKey);
  if (isWin) career.wins++;
  else career.losses++;
  saveTrainingExamCareer(trainingExam.examKey, career.wins, career.losses);

  const def = TRAINING_EXAMS[trainingExam.examKey];

  // 勝ち越しで合格
  if (trainingExam.wins >= trainingExam.winsNeeded) {
    saveTrainingPromotion(trainingExam.examKey);
    const result = { passed: true, exam: Object.assign({}, trainingExam), career, def };
    clearTrainingExam();
    return result;
  }
  // 通算勝利数で合格
  if (def && def.careerWins > 0 && career.wins >= def.careerWins) {
    saveTrainingPromotion(trainingExam.examKey);
    const result = { passed: true, careerPass: true, exam: Object.assign({}, trainingExam), career, def };
    clearTrainingExam();
    return result;
  }
  // 負け越しで不合格（何度でも受け直せる）
  if (trainingExam.losses >= trainingExam.maxLosses) {
    const result = { passed: false, exam: Object.assign({}, trainingExam), career, def };
    clearTrainingExam();
    return result;
  }
  return null;  // まだ続く
}

// ===== 当日成績（localStorage） =====
const DAILY_RECORD_KEY = 'reverstargo-daily-battle';

function getTodayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function loadDailyRecord() {
  const DEFAULT = () => ({ '1':{win:0,lose:0,draw:0}, '2':{win:0,lose:0,draw:0}, '3':{win:0,lose:0,draw:0}, '4':{win:0,lose:0,draw:0}, '5':{win:0,lose:0,draw:0}, '6':{win:0,lose:0,draw:0}, '7':{win:0,lose:0,draw:0} });
  const unpacked = _rsgUnpack(localStorage.getItem(DAILY_RECORD_KEY));
  if (unpacked === '__TAMPERED__') return DEFAULT();
  const isLegacy = !!(unpacked && unpacked.__legacy__);
  if (isLegacy && _rsgLegacyAction() === 'reject') return DEFAULT();
  const data = isLegacy ? unpacked.__legacy__ : unpacked;
  if (data && data.date === getTodayDateStr() && data.record) {
    if (isLegacy) saveDailyRecord(data.record);
    return data.record;
  }
  return DEFAULT();
}

function saveDailyRecord(record) {
  try {
    localStorage.setItem(DAILY_RECORD_KEY, _rsgPack({ date: getTodayDateStr(), record: record }));
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

// ===== 戦績シェア =====
function generateBattleRecordShareText() {
  const record = loadBattleRecord();
  const rankIdx = calculateRank();
  const rankName = RANKS[rankIdx].name;
  const pName = getPlayerName();

  let text = `【ReverStarGo 戦績】\n`;
  text += `${pName}（ランク${rankIdx + 1}：${rankName}）\n`;
  text += `────────────────\n`;
  for (let lv = 1; lv <= 7; lv++) {
    const r = record[String(lv)] || { win: 0, lose: 0, draw: 0 };
    const total = r.win + r.lose + r.draw;
    if (total === 0) continue;
    const rate = Math.round(r.win / total * 100);
    const lvLabel = lv >= 6 ? LEVEL_NAMES[lv - 1] : `Lv.${lv} ${LEVEL_NAMES[lv - 1]}`;
    text += `${lvLabel}：${r.win}勝${r.lose}敗${r.draw}分（勝率${rate}%）\n`;
  }
  text += `────────────────\n`;
  text += `あなたはFINALを攻略できるか？\n`;
  text += `${location.origin}/`;
  return text;
}

// シェア共通処理：Web Share API → クリップボードの順にフォールバック
function _rsgShareText(text) {
  if (navigator.share) {
    navigator.share({ text: text }).catch(() => {});
    return;
  }
  navigator.clipboard.writeText(text).then(() => {
    showToast('コピーしました！SNSに貼り付けてシェアしよう');
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('コピーしました！SNSに貼り付けてシェアしよう');
  });
}

function shareBattleRecord() {
  _rsgShareText(generateBattleRecordShareText());
}

// 対局結果のシェア（結果画面から。テキストは undo.js の終局処理で組み立て）
function shareGameResult() {
  if (typeof lastResultShareText === 'undefined' || !lastResultShareText) return;
  _rsgShareText(lastResultShareText);
}
