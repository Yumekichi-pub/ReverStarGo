/* ============================================================
   config.js — 定数とマスタデータ
   index.html から切り出し（中身は完全保持）
   ============================================================ */

// ===== 定数 =====
const HEX_SIZE = 27;
const SQRT3 = Math.sqrt(3);
const DIRS = [[1,-1,0],[1,0,-1],[0,1,-1],[-1,1,0],[-1,0,1],[0,-1,1]];

// 安全弁の閾値（コウ無限ループ等の異常状態を検知して強制終局）
const SAFETY_MAX_MOVES = 80;            // moveHistory.length がこれを超えたら強制終局
const SAFETY_MAX_BOARD_HISTORY = 100;   // boardHistory.length がこれを超えたら強制終局
const DIAG_LOG_INTERVAL = 20;           // 診断ログを何手ごとに出すか
// ===== 37マス星型ボード (cube座標 [q,r,s], q+r+s=0) =====
const ALL_CELLS = [
  // 中央六角形 (半径2 = 19マス)
  [0,0,0],
  [1,-1,0],[1,0,-1],[0,1,-1],[-1,1,0],[-1,0,1],[0,-1,1],
  [2,-2,0],[2,-1,-1],[2,0,-2],[1,1,-2],[0,2,-2],[-1,2,-1],
  [-2,2,0],[-2,1,1],[-2,0,2],[-1,-1,2],[0,-2,2],[1,-2,1],
  // 6つの腕 (各3マス = 18マス)
  [3,-1,-2],[3,-2,-1],[4,-2,-2],   // +q 右
  [-3,1,2],[-3,2,1],[-4,2,2],      // -q 左
  [-1,3,-2],[-2,3,-1],[-2,4,-2],   // +r 左下
  [1,-3,2],[2,-3,1],[2,-4,2],       // -r 右上
  [-1,-2,3],[-2,-1,3],[-2,-2,4],   // +s 左上
  [1,2,-3],[2,1,-3],[2,2,-4]        // -s 右下
];

const CELL_SET = new Set(ALL_CELLS.map(c => c.join(',')));
// ===== セルラベル（棋譜表示用 - ReverStarGo Notation System） =====
const CELL_LABELS = {
  '0,0,0': 'CP',
  // A ring（内輪・時計盤の奇数位置）
  '1,-1,0': 'A1', '1,0,-1': 'A3', '0,1,-1': 'A5',
  '-1,1,0': 'A7', '-1,0,1': 'A9', '0,-1,1': 'AJ',
  // B ring（外輪・時計盤の全12位置）
  '1,-2,1': 'BQ', '2,-2,0': 'B1', '2,-1,-1': 'B2', '2,0,-2': 'B3',
  '1,1,-2': 'B4', '0,2,-2': 'B5', '-1,2,-1': 'B6', '-2,2,0': 'B7',
  '-2,1,1': 'B8', '-2,0,2': 'B9', '-1,-1,2': 'BX', '0,-2,2': 'BJ',
  // C 腕ベース（各腕2マス）
  '1,-3,2': 'CQ', '2,-3,1': 'C1',     // Q腕 (12時)
  '3,-2,-1': 'C2', '3,-1,-2': 'C3',   // 2腕 (2時)
  '2,1,-3': 'C4', '1,2,-3': 'C5',     // 4腕 (4時)
  '-1,3,-2': 'C6', '-2,3,-1': 'C7',   // 6腕 (6時)
  '-3,2,1': 'C8', '-3,1,2': 'C9',     // 8腕 (8時)
  '-2,-1,3': 'CX', '-1,-2,3': 'CJ',   // X腕 (10時)
  // D 腕先端（各腕1マス）
  '2,-4,2': 'DQ', '4,-2,-2': 'D2', '2,2,-4': 'D4',
  '-2,4,-2': 'D6', '-4,2,2': 'D8', '-2,-2,4': 'DX'
};
const KIFU_STORAGE_KEY = 'reverstargo-kifu';
const MAX_SAVED_GAMES = 30;
const BATTLE_RECORD_KEY = 'reverstargo-battle-record';
const LEVEL_NAMES = ['Entry','Beginner','Intermediate','Advanced','Formidable','MAX','FINAL'];
// ===== プレイヤーランクシステム =====
const RANKS = [
  { name: 'Paper', icon: 'icon/1.png', condition: 'Initial rank' },                  // 0  🔓Lv.1
  { name: 'Leather', icon: 'icon/2.png', condition: 'First win at Lv.1' },           // 1
  { name: 'Wood', icon: 'icon/3.png', condition: '3 wins at Lv.1' },                 // 2
  { name: 'Stone', icon: 'icon/4.png', condition: 'Win Best of 3' },                 // 3  🔓Lv.2
  { name: 'Iron', icon: 'icon/5.png', condition: '5 wins at Lv.2' },                 // 4
  { name: 'Steel', icon: 'icon/6.png', condition: '10 wins at Lv.2' },               // 5
  { name: 'Bronze', icon: 'icon/7.png', condition: 'Win Best of 5' },                // 6  🔓Lv.3
  { name: 'Silver', icon: 'icon/8.png', condition: '5 wins at Lv.3' },               // 7
  { name: 'Gold', icon: 'icon/9.png', condition: '10 wins at Lv.3' },                // 8
  { name: 'Platinum', icon: 'icon/10.png', condition: 'Win Best of 7' },             // 9  🔓Lv.4
  { name: 'Turquoise', icon: 'icon/11.png', condition: '2 wins at Lv.4' },           // 10
  { name: 'Aquamarine', icon: 'icon/12.png', condition: '5 wins at Lv.4' },          // 11
  { name: 'Garnet', icon: 'icon/13.png', condition: '10 wins at Lv.4' },             // 12
  { name: 'Topaz', icon: 'icon/14.png', condition: 'Win Best of 7' },                // 13 🔓Lv.5
  { name: 'Amethyst', icon: 'icon/15.png', condition: '2 RM wins at Lv.5' },         // 14
  { name: 'Ruby', icon: 'icon/16.png', condition: '5 RM wins at Lv.5' },             // 15
  { name: 'Sapphire', icon: 'icon/17.png', condition: '10 RM wins at Lv.5' },        // 16
  { name: 'Emerald', icon: 'icon/18.png', condition: '20 RM wins at Lv.5' },         // 17
  { name: 'Diamond', icon: 'icon/19.png', condition: 'Win RM Best of 5' },           // 18 🔓MAX
  { name: 'Specialist', icon: 'icon/20.png', condition: '2 RM wins at MAX' },        // 19
  { name: 'Expert', icon: 'icon/21.png', condition: '5 RM wins at MAX' },            // 20
  { name: 'Champion', icon: 'icon/22.png', condition: '10 RM wins at MAX' },         // 21
  { name: 'Master', icon: 'icon/23.png', condition: '20 RM wins at MAX' },           // 22
  { name: 'Legend', icon: 'icon/24.png', condition: 'Win RM Best of 7' },            // 23
  { name: 'Grandmaster', icon: 'icon/25.png', condition: 'Win RM Best of 15' },      // 24 🔓FINAL
  { name: 'Archmaster', icon: 'icon/26.png', condition: '10 RM wins at FINAL' },     // 25
  { name: 'Overlord', icon: 'icon/27.png', condition: '30 RM wins at FINAL' },       // 26
  { name: 'Demigod', icon: 'icon/28.png', condition: '50 RM wins at FINAL' },        // 27
  { name: 'God', icon: 'icon/29.png', condition: 'Win RM Best of 11' },              // 28
  { name: 'Zeus', icon: 'icon/30.png', condition: 'Win RM Best of 21' },             // 29
];
