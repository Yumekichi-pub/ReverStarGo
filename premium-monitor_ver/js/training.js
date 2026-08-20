/* ============================================================
   training.js — 大宇宙の修行部屋 (Premium-v3 新規, v4 で AI 統合)

   無料版の Lv.5 達人 と MAX(内部 Lv.8) の間を埋める「太陽系コース」、
   MAX と FINAL(内部 Lv.11) の間を埋める「銀河系コース」を提供する
   修行コース機能。Premium 版限定。

   AI: 深さ解析index.html で完成済みのレベル設計を ai.js に移植 (Premium-v4)
   依存: state (cpuLevel, humanColor, cpuColor, battleMode), board (opp),
         setup (startGame), settings (selectColor)
   ============================================================ */

let trainingColor = 'black';
let trainingLevel = 6;  // 6, 7 (太陽系) / 9, 10 (銀河系)

// Premium-v20: 修行コースのモード。null = 未選択（入口画面）、'juku' = 師匠と修行、'real' = 実戦
//   juku: 評価メッセージ ON、常時 undo、戦績記録なし、キャプチャ称賛抑制、戦績ボタン非表示
//   real: 評価メッセージ OFF、通常 undo、戦績記録あり、キャプチャ称賛表示、戦績ボタン表示
let trainingMode = null;

/**
 * 修行モードを選択し、詳細画面 (色・レベル選択) を表示する。
 * @param {'juku'|'real'} mode
 */
function enterTrainingMode(mode) {
  trainingMode = mode;
  document.getElementById('training-mode-select').style.display = 'none';
  document.getElementById('training-detail-area').style.display = '';
  const titleEl = document.getElementById('training-detail-title');
  if (titleEl) {
    titleEl.textContent = mode === 'juku' ? '🧘 師匠と修行' : '⚔️ 実戦でランクアップ';
  }
  // 戦績ボタンは実戦モードのみ表示
  const recordsBtn = document.getElementById('training-records-btn');
  if (recordsBtn) recordsBtn.style.display = mode === 'real' ? '' : 'none';
}

/**
 * Premium-v48: 修行モードの説明モーダルを表示する。
 * 「師匠と修行」「実戦でランクアップ」それぞれの特徴を子供にも分かりやすく。
 * @param {'juku'|'real'} mode
 */
function showTrainingModeHelp(mode) {
  const modal = document.getElementById('training-mode-help-modal');
  const title = document.getElementById('training-mode-help-title');
  const body = document.getElementById('training-mode-help-body');
  if (!modal || !title || !body) return;
  if (mode === 'juku') {
    title.textContent = '🧘 師匠と修行をする';
    body.innerHTML =
      '<p>師匠について、リバースターゴをじっくり学ぶ修行モードです。</p>' +
      '<div class="help-section-title">📚 学べること</div>' +
      '<ul>' +
        '<li>あなたの一手ごとに、師匠の表情と言葉で「いい手」「ふつう」「考え直そう」を教えてくれます</li>' +
        '<li>師匠が険しい顔をしたときはゲームが止まり、戻るか進むかをじっくり選べます</li>' +
        '<li>「1手戻る」「1手進む」が何度でも使えて、ゲーム開始まで戻れます</li>' +
      '</ul>' +
      '<div class="help-section-title">⏸ 自由に中断OK</div>' +
      '<ul>' +
        '<li>「修行部屋に戻る」はいつでも押せます（ゲーム中でもOK）</li>' +
        '<li>戦績は記録されません — 純粋な学びの場です</li>' +
        '<li>ランクアップは「実戦でランクアップ」モードでしか起きません</li>' +
      '</ul>';
  } else {
    title.textContent = '⚔️ 実戦でランクアップを目指す';
    body.innerHTML =
      '<p>師匠の助けなしで、自分の力でランクアップを目指す本気モードです。</p>' +
      '<div class="help-section-title">🏆 ランクシステム</div>' +
      '<ul>' +
        '<li>太陽系コース: マーキュリー → ヴィーナス → … → ネプチューン（9段階）</li>' +
        '<li>銀河系コース: シリウス → アルタイル → … → デネブ（9段階）</li>' +
        '<li>勝つたびに戦績が記録され、条件を満たすとランクアップ</li>' +
      '</ul>' +
      '<div class="help-section-title">🔒 レベル開放</div>' +
      '<ul>' +
        '<li>Lv.6 から始まり、勝ち進めば Lv.7 が開放</li>' +
        '<li>メインで <b>MAX を倒している人</b>は、太陽系を飛ばして <b>Lv.9 まで開いています</b></li>' +
        '<li>Lv.10 は銀河系のスピカ（25.4）達成で開放</li>' +
      '</ul>' +
      '<div class="help-section-title">⚠ 実戦ルール</div>' +
      '<ul>' +
        '<li>「1手戻る」は1回まで（通常モードと同じ）</li>' +
        '<li>師匠の評価メッセージは出ません</li>' +
        '<li>試合中は「修行部屋に戻る」が押せません</li>' +
      '</ul>';
  }
  modal.style.display = 'flex';
}

function closeTrainingModeHelp() {
  const modal = document.getElementById('training-mode-help-modal');
  if (modal) modal.style.display = 'none';
}

/**
 * 詳細画面から入口（モード選択）に戻る。trainingMode をリセット。
 */
function backToTrainingEntry() {
  trainingMode = null;
  document.getElementById('training-mode-select').style.display = '';
  document.getElementById('training-detail-area').style.display = 'none';
  // Premium-v43: 戻ってきた時もアカウント表示を最新化
  if (typeof renderTrainingAccount === 'function') renderTrainingAccount();
}

// ===== Premium-v8: 課金フラグ雛形 =====
// 各コースの購入状態を localStorage で管理。
// キーが未設定 or '1' なら購入済（表示）、'0' なら未購入（非表示）
// 課金実装時に正式な購入処理から書き換える前提。
// テスト方法（開発者ツール Console）:
//   localStorage.setItem('rsg-train-sun', '0');     // 太陽系を隠す
//   localStorage.setItem('rsg-train-galaxy', '0');  // 銀河系を隠す
//   localStorage.removeItem('rsg-train-sun');        // 元に戻す
const TRAIN_SUN_KEY = 'rsg-train-sun';
const TRAIN_GALAXY_KEY = 'rsg-train-galaxy';

/**
 * Premium-v145.1: メイン（外の世界）で MAX を倒したことがあるか。
 *
 * 戦績のキーは 1〜7 で、6 = MAX、7 = FINAL。
 * 修行部屋はもともと「MAX を攻略するための道場」として作ったので
 * Lv.6 から順に積む造りだったが、MAX を直接攻略した人には
 * 太陽系を積み直す理由がない。そこで MAX 撃破を
 * 「太陽系を飛ばして Lv.9 まで開ける」判断材料に使う。
 */
function hasDefeatedMainMax() {
  try {
    if (typeof loadBattleRecord !== 'function') return false;
    const br = loadBattleRecord();
    return !!(br && br['6'] && br['6'].win > 0);
  } catch (e) { return false; }
}

function isTrainingSunUnlocked() {
  return localStorage.getItem(TRAIN_SUN_KEY) !== '0';
}
function isTrainingGalaxyUnlocked() {
  return localStorage.getItem(TRAIN_GALAXY_KEY) !== '0';
}

/**
 * Premium-v43→v44→v45: 修行コーストップにアカウント＋現在ランクを表示する。
 *   メイン画面の「ランク14：トパーズ」と同じ書式に統一（絵文字・英語表記なし）。
 *   銀河系は「太陽系卒業」だけでは解放せず、通常モード MAX 撃破後に解放。
 *
 * Premium-v145.2: 入口だけでなく「レベルを選ぶ画面」にも同じものを出す。
 *   レベルを選ぶ時がいちばんランクを見たい場面なのに、そこで消えていた。
 *   .training-account が付いた枠すべてに描くので、置き場所は HTML 側で増やせる。
 */
function renderTrainingAccount() {
  const els = document.querySelectorAll('.training-account');
  if (!els.length) return;
  const { sunRank, galaxyRank } = (typeof calculateTrainingRank === 'function')
    ? calculateTrainingRank() : { sunRank: 0, galaxyRank: 0 };
  const sunCurrent = (sunRank > 0 && typeof TRAINING_SUN_RANKS !== 'undefined')
    ? TRAINING_SUN_RANKS[sunRank - 1] : null;
  const galaxyCurrent = (galaxyRank > 0 && typeof TRAINING_GALAXY_RANKS !== 'undefined')
    ? TRAINING_GALAXY_RANKS[galaxyRank - 1] : null;
  // Premium-v45: 銀河系の解放は通常モード MAX (cpuLevel 6) 撃破後
  // Premium-v145.1: 太陽系卒業は問わない（MAX を倒していれば銀河系が開く）
  const galaxyOpen = hasDefeatedMainMax();
  const name = (typeof getPlayerName === 'function') ? getPlayerName() : 'あなた';

  // メイン画面と同じ「ランクX.X：名前」形式
  const rankLine = (cur) => {
    if (!cur) return '';
    return `<div class="training-account-rank-line">` +
           `<img src="cosmo/${cur.rank}.png" alt="${cur.name}" class="training-account-rank-icon">` +
           `<span class="training-account-rank-text">ランク${cur.rank}：${cur.name}</span>` +
           `</div>`;
  };

  let html = '';
  html += `<div class="training-account-name">${name}</div>`;
  if (sunCurrent) html += rankLine(sunCurrent);
  if (galaxyOpen) {
    if (galaxyCurrent) {
      html += rankLine(galaxyCurrent);
    } else if (sunCurrent) {
      html += `<div class="training-account-empty">銀河系コース 解放！ さあ次へ</div>`;
    } else {
      // MAX を倒して来た人。太陽系を積んでいなくても銀河系から始められる
      html += `<div class="training-account-empty">MAX 撃破ずみ — 銀河系コースから始められます</div>`;
    }
  } else if (!sunCurrent) {
    html += `<div class="training-account-empty">修行これから — まずは太陽系から</div>`;
  }
  els.forEach(el => { el.innerHTML = html; });
}

/**
 * 修行コース画面表示時に、購入状態に応じて section の表示を切り替える。
 * navigation.js の showPage('training') から呼ばれる。
 */
function applyTrainingUnlocks() {
  const sunUnlocked = isTrainingSunUnlocked();
  const galaxyUnlocked = isTrainingGalaxyUnlocked();
  const sunSection = document.querySelector('#setup-training [data-course="sun"]');
  const galaxySection = document.querySelector('#setup-training [data-course="galaxy"]');
  if (sunSection)    sunSection.style.display    = sunUnlocked    ? '' : 'none';
  if (galaxySection) galaxySection.style.display = galaxyUnlocked ? '' : 'none';

  // 隠れたコースが選択中なら、表示中のコースの最初のレベルに切替
  if (!sunUnlocked && trainingLevel <= 7 && galaxyUnlocked) {
    selectTrainingLevel(9);
  } else if (!galaxyUnlocked && trainingLevel >= 9 && sunUnlocked) {
    selectTrainingLevel(6);
  }

  // Premium-v43: アカウント＋現在ランクを更新（最新の戦績を反映）
  if (typeof renderTrainingAccount === 'function') renderTrainingAccount();
  // Premium-v46: 修行コースのレベル開放ロックを反映
  if (typeof applyTrainingLevelLocks === 'function') applyTrainingLevelLocks();
}

// ===== Premium-v46: 修行コースのレベル開放ロック（Phase 4）=====
//   Lv.6: 常時開放（修行入口、メインの MAX 解放後にこのページへ来る）
//   Lv.7: ルナ (19.4) 達成で解放
//   Lv.9: 太陽系卒業 + 通常モード MAX (cpuLevel 6) 撃破 で解放
//   Lv.10: スピカ (25.4) 達成で解放
//   開発者モード中は全解放
//
//   Premium-v145.1: メインで MAX を倒した人は Lv.9 まで一気に開ける。
//   修行部屋は「MAX を攻略するための道場」として作ったので Lv.6 から
//   順に積む造りだったが、MAX を直接倒せた人に太陽系をやり直させる
//   意味はない。Lv.10 だけは銀河系で勝ち進んでから（スピカ達成）のまま。
function isTrainingLevelLocked(lv) {
  if (typeof devMode !== 'undefined' && devMode) return false;
  if (lv === 6) return false;
  if (lv === 7) {
    if (hasDefeatedMainMax()) return false;
    return !(typeof isTrainingSunLv7Unlocked === 'function' && isTrainingSunLv7Unlocked());
  }
  if (lv === 9) {
    return !hasDefeatedMainMax();
  }
  if (lv === 10) {
    return !(typeof isTrainingGalaxyLv10Unlocked === 'function' && isTrainingGalaxyLv10Unlocked());
  }
  return false;
}

function getTrainingLevelHint(lv) {
  if (lv === 7)  return 'ルナ（19.4）達成、またはメインで MAX を倒すと解放されます';
  if (lv === 9)  return 'メインで MAX を倒すと解放されます';
  if (lv === 10) return 'スピカ（25.4）達成で解放されます';
  return '';
}

function applyTrainingLevelLocks() {
  const buttons = document.querySelectorAll('[data-tlevel]');
  buttons.forEach(btn => {
    const lv = parseInt(btn.getAttribute('data-tlevel'), 10);
    const locked = isTrainingLevelLocked(lv);
    btn.disabled = locked;
    if (locked) {
      btn.textContent = '🔒 Lv.' + lv;
      btn.title = getTrainingLevelHint(lv);
      btn.classList.add('training-level-locked');
    } else {
      btn.textContent = 'Lv.' + lv;
      btn.title = '';
      btn.classList.remove('training-level-locked');
    }
  });
  // 現在選択中のレベルがロックされていれば、解放済みの最初のレベルに切替
  if (typeof trainingLevel !== 'undefined' && isTrainingLevelLocked(trainingLevel)) {
    for (const lv of [6, 7, 9, 10]) {
      if (!isTrainingLevelLocked(lv)) {
        if (typeof selectTrainingLevel === 'function') selectTrainingLevel(lv);
        break;
      }
    }
  }
}

function selectTrainingColor(color) {
  trainingColor = color;
  document.querySelectorAll('[data-tcolor]').forEach(b => b.classList.remove('selected'));
  document.querySelector(`[data-tcolor="${color}"]`).classList.add('selected');
}

function selectTrainingLevel(lv) {
  // Premium-v46: ロックされたレベルは選択できない（保険）
  if (typeof isTrainingLevelLocked === 'function' && isTrainingLevelLocked(lv)) {
    const hint = (typeof getTrainingLevelHint === 'function') ? getTrainingLevelHint(lv) : '';
    if (typeof showToast === 'function') showToast('🔒 ' + hint);
    return;
  }
  trainingLevel = lv;
  document.querySelectorAll('[data-tlevel]').forEach(b => b.classList.remove('selected'));
  document.querySelector(`[data-tlevel="${lv}"]`).classList.add('selected');
}

/**
 * 修行コースのゲーム開始。
 * Premium-v4: 深さ解析index.html で完成済みの修行コース AI に対応した
 * 内部 cpuLevel にマッピング:
 * - 表示 Lv.6 (太陽系) → 内部 cpuLevel=21 (d1- weighted 5:3:1)
 * - 表示 Lv.7 (太陽系) → 内部 cpuLevel=11 (depth=1)
 * - 表示 Lv.9 (銀河系) → 内部 cpuLevel=13 (depth=3)
 * - 表示 Lv.10 (銀河系) → 内部 cpuLevel=14 (depth=4)
 */
function startTrainingGame() {
  const internalLevelMap = {
    6: 21,  // 太陽系 Lv.6 → d1- (weighted 5:3:1)
    7: 11,  // 太陽系 Lv.7 → depth=1
    9: 13,  // 銀河系 Lv.9 → depth=3
    10: 14, // 銀河系 Lv.10 → depth=4
  };
  cpuLevel = internalLevelMap[trainingLevel] || 5;
  humanColor = trainingColor;
  cpuColor = opp(humanColor);
  battleMode = 'cpu';
  // Premium-v5: setup-training を非表示にしないと盤面が見えない
  // (startGame は setup-game しか非表示にしないため)
  document.getElementById('setup-training').style.display = 'none';
  // 色選択 UI を同期 (selectColor で data-color の selected も同期)
  if (typeof selectColor === 'function') selectColor(humanColor);
  // Premium-v9: 修行コース別のゲーム画面背景を body クラスで適用
  document.body.classList.remove('training-sun-bg', 'training-galaxy-bg');
  if (trainingLevel === 6 || trainingLevel === 7) {
    document.body.classList.add('training-sun-bg');
  } else if (trainingLevel === 9 || trainingLevel === 10) {
    document.body.classList.add('training-galaxy-bg');
  }
  // Premium-v34: 「師匠と修行」モード時のみ juku-mode クラス
  //   2段組みボタンレイアウト + 「1手進む」ボタン表示の切替に使う
  document.body.classList.remove('juku-mode');
  if (trainingMode === 'juku') {
    document.body.classList.add('juku-mode');
  }
  // Premium-v18: 初めて修行部屋に入った時のみダーク（night + darkbg）に切り替え、
  // カスタム設定として永続化する。2 回目以降はユーザーのカスタム設定をそのまま尊重し、
  // 「ダークが合わない」と感じた人はテーマ設定で自由に変更できる。
  const JUKU_THEME_INITIALIZED_KEY = 'rsg-juku-theme-initialized';
  let _jukuFirstVisit = false;
  try { _jukuFirstVisit = !localStorage.getItem(JUKU_THEME_INITIALIZED_KEY); } catch (e) {}
  if (_jukuFirstVisit) {
    try {
      if (typeof selectTheme === 'function') selectTheme('night');
      if (typeof selectBgColor === 'function') selectBgColor('darkbg');
      if (typeof saveSettings === 'function') saveSettings();
      localStorage.setItem(JUKU_THEME_INITIALIZED_KEY, '1');
    } catch (e) {}
  }
  startGame();
}

// Premium-v11: 修行コースゲーム進行中かを判定（cpuLevel では FINAL=11 と被るため body クラスで判定）
function isTrainingMode() {
  return document.body.classList.contains('training-sun-bg')
      || document.body.classList.contains('training-galaxy-bg');
}

// ===== ランク一覧（太陽系・銀河系の 9 段階）=====
// メモ「2つの修行コース 完成！」(2026-04-17 西口さん＋奥様＋4代目) のデータ
// Premium-v44: 太陽系のランク名をカタカナ化（銀河系と表記を統一）
//   月は「ムーン」より宇宙的な「ルナ」を採用
const TRAINING_SUN_RANKS = [
  { rank: '19.1', name: 'マーキュリー', en: 'Mercury', cond: 'Lv.6 に RM 累計2勝' },
  { rank: '19.2', name: 'ヴィーナス',   en: 'Venus',   cond: 'Lv.6 に RM 累計5勝' },
  { rank: '19.3', name: 'アース',       en: 'Earth',   cond: 'Lv.6 に RM 累計10勝' },
  { rank: '19.4', name: 'ルナ',         en: 'Luna',    cond: 'RM 7番勝負で勝ち越し<br><span style="color:#c09020;">または通算20勝</span>', unlock: 'Lv.7' },
  { rank: '19.5', name: 'マーズ',       en: 'Mars',    cond: 'Lv.7 に RM 累計2勝' },
  { rank: '19.6', name: 'ジュピター',   en: 'Jupiter', cond: 'Lv.7 に RM 累計5勝' },
  { rank: '19.7', name: 'サターン',     en: 'Saturn',  cond: 'Lv.7 に RM 累計10勝' },
  { rank: '19.8', name: 'ウラヌス',     en: 'Uranus',  cond: 'Lv.7 に RM 累計20勝' },
  { rank: '19.9', name: 'ネプチューン', en: 'Neptune', cond: 'RM 7番勝負で勝ち越し<br><span style="color:#c09020;">または RM 通算20勝</span>', unlock: '修行終了<br>MAX へ' }
];

const TRAINING_GALAXY_RANKS = [
  { rank: '25.1', name: 'シリウス',     en: 'Sirius',     cond: 'Lv.9 に RM 累計2勝' },
  { rank: '25.2', name: 'アルタイル',   en: 'Altair',     cond: 'Lv.9 に RM 累計5勝' },
  { rank: '25.3', name: 'ベガ',         en: 'Vega',       cond: 'Lv.9 に RM 累計10勝' },
  { rank: '25.4', name: 'スピカ',       en: 'Spica',      cond: 'RM 7番勝負で勝ち越し<br><span style="color:#c09020;">または通算20勝</span>', unlock: 'Lv.10' },
  { rank: '25.5', name: 'ポラリス',     en: 'Polaris',    cond: 'Lv.10 に RM 累計2勝' },
  { rank: '25.6', name: 'アンタレス',   en: 'Antares',    cond: 'Lv.10 に RM 累計5勝' },
  { rank: '25.7', name: 'ベテルギウス', en: 'Betelgeuse', cond: 'Lv.10 に RM 累計10勝' },
  { rank: '25.8', name: 'リゲル',       en: 'Rigel',      cond: 'Lv.10 に RM 累計20勝' },
  { rank: '25.9', name: 'デネブ',       en: 'Deneb',      cond: 'RM 7番勝負で勝ち越し<br><span style="color:#c09020;">または RM 通算20勝</span>', unlock: '修行終了<br>FINAL へ' }
];

/**
 * 修行コースのランク一覧モーダルを表示する。
 * 太陽系 9 段階・銀河系 9 段階を別表で並べる。
 */
function showTrainingRanks() {
  // Premium-v22: 現在ランクを取得して達成済みハイライト
  const { sunRank, galaxyRank } = (typeof calculateTrainingRank === 'function')
    ? calculateTrainingRank() : { sunRank: 0, galaxyRank: 0 };

  const renderTable = (title, ranks, headerColor, currentRank) => {
    let html = `<table class="rank-list-table" style="margin-bottom:18px;">`;
    // タイトル行
    html += `<thead><tr><th colspan="5" style="background:${headerColor};color:#5a3500;text-align:center;font-size:1rem;padding:8px;">${title}</th></tr>`;
    // Premium-v26 (v27 文字位置調整): カラムヘッダー行
    //   ランクを左寄せ（アイコンに近く）、名前と条件は右寄り（ゆったり配置）
    html += `<tr style="background:#f0e8d0;color:#5a3500;font-weight:bold;">` +
            `<th style="text-align:center;padding:6px 0 6px 4px;width:50px;"></th>` +
            `<th style="text-align:left;padding:6px 20px 6px 2px;white-space:nowrap;">ランク</th>` +
            `<th style="text-align:left;padding:6px 8px 6px 16px;">名前</th>` +
            `<th style="text-align:left;padding:6px 8px 6px 20px;">条件</th>` +
            `<th style="text-align:left;padding:6px 8px;white-space:nowrap;">解放</th>` +
            `</tr></thead>`;
    html += '<tbody>';
    ranks.forEach((r, idx) => {
      const rankNum = idx + 1;  // 1 始まりで calculateTrainingRank と対応
      const achieved = rankNum <= currentRank;
      const isCurrent = rankNum === currentRank;
      const rowStyle = achieved
        ? `background:${isCurrent ? '#fff3c4' : '#f0f5e8'};`
        : '';
      // Premium-v45: 🏆/✓ マーカーは削除（背景色だけで現在ランク/達成済みを区別、統一性のため）
      const marker = '';
      // Premium-v24: アイコンは常にカラー表示（達成/未達成は背景色だけで区別）
      // Premium-v25: 銀河系（25.x）の金色シンボルは暗い円形背景で映えさせる
      const isGalaxy = r.rank.startsWith('25.');
      const iconClass = 'training-rank-icon' + (isGalaxy ? ' training-rank-galaxy' : '');
      const iconCell = `<td style="text-align:center;padding:4px 0 4px 4px;width:50px;">` +
        `<img src="cosmo/${r.rank}.png" alt="${r.name}" class="${iconClass}">` +
        `</td>`;
      const unlockCell = r.unlock ? `<td style="white-space:nowrap;padding:4px 8px;">🔓 ${r.unlock}</td>` : '<td></td>';
      html += `<tr style="${rowStyle}">${iconCell}`;
      // Premium-v27: 各列の padding を調整（西口さん指示の文字位置調整）
      html += `<td style="white-space:nowrap;font-weight:bold;padding:4px 20px 4px 2px;">${marker}${r.rank}</td>`;
      html += `<td style="padding:4px 8px 4px 16px;">${r.name} <span style="color:#806040;font-size:0.85em;">${r.en}</span></td>`;
      html += `<td style="padding:4px 8px 4px 20px;">${r.cond}</td>`;
      html += unlockCell;
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
  };

  // Premium-v23 (v25 改): 現在ランク表示用のアイコン取得ヘルパー
  // 銀河系の金色シンボルは暗い円形背景で映えさせる
  const rankIconHtml = (rankData, size) => {
    if (!rankData) return '';
    const isGalaxy = rankData.rank.startsWith('25.');
    const bgStyle = isGalaxy
      ? 'background:radial-gradient(circle,#2a3a6a 0%,#0a1430 80%);box-shadow:0 0 0 1px rgba(255,215,0,0.35);padding:1px;box-sizing:border-box;'
      : '';
    return `<img src="cosmo/${rankData.rank}.png" alt="${rankData.name}" style="width:${size}px;height:${size}px;vertical-align:middle;border-radius:50%;margin:0 4px;object-fit:cover;${bgStyle}">`;
  };

  let html = '<div class="rank-list-modal-overlay" onclick="closeTrainingRanks()">';
  html += '<div class="rank-list-modal" onclick="event.stopPropagation()">';
  html += '<div class="rank-list-title">📊 修行コース ランク一覧</div>';
  // Premium-v22: 現在のランクを表示 (v23 でアイコン追加)
  const sunCurrent = sunRank > 0 ? TRAINING_SUN_RANKS[sunRank-1] : null;
  const galaxyCurrent = galaxyRank > 0 ? TRAINING_GALAXY_RANKS[galaxyRank-1] : null;
  html += '<div style="text-align:center;font-size:0.95rem;color:#5a3500;padding:6px 12px 10px;line-height:1.6;">';
  html += `☀ 太陽系: ${rankIconHtml(sunCurrent, 28)}<strong>${sunCurrent ? sunCurrent.rank + ' ' + sunCurrent.name : '未達成'}</strong>　／　`;
  html += `🌌 銀河系: ${rankIconHtml(galaxyCurrent, 28)}<strong>${galaxyCurrent ? galaxyCurrent.rank + ' ' + galaxyCurrent.name : '未達成'}</strong>`;
  html += '</div>';
  html += '<div class="rank-list-scroll">';
  html += renderTable('☀ 太陽系修行コース （Lv.6 〜 Lv.7）', TRAINING_SUN_RANKS, '#ffe8b0', sunRank);
  html += renderTable('🌌 銀河系修行コース （Lv.9 〜 Lv.10）', TRAINING_GALAXY_RANKS, '#d8e8ff', galaxyRank);
  html += '</div>';
  html += '<button class="rank-list-close-btn" onclick="closeTrainingRanks()">閉じる</button>';
  html += '</div></div>';

  const div = document.createElement('div');
  div.id = 'training-rank-list-container';
  div.innerHTML = html;
  document.body.appendChild(div);
}

function closeTrainingRanks() {
  const el = document.getElementById('training-rank-list-container');
  if (el) el.remove();
}

/**
 * 修行コース戦績モーダル（Premium-v19 本実装）。
 * loadTrainingRecord() の専用 localStorage キーから読み込んで表示。
 * 通常戦績と同じスタイル（勝/負/引/勝率）で各レベル別に集計。
 */
function showTrainingRecords() {
  const record = (typeof loadTrainingRecord === 'function') ? loadTrainingRecord() : {};
  // Premium-v22: 現在ランクを取得
  const { sunRank, galaxyRank } = (typeof calculateTrainingRank === 'function')
    ? calculateTrainingRank() : { sunRank: 0, galaxyRank: 0 };
  const sunCurrent = sunRank > 0 ? TRAINING_SUN_RANKS[sunRank-1] : null;
  const galaxyCurrent = galaxyRank > 0 ? TRAINING_GALAXY_RANKS[galaxyRank-1] : null;

  // 内部 cpuLevel と表示用ラベルの対応
  const rows = [
    { key: '21', course: '☀ 太陽系', lv: 'Lv.6' },
    { key: '11', course: '☀ 太陽系', lv: 'Lv.7' },
    { key: '13', course: '🌌 銀河系', lv: 'Lv.9' },
    { key: '14', course: '🌌 銀河系', lv: 'Lv.10' }
  ];

  const renderRow = (course, lvLabel, r) => {
    const total = r.win + r.lose + r.draw;
    const rate = total === 0 ? '-' : Math.round(r.win / total * 100) + '%';
    return `<tr>` +
           `<td style="white-space:nowrap;">${course}</td>` +
           `<td style="white-space:nowrap;">${lvLabel}</td>` +
           `<td>${r.win}</td><td>${r.lose}</td><td>${r.draw}</td><td>${rate}</td>` +
           `</tr>`;
  };

  // Premium-v23 (v25 改): 現在ランク表示用のアイコン取得ヘルパー
  // 銀河系の金色シンボルは暗い円形背景で映えさせる
  const rankIconHtml = (rankData, size) => {
    if (!rankData) return '';
    const isGalaxy = rankData.rank.startsWith('25.');
    const bgStyle = isGalaxy
      ? 'background:radial-gradient(circle,#2a3a6a 0%,#0a1430 80%);box-shadow:0 0 0 1px rgba(255,215,0,0.35);padding:1px;box-sizing:border-box;'
      : '';
    return `<img src="cosmo/${rankData.rank}.png" alt="${rankData.name}" style="width:${size}px;height:${size}px;vertical-align:middle;border-radius:50%;margin:0 4px;object-fit:cover;${bgStyle}">`;
  };

  let html = '<div class="rank-list-modal-overlay" onclick="closeTrainingRecords()">';
  html += '<div class="rank-list-modal" onclick="event.stopPropagation()">';
  html += '<div class="rank-list-title">📈 修行コース 戦績</div>';
  // Premium-v22 (v23 アイコン追加): 現在のランクを表示
  html += '<div style="text-align:center;font-size:0.95rem;color:#5a3500;padding:6px 12px 10px;line-height:1.6;">';
  html += `☀ 太陽系: ${rankIconHtml(sunCurrent, 28)}<strong>${sunCurrent ? sunCurrent.rank + ' ' + sunCurrent.name : '未達成'}</strong>　／　`;
  html += `🌌 銀河系: ${rankIconHtml(galaxyCurrent, 28)}<strong>${galaxyCurrent ? galaxyCurrent.rank + ' ' + galaxyCurrent.name : '未達成'}</strong>`;
  html += '</div>';
  html += '<div class="rank-list-scroll">';
  html += '<table class="rank-list-table">';
  html += '<thead><tr><th>コース</th><th>レベル</th><th>勝</th><th>負</th><th>引</th><th>勝率</th></tr></thead>';
  html += '<tbody>';
  rows.forEach(({ key, course, lv }) => {
    const r = record[key] || { win: 0, lose: 0, draw: 0 };
    html += renderRow(course, lv, r);
  });
  html += '</tbody></table>';
  html += '</div>';
  html += '<button class="rank-list-close-btn" onclick="closeTrainingRecords()">閉じる</button>';
  html += '</div></div>';

  const div = document.createElement('div');
  div.id = 'training-records-container';
  div.innerHTML = html;
  document.body.appendChild(div);
}

function closeTrainingRecords() {
  const el = document.getElementById('training-records-container');
  if (el) el.remove();
}
