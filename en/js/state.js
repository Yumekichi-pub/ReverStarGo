/* ============================================================
   state.js — グローバル状態（変数のみ、関数なし）
   board / 手番 / GP / アニメ / AI 設定 / カスタム設定 /
   Reverse Match / 棋譜の各状態を一箇所に集約。
   ※ 純粋な状態変数のみ（関数の呼び出しを伴う初期化はメイン側）
   ============================================================ */

// ===== 状態 =====
let board = {};                            // 各セルの状態 {key: 'black'|'white'|null}
let current = 'black';                     // 現在の手番（'black' or 'white'）
let captured = { black: 0, white: 0 };     // 各色が囲み取りで取った石数の累計
let pendingMove = null;                    // GP コール待ちの手 [q,r,s]
let passState = 0; // 0=通常パス, 1=終了前1人目, 2=終了前2人目
let capturePending = new Set(); // アニメーション中の取り除き対象セル
let isAnimating = false;        // アニメーション中はクリック無効
let lastMove = null;            // 最後に置いた場所 [q,r,s]（次の手まで表示）
let pendingMoveMarker = null;   // GP選択中の仮マーカー [q,r,s]
let showPlacedAnim = false;     // 置いた瞬間のアニメーション（最初のrenderのみ）
let prevKoException = false;    // 直前の手がコウ例外で打たれたか（両者連続例外で終局するため）

// ===== AI設定 =====
let humanColor = 'black';   // プレイヤーの色
let cpuColor = 'white';     // コンピューターの色
let cpuLevel = 2;           // 1=初級, 2=中級, 3=上級, 4=強敵, 5=最強

// ===== カスタム設定 =====
let cpuSpeedLevel  = 2;        // 1=遅め, 2=普通, 3=速め
let animationsEnabled = true;  // 石のアクション ON/OFF
let notationMode  = 0;         // 0=オフ, 1=4箇所, 2=全表示
let hintEnabled   = true;      // 置けるヒント ON/OFF
let soundEnabled  = true;      // 効果音 ON/OFF
let moveQualityEnabled = true; // 「いい手」「キャプチャ称賛」メッセージ表示 ON/OFF (v67)
let moveQualityTwoPlayerEnabled = false; // 2人対戦時の称賛メッセージ表示 ON/OFF (v68、デフォルト OFF)
let battleMode    = 'cpu';     // 'cpu'=CPU対戦, 'two'=2人対戦
let prevBoardSnapshot = null;  // コウ判定用：直前の手を打つ前のボード状態
let boardHistory = [];         // スーパーコウ判定用：全局面の履歴
let sessionWins = { black: 0, white: 0, draw: 0 }; // セッション勝敗カウント

// ===== Reverse Match =====
// Lv.5 以上の対戦を 2 局 1 セット（色入れ替え合計得点制）で行う
// 先手後手の有利不利を解消し、実力のみで勝負できる仕組み
// null = 通常対戦 / {...} = RM 進行中
let reverseMatch = null;
// reverseMatch の構造:
//   round: 1 or 2 （現在の局）
//   round1Result: { bTotal, wTotal, humanColor, humanPoints, cpuPoints } （1局目の結果）
//   initialHumanColor: 'black' or 'white' （試合開始時のプレイヤーの色）

// ===== 棋譜記録 =====
let moveHistory = [];       // [{num, player, q, r, s, gpColor, type:'move'|'pass', boardAfter, capturedAfter}]
let replayMode = false;     // リプレイモード中か
let replayData = null;      // リプレイ中のゲ��ムデータ
let replayStep = 0;         // リプレイの現在ステップ
