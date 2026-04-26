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
const LEVEL_NAMES = ['入門','初級','中級','上級','強敵','MAX','FINAL'];
// ===== プレイヤーランクシステム =====
const RANKS = [
  { name: 'ペーパー', icon: 'icon/1.png', condition: '初期ランク' },              // 0  🔓Lv.1
  { name: 'レザー', icon: 'icon/2.png', condition: 'Lv.1に初勝利' },             // 1
  { name: 'ウッド', icon: 'icon/3.png', condition: 'Lv.1に累計3勝' },            // 2
  { name: 'ストーン', icon: 'icon/4.png', condition: '3番勝負で勝ち越し' },       // 3  🔓Lv.2
  { name: 'アイアン', icon: 'icon/5.png', condition: 'Lv.2に累計5勝' },          // 4
  { name: 'スチール', icon: 'icon/6.png', condition: 'Lv.2に累計10勝' },         // 5
  { name: 'ブロンズ', icon: 'icon/7.png', condition: '5番勝負で勝ち越し' },       // 6  🔓Lv.3
  { name: 'シルバー', icon: 'icon/8.png', condition: 'Lv.3に累計5勝' },          // 7
  { name: 'ゴールド', icon: 'icon/9.png', condition: 'Lv.3に累計10勝' },         // 8
  { name: 'プラチナ', icon: 'icon/10.png', condition: '7番勝負で勝ち越し' },       // 9  🔓Lv.4
  { name: 'ターコイズ', icon: 'icon/11.png', condition: 'Lv.4に累計2勝' },        // 10
  { name: 'アクアマリン', icon: 'icon/12.png', condition: 'Lv.4に累計5勝' },       // 11
  { name: 'ガーネット', icon: 'icon/13.png', condition: 'Lv.4に累計10勝' },       // 12
  { name: 'トパーズ', icon: 'icon/14.png', condition: '7番勝負で勝ち越し' },       // 13 🔓Lv.5
  { name: 'アメジスト', icon: 'icon/15.png', condition: 'Lv.5に RM 累計2勝' },    // 14
  { name: 'ルビー', icon: 'icon/16.png', condition: 'Lv.5に RM 累計5勝' },       // 15
  { name: 'サファイア', icon: 'icon/17.png', condition: 'Lv.5に RM 累計10勝' },   // 16
  { name: 'エメラルド', icon: 'icon/18.png', condition: 'Lv.5に RM 累計20勝' },   // 17
  { name: 'ダイヤモンド', icon: 'icon/19.png', condition: 'RM 5番勝負で勝ち越し' }, // 18 🔓MAX
  { name: 'スペシャリスト', icon: 'icon/20.png', condition: 'MAXに RM 累計2勝' },  // 19
  { name: 'エキスパート', icon: 'icon/21.png', condition: 'MAXに RM 累計5勝' },   // 20
  { name: 'チャンピオン', icon: 'icon/22.png', condition: 'MAXに RM 累計10勝' },  // 21
  { name: 'マスター', icon: 'icon/23.png', condition: 'MAXに RM 累計20勝' },      // 22
  { name: 'レジェンド', icon: 'icon/24.png', condition: 'RM 7番勝負で勝ち越し' }, // 23
  { name: 'グランドマスター', icon: 'icon/25.png', condition: 'RM 15番勝負で勝ち越し' }, // 24 🔓FINAL
  { name: 'アークマスター', icon: 'icon/26.png', condition: 'FINALに RM 累計10勝' }, // 25
  { name: 'オーバーロード', icon: 'icon/27.png', condition: 'FINALに RM 累計30勝' }, // 26
  { name: 'デミゴッド', icon: 'icon/28.png', condition: 'FINALに RM 累計50勝' },   // 27
  { name: 'ゴッド', icon: 'icon/29.png', condition: 'RM 11番勝負で勝ち越し' },   // 28
  { name: 'ゼウス', icon: 'icon/30.png', condition: 'RM 21番勝負で勝ち越し' },   // 29
];
