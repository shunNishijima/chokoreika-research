// ネコ受付（パターン2）の画面。データはこの端末のブラウザ（localStorage）にだけ保存する（試作）。
(function () {
  "use strict";
  var KEY = "choko-neko-v1";
  var SETTINGS_KEY = "choko-neko-settings-v1";
  var IDLE_MS = 90000; // 操作がないとアイドリング画面に戻るまでの時間
  var app = document.getElementById("app");

  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }

  var state = load(KEY, Core.emptyState());
  var settings = load(SETTINGS_KEY, { club: "", kinds: ["朝ご飯会", "映画会", "ご飯会", "体操"] });
  function commit(s) { state = s; save(KEY, state); }
  function now() { return new Date().toISOString(); }
  function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function currentEvent() { return state.events.filter(function (e) { return e.id === state.currentEventId; })[0] || null; }
  function jp(dateStr) { if (!dateStr) return ""; var p = dateStr.split("-"); return Number(p[1]) + "月" + Number(p[2]) + "日"; }
  function on(id, fn) { var el = document.getElementById(id); if (el) el.addEventListener("click", fn); }
  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; }

  // ---------- ネコの絵（SVG） ----------
  function walkingCat(fill) {
    return '<svg viewBox="0 0 130 95" aria-hidden="true"><g stroke="var(--line)" stroke-width="3" stroke-linejoin="round">' +
      '<path class="tail" d="M24 52 Q4 44 10 18" fill="none" stroke-width="14" stroke-linecap="round"/>' +
      '<path class="tail" d="M24 52 Q4 44 10 18" fill="none" stroke-width="8" stroke-linecap="round" style="stroke:' + fill + '"/>' +
      '<rect class="leg" x="30" y="60" width="10" height="26" rx="5" fill="' + fill + '"/>' +
      '<rect class="leg b" x="44" y="60" width="10" height="26" rx="5" fill="' + fill + '"/>' +
      '<rect class="leg b" x="72" y="60" width="10" height="26" rx="5" fill="' + fill + '"/>' +
      '<rect class="leg" x="86" y="60" width="10" height="26" rx="5" fill="' + fill + '"/>' +
      '<ellipse cx="62" cy="56" rx="40" ry="20" fill="' + fill + '"/>' +
      '<polygon points="88,30 92,8 104,24" fill="' + fill + '"/><polygon points="108,22 122,8 122,32" fill="' + fill + '"/>' +
      '<circle cx="106" cy="38" r="19" fill="' + fill + '"/></g>' +
      '<g class="blink"><ellipse cx="101" cy="35" rx="2.6" ry="3.6" fill="var(--line)"/><ellipse cx="114" cy="35" rx="2.6" ry="3.6" fill="var(--line)"/></g>' +
      '<polygon points="106,43 110,43 108,46" fill="var(--pink)"/></svg>';
  }

  function sleepingCat(fill) {
    return '<svg viewBox="0 0 170 100" aria-hidden="true"><g class="breath" stroke="var(--line)" stroke-width="3" stroke-linejoin="round">' +
      '<ellipse cx="80" cy="70" rx="58" ry="26" fill="' + fill + '"/>' +
      '<path d="M26 74 Q40 98 100 94 Q130 92 136 80" fill="none" stroke-width="10" stroke-linecap="round" style="stroke:' + fill + '"/>' +
      '<polygon points="114,48 118,26 130,42" fill="' + fill + '"/><polygon points="134,42 148,28 148,52" fill="' + fill + '"/>' +
      '<circle cx="132" cy="62" r="20" fill="' + fill + '"/>' +
      '<path d="M122 61 q4 4 8 0 M136 61 q4 4 8 0" fill="none" stroke-width="2.5"/></g>' +
      '<polygon points="132,68 136,68 134,71" fill="var(--pink)"/></svg>';
  }

  // 正面を向いて座るネコ。mode: "yawn"（あくび）/ "wave"（手をふる）/ "blink"
  function sittingCat(fill, mode) {
    var eyes = '<ellipse cx="38" cy="48" rx="4" ry="5.5" fill="var(--line)"/><ellipse cx="62" cy="48" rx="4" ry="5.5" fill="var(--line)"/>';
    var eyeClass = mode === "yawn" ? "yawneyes" : "blink";
    return '<svg viewBox="0 0 100 130" aria-hidden="true"><g stroke="var(--line)" stroke-width="3" stroke-linejoin="round">' +
      '<path class="tail" d="M74 116 Q100 112 94 84" fill="none" stroke-width="9" stroke-linecap="round" style="stroke:' + fill + '"/>' +
      '<ellipse cx="50" cy="96" rx="30" ry="30" fill="' + fill + '"/>' +
      (mode === "wave" ? '<ellipse class="wave" cx="82" cy="62" rx="8" ry="16" fill="' + fill + '"/>' : '') +
      '<polygon points="24,34 26,6 46,24" fill="' + fill + '"/><polygon points="76,34 74,6 54,24" fill="' + fill + '"/>' +
      '<circle cx="50" cy="48" r="27" fill="' + fill + '"/>' +
      '<ellipse cx="38" cy="122" rx="9" ry="6" fill="' + fill + '"/><ellipse cx="62" cy="122" rx="9" ry="6" fill="' + fill + '"/></g>' +
      '<g class="' + eyeClass + '">' + eyes + '</g>' +
      '<polygon points="47,56 53,56 50,60" fill="var(--pink)"/>' +
      (mode === "yawn" ? '<ellipse class="yawn" cx="50" cy="64" rx="7" ry="8" fill="#8a2f3a" stroke="var(--line)" stroke-width="2"/>'
        : '<path d="M44 62 q3 4 6 0 q3 4 6 0" fill="none" stroke="var(--line)" stroke-width="2.2"/>') +
      '<path d="M20 52 h-12 M20 58 h-12 M80 52 h12 M80 58 h12" stroke="var(--line)" stroke-width="1.6"/></svg>';
  }

  function face(kind) {
    var mouth = kind === "good" ? '<path d="M18 38 q14 14 28 0" fill="none" stroke="var(--line)" stroke-width="4" stroke-linecap="round"/>'
      : kind === "bad" ? '<path d="M20 44 q12 -10 24 0" fill="none" stroke="var(--line)" stroke-width="4" stroke-linecap="round"/>'
        : '<path d="M20 40 h24" stroke="var(--line)" stroke-width="4" stroke-linecap="round"/>';
    var bg = kind === "good" ? "#ffd166" : kind === "bad" ? "#a8c5e6" : "#f4e3b2";
    var extra = kind === "good" ? '<circle cx="32" cy="6" r="0" /><ellipse cx="32" cy="5" rx="14" ry="4" fill="none" stroke="#d9a400" stroke-width="3"/>' : "";
    return '<svg viewBox="0 0 64 64" aria-hidden="true">' + extra + '<circle cx="32" cy="34" r="26" fill="' + bg + '" stroke="var(--line)" stroke-width="3"/>' +
      '<circle cx="23" cy="28" r="3.5" fill="var(--line)"/><circle cx="41" cy="28" r="3.5" fill="var(--line)"/>' + mouth + '</svg>';
  }

  function person(g) {
    var col = g === "女" ? "#e07a8a" : "#5b8bd0";
    var bodyShape = g === "女" ? '<polygon points="50,52 24,104 76,104" fill="' + col + '" stroke="var(--line)" stroke-width="3"/>'
      : '<polygon points="24,52 76,52 50,104" fill="' + col + '" stroke="var(--line)" stroke-width="3"/>';
    return '<svg viewBox="0 0 100 110" aria-hidden="true"><circle cx="50" cy="28" r="20" fill="#fde2c8" stroke="var(--line)" stroke-width="3"/>' + bodyShape + '</svg>';
  }

  // ---------- 画面の切り替えと放置タイマー ----------
  var idleTimer = null;
  function armIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(idle, IDLE_MS);
  }
  function stopIdleTimer() { clearTimeout(idleTimer); idleTimer = null; }
  document.addEventListener("pointerdown", function () { if (idleTimer) armIdle(); });
  document.addEventListener("keydown", function () { if (idleTimer) armIdle(); });

  function top() {
    var ev = currentEvent();
    return '<div class="top"><span>' + (ev ? esc(ev.club + "　" + ev.kind) : "") + "</span><span>" + (ev ? esc(jp(ev.date)) : "") + "</span></div>";
  }
  function screen(html, opts) {
    app.innerHTML = (opts && opts.noTop ? "" : top()) + html;
    window.scrollTo(0, 0);
    if (opts && opts.timer === false) stopIdleTimer(); else armIdle();
  }

  // ---------- ⓪ アイドリング ----------
  function idle() {
    if (!currentEvent()) return setup();
    var ev = currentEvent();
    stopIdleTimer();
    var w = window.innerWidth;
    app.innerHTML =
      '<div id="idle" role="button" aria-label="タップではじめる">' +
      '<div class="floor"></div>' +
      '<div class="title"><div class="club">' + esc(ev.club + "　" + ev.kind) + '</div><div class="tap">タップではじめる</div></div>' +
      '<div class="hero"><div class="bob">' + sittingCat("var(--cat1)", "blink") + "</div></div>" +
      '<div class="walker" style="bottom:12vh;animation-duration:22s">' + walkingCat("var(--cat2)") + "</div>" +
      '<div class="walker" style="bottom:3vh;animation-duration:31s;animation-delay:-12s">' + walkingCat("var(--cat3)") + "</div>" +
      '<div class="sleeper" style="left:' + (w < 600 ? 4 : 8) + 'vw;bottom:14vh">' + sleepingCat("var(--cat3)") +
      '<span class="zzz" style="left:120px;top:0">z</span><span class="zzz b" style="left:130px;top:-6px">Z</span><span class="zzz c" style="left:118px;top:-2px">z</span></div>' +
      '<div class="sitter" style="right:' + (w < 600 ? 4 : 10) + 'vw;bottom:13vh">' + sittingCat("var(--cat2)", "yawn") + "</div>" +
      "</div>" +
      '<button id="op" aria-label="運営メニュー（長押し）">運営（長押し）<span class="fill"></span></button>';
    document.getElementById("idle").addEventListener("click", q1);
    bindLongPress(document.getElementById("op"), function () { admin("list"); });
  }

  function bindLongPress(el, fn) {
    var t = null;
    function start(e) { e.preventDefault(); e.stopPropagation(); el.classList.add("holding"); t = setTimeout(function () { el.classList.remove("holding"); fn(); }, 1500); }
    function cancel() { clearTimeout(t); el.classList.remove("holding"); }
    el.addEventListener("pointerdown", start);
    el.addEventListener("pointerup", cancel);
    el.addEventListener("pointerleave", cancel);
    el.addEventListener("click", function (e) { e.stopPropagation(); });
    el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }

  // ---------- 受付の流れ ----------
  var a = {}; // いま受付中の人の回答

  // ① 初めてきた？
  function q1() {
    a = {};
    screen(
      '<div class="q">ここに来たのは はじめて？</div>' +
      '<div class="btns two"><button class="tall primary" id="b-new">はい<br><span style="font-size:1.1rem;font-weight:500">はじめて</span></button>' +
      '<button class="tall" id="b-ret">来たこと<br>ある</button></div>' +
      '<div class="row"><button class="sub" id="b-back">もどる</button></div>'
    );
    on("b-new", function () { a.isNew = true; q2(); });
    on("b-ret", function () { a.isNew = false; if (!state.participants.length) return noOne(); q2(); });
    on("b-back", idle);
  }

  function noOne() {
    screen('<div class="q">まだ だれも登録されていないみたい</div><p class="hint">「はじめて」から進んでください。</p>' +
      '<div class="row"><button class="primary" id="b-ok">はじめてから進む</button></div>');
    on("b-ok", function () { a.isNew = true; q2(); });
  }

  // ② 挨拶と今日の気分
  function q2() {
    var moods = [["るんるん", "good"], ["ふつう", "mid"], ["ゆううつ…", "bad"]];
    screen(
      '<div class="q">' + esc(Core.greeting(new Date().getHours())) + "！<br>今日の気分は…？</div>" +
      '<div class="btns">' + moods.map(function (m, i) { return '<button class="mood" data-i="' + i + '">' + face(m[1]) + "<span>" + m[0] + "</span></button>"; }).join("") + "</div>" +
      '<div class="row"><button class="sub" id="b-back">もどる</button></div>'
    );
    app.querySelectorAll("button[data-i]").forEach(function (b) {
      b.addEventListener("click", function () { a.mood = moods[Number(b.dataset.i)][0].replace("…", ""); if (a.isNew) q3new(); else q3ret(); });
    });
    on("b-back", q1);
  }

  // ③ お名前（はじめて）
  function q3new(msg) {
    screen(
      '<div class="q">お名前を教えてください</div><p class="hint">ニックネームでもいいです。</p>' +
      (msg ? '<div class="msg">' + esc(msg) + "</div>" : "") +
      '<input id="f-name" maxlength="20" autocomplete="off" value="' + esc(a.name || "") + '" aria-label="お名前">' +
      '<div class="row"><button class="sub" id="b-back">もどる</button><button class="primary" id="b-next">つぎへ</button></div>'
    );
    var el = document.getElementById("f-name");
    setTimeout(function () { el.focus(); }, 50);
    el.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.isComposing) next(); });
    function next() { var n = val("f-name"); if (!n) return q3new("お名前を入れてください。"); a.name = n; q4(); }
    on("b-next", next);
    on("b-back", q2);
  }

  // ③ お名前（来たことある）: 登録済みの名前から選ぶ
  function q3ret() {
    var list = Core.nameList(state);
    screen(
      '<div class="q">あなたのお名前を えらんでね</div>' +
      '<div class="names">' + list.map(function (x) { return '<button data-id="' + esc(x.id) + '">' + esc(x.label) + "</button>"; }).join("") + "</div>" +
      '<p class="hint" style="margin-top:12px">見つからないときは、運営の人に声をかけてください。</p>' +
      '<div class="row"><button class="sub" id="b-back">もどる</button></div>'
    );
    app.querySelectorAll("button[data-id]").forEach(function (b) {
      b.addEventListener("click", function () { a.id = b.dataset.id; q5(); });
    });
    on("b-back", q2);
  }

  // ④ あなたについて（性別）
  function q4() {
    screen(
      '<div class="q">あなたについて 教えてね</div>' +
      '<div class="btns two"><button class="tall" data-g="女">' + person("女") + "女</button>" +
      '<button class="tall" data-g="男">' + person("男") + "男</button></div>" +
      '<div class="row"><button class="sub" id="b-back">もどる</button><button class="sub" id="b-skip">こたえない</button></div>'
    );
    app.querySelectorAll("button[data-g]").forEach(function (b) {
      b.addEventListener("click", function () { a.gender = b.dataset.g; q5(); });
    });
    on("b-skip", function () { a.gender = ""; q5(); });
    on("b-back", function () { q3new(); });
  }

  // ⑤ 豆知識
  function q5() {
    var t = Core.trivia(Math.floor(Math.random() * Core.TRIVIA.length));
    screen(
      '<div class="q center">ネコの豆知識</div>' +
      '<div class="center" style="width:150px;margin:0 auto">' + sittingCat("var(--cat1)", "blink") + "</div>" +
      '<div class="trivia">' + esc(t) + "</div>" +
      '<div class="row"><button class="sub" id="b-back">もどる</button><button class="primary" id="b-next">すすむ</button></div>'
    );
    on("b-next", function () { if (a.isNew) q6(); else finish(); });
    on("b-back", function () { if (a.isNew) q4(); else q3ret(); });
  }

  // ⑥ 生年月日（はじめての人だけ）
  function q6(msg) {
    function opts(from, to, sel) { var h = '<option value="">－</option>'; for (var i = from; i <= to; i++) h += "<option" + (String(sel) === String(i) ? " selected" : "") + ">" + i + "</option>"; return h; }
    var b = a.birthParts || {};
    screen(
      '<div class="q">さいごの質問だよ！<br>生年月日を教えてね</div>' +
      (msg ? '<div class="msg">' + esc(msg) + "</div>" : "") +
      '<div class="birth">昭和<select id="f-y" aria-label="昭和 何年">' + opts(1, 64, b.y) + "</select>年" +
      '<select id="f-m" aria-label="何月">' + opts(1, 12, b.m) + "</select>月" +
      '<select id="f-d" aria-label="何日">' + opts(1, 31, b.d) + "</select>日</div>" +
      '<div class="row"><button class="sub" id="b-back">もどる</button><button class="sub" id="b-skip">こたえない</button><button class="primary" id="b-next">おわる</button></div>'
    );
    on("b-next", function () {
      a.birthParts = { y: val("f-y"), m: val("f-m"), d: val("f-d") };
      var iso = Core.showaToISO(a.birthParts.y, a.birthParts.m, a.birthParts.d);
      if (!iso) return q6("日付をもう一度えらんでください。");
      a.birth = iso;
      finish();
    });
    on("b-skip", function () { a.birth = ""; finish(); });
    on("b-back", q5);
  }

  function finish() {
    var already = false;
    if (a.isNew) {
      commit(Core.register(state, { name: a.name, gender: a.gender, birth: a.birth, mood: a.mood }, now()).state);
    } else {
      var r = Core.checkIn(state, a.id, a.mood, now());
      if (r.ok) { commit(r.state); already = r.already; }
    }
    bye(already);
  }

  // ⑦ また会いにきてね
  function bye(already) {
    screen(
      '<div class="bye"><div class="bubble">また会いにきてね</div>' +
      '<div class="jump">' + sittingCat("var(--cat1)", "wave") + "</div>" +
      (already ? '<p class="hint">今日の受付は もう済んでいます</p>' : '<p class="hint">受付できました</p>') + "</div>" +
      '<div class="row"><button class="primary" id="b-end">おわる</button></div>', { timer: false }
    );
    var t = setTimeout(idle, 8000);
    on("b-end", function () { clearTimeout(t); idle(); });
  }

  // ---------- 運営: 最初の設定（老人会と会の種類） ----------
  function setup(fromAdmin) {
    stopIdleTimer();
    var ev = currentEvent();
    var kinds = settings.kinds || [];
    app.innerHTML =
      '<div class="admin"><h1>受付をはじめる（運営の方）</h1>' +
      '<p class="hint">老人会の名前と、今日の会の種類を入れてください。</p>' +
      '<label for="f-club">老人会の名前</label><input id="f-club" placeholder="例: みゆき会" value="' + esc((ev && ev.club) || settings.club || "") + '">' +
      '<label for="f-kind">何の会ですか</label><input id="f-kind" placeholder="例: 朝ご飯会">' +
      '<div class="chips">' + kinds.map(function (k) { return '<button data-kind="' + esc(k) + '">' + esc(k) + "</button>"; }).join("") + "</div>" +
      '<label for="f-date">日付</label><input id="f-date" type="date" value="' + today() + '">' +
      '<div id="setup-msg"></div>' +
      '<div class="row"><button class="primary" id="b-start">この会で受付をはじめる</button></div>' +
      (fromAdmin ? '<div class="row" style="padding-top:12px"><button id="b-cancel">もどる</button></div>' : "") +
      '<p class="note">試作版: データはこの端末のブラウザの中だけに保存されます。名前・性別・生年月日を記録します。</p></div>';
    app.querySelectorAll("button[data-kind]").forEach(function (b) {
      b.addEventListener("click", function () { document.getElementById("f-kind").value = b.dataset.kind; });
    });
    on("b-start", function () {
      var club = val("f-club"), kind = val("f-kind");
      if (!club || !kind) { document.getElementById("setup-msg").innerHTML = '<div class="msg">老人会の名前と会の種類を入れてください。</div>'; return; }
      settings.club = club;
      if (settings.kinds.indexOf(kind) < 0) settings.kinds = settings.kinds.concat([kind]);
      save(SETTINGS_KEY, settings);
      commit(Core.startEvent(state, { club: club, kind: kind, date: val("f-date") || today() }, now()).state);
      idle();
    });
    on("b-cancel", function () { admin("list"); });
  }

  // ---------- 運営メニュー ----------
  function admin(tab) {
    stopIdleTimer();
    var tabs = [["list", "出席と集計"], ["data", "データ"]];
    var body = { list: adminList, data: adminData }[tab]();
    app.innerHTML = '<div class="admin"><h1>運営メニュー</h1><div class="tabs">' +
      tabs.map(function (t) { return '<button data-tab="' + t[0] + '" aria-pressed="' + (t[0] === tab) + '">' + t[1] + "</button>"; }).join("") +
      '<button id="b-setup">会を変える</button></div>' + body.html +
      '<div class="row"><button class="primary" id="b-home">受付にもどる</button></div></div>';
    app.querySelectorAll("button[data-tab]").forEach(function (b) { b.addEventListener("click", function () { admin(b.dataset.tab); }); });
    on("b-setup", function () { setup(true); });
    on("b-home", idle);
    if (body.bind) body.bind();
  }

  function kvLine(title, map) {
    var keys = Object.keys(map);
    return "<p><b>" + esc(title) + "</b>: " + (keys.length ? keys.map(function (k) { return esc(k) + " " + map[k] + "人"; }).join(" / ") : "—") + "</p>";
  }

  function adminList() {
    var ev = currentEvent();
    if (!ev) return { html: '<div class="msg">会が設定されていません。</div>' };
    var sum = Core.summarize(state, ev.id);
    var byId = {};
    state.participants.forEach(function (p) { byId[p.id] = p; });
    var rows = state.attendance.filter(function (x) { return x.eventId === ev.id; });
    return {
      html: "<h2>" + esc(jp(ev.date) + " " + ev.club + " " + ev.kind) + "</h2>" +
        '<div class="stats"><div class="stat"><b>' + sum.total + '</b><span>参加人数</span></div><div class="stat"><b>' + sum.newCount + '</b><span>はじめて</span></div><div class="stat"><b>' + sum.repeatCount + "</b><span>2回目以上</span></div></div>" +
        kvLine("気分", sum.byMood) + kvLine("性別", sum.byGender) +
        '<div class="tw"><table><thead><tr><th>番号</th><th>お名前</th><th>性別</th><th>生年月日</th><th>気分</th><th>時刻</th></tr></thead><tbody>' +
        rows.map(function (x) {
          var p = byId[x.participantId] || {};
          var t = new Date(x.at);
          return "<tr><td>" + esc(x.participantId) + "</td><td>" + esc(p.name) + "</td><td>" + esc(p.gender || "—") + "</td><td>" + esc(p.birth || "—") + "</td><td>" + esc(x.mood || "—") + "</td><td>" +
            String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0") + "</td></tr>";
        }).join("") + "</tbody></table></div>"
    };
  }

  function download(name, text) {
    var blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
    var el = document.createElement("a");
    el.href = URL.createObjectURL(blob); el.download = name; document.body.appendChild(el); el.click();
    setTimeout(function () { URL.revokeObjectURL(el.href); el.remove(); }, 500);
  }

  function adminData() {
    return {
      html: "<p>このデータは、この端末のブラウザの中だけにあります。端末ごとに別々のデータになります。</p>" +
        '<div class="btns"><button id="d-p">参加者のCSVを保存</button><button id="d-a">出席のCSVを保存</button><button id="d-e">開催のCSVを保存</button></div>' +
        '<h2>データをすべて消す</h2><p class="hint">元に戻せません。消す場合は下の欄に「けす」と入力してください。</p>' +
        '<input id="f-wipe" placeholder="けす"><div class="row"><button id="d-wipe">すべて消す</button></div><div id="wipe-msg"></div>',
      bind: function () {
        on("d-p", function () { download("neko-participants.csv", Core.toCSV(state.participants, ["id", "name", "gender", "birth", "createdAt"])); });
        on("d-a", function () { download("neko-attendance.csv", Core.toCSV(state.attendance, ["eventId", "participantId", "mood", "at"])); });
        on("d-e", function () { download("neko-events.csv", Core.toCSV(state.events, ["id", "date", "club", "kind", "createdAt"])); });
        on("d-wipe", function () {
          if (val("f-wipe") !== "けす") { document.getElementById("wipe-msg").innerHTML = '<div class="msg">「けす」と入力すると消せます。</div>'; return; }
          commit(Core.emptyState()); setup();
        });
      }
    };
  }

  idle();
})();
