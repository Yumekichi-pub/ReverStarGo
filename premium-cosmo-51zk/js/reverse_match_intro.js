/* ============================================================
   reverse_match_intro.js — リバースマッチ初回説明モーダル (v69 新規)

   2種類の説明モーダル:
   - リバースマッチ自体の説明: 初めて RM 対戦が始まる直前 (startGame)
   - ランクアップマッチ用の説明: Lv.5 解放時 (level-unlock 後)

   それぞれ初回 1 回のみ表示。localStorage で読了フラグ管理。
   ============================================================ */

const RM_INTRO_SEEN_KEY = 'rsg_rm_intro_seen';
const RM_PROMO_INTRO_SEEN_KEY = 'rsg_rm_promo_intro_seen';

/**
 * リバースマッチ自体の説明モーダルを表示する。
 * @param {() => void} onClose - 「理解しました」ボタンクリック後のコールバック
 */
function showReverseMatchIntro(onClose) {
  const modal = document.getElementById('reverse-match-intro-modal');
  if (!modal) { if (onClose) onClose(); return; }
  modal.style.display = 'flex';
  const btn = document.getElementById('rm-intro-ok-btn');
  // 既存のリスナを上書き（onclick 方式で確実に1個だけ）
  btn.onclick = () => {
    modal.style.display = 'none';
    if (onClose) onClose();
  };
}

/**
 * Lv.5 解放時のランクアップマッチ説明モーダルを表示する。
 * @param {() => void} onClose
 */
function showReverseMatchPromoIntro(onClose) {
  const modal = document.getElementById('reverse-match-promo-intro-modal');
  if (!modal) { if (onClose) onClose(); return; }
  modal.style.display = 'flex';
  const btn = document.getElementById('rm-promo-intro-ok-btn');
  btn.onclick = () => {
    modal.style.display = 'none';
    if (onClose) onClose();
  };
}

function hasSeenRmIntro() {
  try { return localStorage.getItem(RM_INTRO_SEEN_KEY) === '1'; } catch(e) { return false; }
}
function markRmIntroSeen() {
  try { localStorage.setItem(RM_INTRO_SEEN_KEY, '1'); } catch(e) {}
}
function hasSeenRmPromoIntro() {
  try { return localStorage.getItem(RM_PROMO_INTRO_SEEN_KEY) === '1'; } catch(e) { return false; }
}
function markRmPromoIntroSeen() {
  try { localStorage.setItem(RM_PROMO_INTRO_SEEN_KEY, '1'); } catch(e) {}
}
