/* ============================================================
   おでかけ告知キット  odekake.js
   ------------------------------------------------------------
   お出かけ（発送休止）の告知を、ページの決められた場所に出します。
   ふだんは on を false にしておけば、何も表示されません。

   使い方は、同じフォルダの README.md を見てください。
   ============================================================ */
(function () {
  'use strict';

  /* ============================================================
     ▼▼▼ お出かけのたびに、ここだけ書き換えます ▼▼▼
     ============================================================ */
  var CONFIG = {

    // お出かけ中は true、ふだんは false
    on: false,

    // 発送をお休みする最初の日
    from: '2026-09-13',

    // 発送を再開する日（この日の朝0時に、告知はひとりでに消えます）
    until: '2026-10-01',

    // 告知の中に置くリンク（不要なら '' にする）
    shopUrl: 'https://yumekichi-publishing.stores.jp/',
    shopLabel: 'オンラインショップはこちら',

    // PDF（ダウンロード商品）は、お休み中もすぐ使える？
    pdfAvailable: true,

    // LINE などのお返事も遅れることを添える？
    replyDelay: true,

    // 見出し（買えないと誤解されないよう、受付継続を先に伝える書き方）
    heading: 'ご注文は通常どおり承っています（発送のみお休みします）'
  };
  /* ============================================================
     ▲▲▲ 書き換えるのは、ここまで ▲▲▲
     ============================================================ */


  // ---- ここから下は、いじらなくて大丈夫です --------------------

  var WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

  // 'YYYY-MM-DD' を、時差に左右されない日付として読む
  function parseDay(text) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ''));
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  }

  function addDays(day, n) {
    return new Date(day.getTime() + n * 86400000);
  }

  // 9月13日（日）
  function md(day) {
    return (day.getUTCMonth() + 1) + '月' + day.getUTCDate() + '日（' + WEEKDAYS[day.getUTCDay()] + '）';
  }

  // 9月13日（曜日なし）
  function mdPlain(day) {
    return (day.getUTCMonth() + 1) + '月' + day.getUTCDate() + '日';
  }

  // 2026年9月13日
  function ymd(day) {
    return day.getUTCFullYear() + '年' + mdPlain(day);
  }

  // 年をまたぐときだけ「2027年1月5日」と年を添える
  function ymdIfNeeded(day, base) {
    return day.getUTCFullYear() === base.getUTCFullYear() ? mdPlain(day) : ymd(day);
  }

  // 「今」の時刻。確認のときだけ、URL の末尾に ?odekake-now=2026-10-02 と
  // 付ければ、その日にページを開いたことにして見え方を試せます。
  // （その人のブラウザの中だけの話で、ほかのお客様には影響しません）
  function now() {
    var m = /[?&]odekake-now=(\d{4}-\d{2}-\d{2})/.exec(location.search);
    if (m) {
      var t = Date.parse(m[1] + 'T12:00:00+09:00');
      if (isFinite(t)) return t;
    }
    return Date.now();
  }

  // until の 0時（日本時間）を過ぎていたら、もう出さない
  function isOver(untilText) {
    var end = Date.parse(untilText + 'T00:00:00+09:00');
    return isFinite(end) && now() >= end;
  }

  function el(tag, text) {
    var node = document.createElement(tag);
    if (text) node.appendChild(document.createTextNode(text));
    return node;
  }

  function strong(text) { return el('strong', text); }
  function br() { return document.createElement('br'); }

  function appendAll(parent, parts) {
    for (var i = 0; i < parts.length; i++) {
      parent.appendChild(typeof parts[i] === 'string' ? document.createTextNode(parts[i]) : parts[i]);
    }
    return parent;
  }

  // 告知バー（トップページ・購入直前など、大きく出す場所）
  function buildBar(d) {
    var box = document.createElement('div');
    box.className = 'odekake-bar';
    box.setAttribute('role', 'note');
    box.setAttribute('aria-label', '発送業務休止のお知らせ');

    var p = el('p');
    appendAll(p, [
      strong('【' + CONFIG.heading + '】'), br(),
      d.from + '〜' + d.lastDay + 'の期間、発送業務をお休みいたします。', br(),
      strong('ご注文の受付は通常どおり承っております。'),
      '期間中にいただいたご注文は、' + d.resume + '以降、順次発送いたします。'
    ]);

    if (CONFIG.pdfAvailable) {
      p.appendChild(br());
      p.appendChild(strong('PDF（ダウンロード版）は期間中もすぐにご利用いただけます。'));
    }

    if (CONFIG.shopUrl) {
      var a = el('a', CONFIG.shopLabel || CONFIG.shopUrl);
      a.href = CONFIG.shopUrl;
      p.appendChild(document.createTextNode(' '));
      p.appendChild(a);
    }

    if (CONFIG.replyDelay) {
      p.appendChild(br());
      p.appendChild(document.createTextNode('お問い合わせへのご返信も遅れる場合がございます。ご了承ください。'));
    }

    box.appendChild(p);
    return box;
  }

  // 小さな注記（ご購入の流れの途中など、文章に寄り添わせる場所）
  function buildNote(d) {
    var p = el('p', '※' + d.from + '〜' + d.lastDay + 'は発送業務をお休みしております。'
      + 'この期間のご注文は' + d.resume + '以降、順次発送いたします。');
    p.className = 'odekake-note';
    return p;
  }

  // 特定商取引法ページの「引渡し時期」に足す一文
  function buildLegal(d) {
    var span = el('span', '※' + d.fromFull + '〜' + d.lastDayFull + 'は発送業務休止期間のため、'
      + 'この期間のご注文は' + d.resumeFull + '以降に順次発送いたします。');
    span.className = 'odekake-legal';
    return span;
  }

  var BUILDERS = { bar: buildBar, note: buildNote, legal: buildLegal };

  function run() {
    var slots = document.querySelectorAll('[data-odekake]');
    var i;

    // 前に出したものがあれば、いったん片付ける（二重表示を防ぐ）
    for (i = 0; i < slots.length; i++) slots[i].textContent = '';

    // URL の末尾に ?odekake-preview=1 と付けると、on が false のままでも
    // 見え方だけ確かめられます（自分のブラウザの中だけ）。
    var preview = /[?&]odekake-preview=1/.test(location.search);
    if (!CONFIG.on && !preview) return;

    var from = parseDay(CONFIG.from);
    var until = parseDay(CONFIG.until);
    if (!from || !until || until <= from) {
      if (window.console) console.warn('[odekake] from / until の日付を確認してください。');
      return;
    }
    if (isOver(CONFIG.until)) return;   // 再開日を過ぎたら、ひとりでに消える

    var lastDay = addDays(until, -1);   // 発送をお休みする最後の日
    var d = {
      from: md(from),
      lastDay: md(lastDay),
      resume: md(until),
      fromFull: ymd(from),
      lastDayFull: ymdIfNeeded(lastDay, from),
      resumeFull: ymdIfNeeded(until, from)
    };

    for (i = 0; i < slots.length; i++) {
      var build = BUILDERS[slots[i].getAttribute('data-odekake')];
      if (build) slots[i].appendChild(build(d));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
