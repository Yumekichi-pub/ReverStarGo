/* ============================================================
   rng.js — シード可能な疑似乱数生成器（決定論モード）
   nextRandom() は Math.random のドロップイン代替。
   setRandomSeed(数値) で確定的な乱数列を生成（同一棋譜検証用）。
   ============================================================ */

// ===== シード可能な疑似乱数生成器（決定論モード用）=====
// 通常は randomSeed=null で nextRandom() を呼び出す（従来の動作と完全互換）。
// CPU Battle Lab 等で setRandomSeed(数値) を呼べば、その値から確定的な乱数列が
// 生成され、リファクタ前後の同一棋譜検証が可能になる。
let randomSeed = null;
let _randomState = 0;

/** mulberry32: 高品質で高速な 32-bit PRNG。状態は _randomState で管理する。 */
function _mulberry32() {
  _randomState = (_randomState + 0x6D2B79F5) | 0;
  let t = _randomState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * シード可能な乱数を返す。nextRandom() のドロップイン代替。
 * randomSeed が null なら従来通り nextRandom()、それ以外なら確定的乱数。
 * @returns {number} [0, 1) の乱数
 */
function nextRandom() {
  return randomSeed === null ? Math.random() : _mulberry32();
}

/**
 * シードを設定して決定論モードを開始/解除する。
 * @param {number|null} seed - シード値（null で決定論モード解除＝Math.random に戻る）
 */
function setRandomSeed(seed) {
  randomSeed = seed;
  _randomState = seed === null ? 0 : (seed | 0);
}
