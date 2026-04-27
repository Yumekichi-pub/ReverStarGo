/* ============================================================
   daily.js — デイリーチャレンジ + カレンダー + トロフィー
   毎日プレイの記録、月間カレンダー表示、月別トロフィー、
   トロフィー一覧、デイリー解説ポップアップ。
   依存：localStorage、loadBattleRecord（records.js）、
          showPage（navigation.js）等。
   ============================================================ */

// ===== デイリーチャレンジ =====
const DAILY_KEY = 'reverstargo-daily';
const DAILY_START_YEAR = 2026;
const DAILY_START_MONTH = 1; // January
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth() + 1; // 1-12
let dailyChallengeDate = null; // デイリーチャレンジの対象日付

function loadDailyData() {
  try {
    const data = JSON.parse(localStorage.getItem(DAILY_KEY));
    if (data) return data;
  } catch(e) {}
  return {};
}

function saveDailyData(data) {
  try { localStorage.setItem(DAILY_KEY, JSON.stringify(data)); } catch(e) {}
}

function markDailyComplete(dateStr) {
  const data = loadDailyData();
  data[dateStr] = true;
  saveDailyData(data);
}

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/**
 * デイリーチャレンジのカレンダー UI を描画する。
 * 当月の日付、完了済み日、未完了日、月跨ぎナビなどを表示。
 */
function renderCalendar() {
  const data = loadDailyData();
  const today = new Date();
  const todayStr = getTodayStr();

  // Clamp calendar range
  if (calYear < DAILY_START_YEAR || (calYear === DAILY_START_YEAR && calMonth < DAILY_START_MONTH)) {
    calYear = DAILY_START_YEAR;
    calMonth = DAILY_START_MONTH;
  }
  if (calYear > today.getFullYear() || (calYear === today.getFullYear() && calMonth > today.getMonth() + 1)) {
    calYear = today.getFullYear();
    calMonth = today.getMonth() + 1;
  }

  document.getElementById('cal-month-label').textContent = `${calYear}年${calMonth}月`;

  // Navigation buttons
  const prevBtn = document.getElementById('cal-prev');
  const nextBtn = document.getElementById('cal-next');
  prevBtn.disabled = (calYear === DAILY_START_YEAR && calMonth === DAILY_START_MONTH);
  nextBtn.disabled = (calYear === today.getFullYear() && calMonth === today.getMonth() + 1);

  // Build calendar
  const firstDay = new Date(calYear, calMonth - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(calYear, calMonth, 0).getDate();

  const tbody = document.getElementById('calendar-body');
  tbody.innerHTML = '';

  let completedCount = 0;
  let day = 1;
  for (let row = 0; row < 6; row++) {
    if (day > daysInMonth) break;
    const tr = document.createElement('tr');
    for (let col = 0; col < 7; col++) {
      const td = document.createElement('td');
      if ((row === 0 && col < firstDay) || day > daysInMonth) {
        td.textContent = '';
      } else {
        const dateStr = `${calYear}-${String(calMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const span = document.createElement('span');
        span.className = 'cal-day';
        span.textContent = day;

        const dateObj = new Date(calYear, calMonth - 1, day);
        const isFuture = dateObj > today;
        const isToday = dateStr === todayStr;

        if (isToday) span.classList.add('today');

        if (data[dateStr]) {
          span.classList.add('completed');
          completedCount++;
          // devMode: タップで未クリアに戻す
          if (devMode) {
            span.onclick = (() => {
              const ds = dateStr;
              return () => { devToggleDaily(ds, false); };
            })();
          }
        } else if (isFuture) {
          span.classList.add('future');
          // devMode: 未来の日付もタップでクリア済みにできる
          if (devMode) {
            span.onclick = (() => {
              const ds = dateStr;
              return () => { devToggleDaily(ds, true); };
            })();
          }
        } else {
          // Playable (past or today, not completed)
          span.classList.add('playable');
          span.onclick = (() => {
            const ds = dateStr;
            return () => {
              if (devMode) { devToggleDaily(ds, true); }
              else { startDailyChallenge(ds); }
            };
          })();
        }

        td.appendChild(span);
        day++;
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  // Stats
  document.getElementById('calendar-stats').textContent =
    `${calMonth}月: ${completedCount} / ${daysInMonth} 日クリア`;
}

function isMonthComplete(year, month) {
  const data = loadDailyData();
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1;
  // Future months → not complete
  if (year > todayYear || (year === todayYear && month > todayMonth)) {
    return false;
  }
  // Check all days in the month
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    if (!data[dateStr]) return false;
  }
  return true;
}

/**
 * 月別トロフィーアイコンを描画する。
 * 各月のデイリーチャレンジ全完了でブロンズ→シルバー→ゴールドが付与される仕組み。
 */
function renderTrophies() {
  const year = calYear;
  const month = calMonth;
  const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const container = document.getElementById('monthly-trophy-container');
  const complete = isMonthComplete(year, month);
  container.className = 'custom-section' + (complete ? '' : ' locked');
  container.innerHTML = '';

  const img = document.createElement('img');
  img.src = `trophy/${month}.jpg`;
  img.alt = `${monthNames[month-1]}トロフィー`;

  const label = document.createElement('div');
  label.className = 'trophy-label';
  label.textContent = complete ? `🏆 ${monthNames[month-1]} コンプリート！` : `${monthNames[month-1]} トロフィー`;

  container.appendChild(img);
  container.appendChild(label);
}

/**
 * 取得済みトロフィーの一覧をモーダルに描画する。
 * 月ごとのトロフィー画像とラベルを表示。
 */
function renderTrophyList() {
  const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const container = document.getElementById('trophy-list-container');
  container.innerHTML = '';

  const today = new Date();
  const currentYear = today.getFullYear();
  const startYear = 2026;
  const endYear = Math.max(currentYear, startYear);

  // 新しい年から順に表示
  for (let year = endYear; year >= startYear; year--) {
    const section = document.createElement('div');
    section.className = 'trophy-year-section custom-section';

    let completedMonths = 0;

    const title = document.createElement('h2');
    section.appendChild(title);

    // 月間トロフィーグリッド
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(4, 1fr)';
    grid.style.gap = '8px';
    grid.style.marginBottom = '12px';

    for (let m = 1; m <= 12; m++) {
      const complete = isMonthComplete(year, m);
      if (complete) completedMonths++;

      const div = document.createElement('div');
      div.className = 'trophy-item' + (complete ? '' : ' locked');

      const img = document.createElement('img');
      img.src = `trophy/${m}.jpg`;
      img.alt = `${monthNames[m-1]}トロフィー`;

      const label = document.createElement('div');
      label.className = 'trophy-label';
      label.textContent = monthNames[m-1];

      div.appendChild(img);
      div.appendChild(label);
      grid.appendChild(div);
    }

    title.textContent = `🏆 ${year}年（${completedMonths}/12）`;
    section.appendChild(grid);

    // 年間トロフィー
    const yearDiv = document.createElement('div');
    const yearComplete = completedMonths === 12;
    yearDiv.className = 'trophy-item' + (yearComplete ? '' : ' locked');
    yearDiv.style.textAlign = 'center';

    const yearImg = document.createElement('img');
    yearImg.src = `trophy/${year}.jpg`;
    yearImg.alt = `${year}年間トロフィー`;
    yearImg.style.width = '120px';
    yearImg.style.maxWidth = '120px';
    yearImg.style.border = '3px solid ' + (yearComplete ? '#c0a858' : '#d0c8b0');
    yearImg.style.borderRadius = '16px';
    yearImg.style.background = '#fff';
    yearImg.onerror = function() { this.style.display = 'none'; };

    const yearLabel = document.createElement('div');
    yearLabel.className = 'trophy-label';
    yearLabel.textContent = yearComplete ? `🏆 ${year}年 コンプリート！` : `${year}年`;

    yearDiv.appendChild(yearImg);
    yearDiv.appendChild(yearLabel);
    section.appendChild(yearDiv);

    container.appendChild(section);
  }
}

function calendarPrev() {
  calMonth--;
  if (calMonth < 1) { calMonth = 12; calYear--; }
  renderCalendar();
  renderTrophies();
}

function calendarNext() {
  calMonth++;
  if (calMonth > 12) { calMonth = 1; calYear++; }
  renderCalendar();
  renderTrophies();
}

let isDailySetup = false;

function startDailyChallenge(dateStr) {
  dailyChallengeDate = dateStr;
  isDailySetup = true;
  showPage('game-setup');
}

function showDailyHelp() {
  document.getElementById('daily-help-popup').style.display = 'flex';
}
function hideDailyHelp() {
  document.getElementById('daily-help-popup').style.display = 'none';
}
