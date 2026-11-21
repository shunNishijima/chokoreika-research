// 受付の画面。データはこの端末のブラウザ（localStorage）にだけ保存する（試作）。
(function () {
  "use strict";
  var KEY = "choko-reception-v1";
  var SETTINGS_KEY = "choko-reception-settings-v1";
  var app = document.getElementById("app");

  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }

  var state = load(KEY, Core.emptyState());
  var settings = load(SETTINGS_KEY, { towns: [], clubs: ["みゆき会"] });
  function commit(s) { state = s; save(KEY, state); }
  function now() { return new Date().toISOString(); }
  function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function currentEvent() { return state.events.filter(function (e) { return e.id === state.currentEventId; })[0] || null; }
  function jp(dateStr) { if (!dateStr) return ""; var p = dateStr.split("-"); return Number(p[1]) + "月" + Number(p[2]) + "日"; }

  var scanner = null;
  function stopScanner() { if (scanner) { try { scanner.stop().catch(function () {}); } catch (e) {} scanner = null; } }

  function header() {
    var ev = currentEvent();
    return '<div class="top"><span class="ev">' + (ev ? esc(jp(ev.date) + " " + ev.kind + (ev.place ? "（" + ev.place + "）" : "")) : "今日の会：未設定") + '</span></div>';
  }

  function render(html) { stopScanner(); app.innerHTML = header() + html; window.scrollTo(0, 0); }
  function on(id, fn) { var el = document.getElementById(id); if (el) el.addEventListener("click", fn); }

  // ---------- ホーム ----------
  function home() {
    var ev = currentEvent();
    render(
      '<h1>受付</h1>' +
      (ev ? "" : '<div class="msg warn">今日の会がまだ設定されていません。運営の方は「運営メニュー」から設定してください。</div>') +
      '<div class="btns">' +
      '<button class="big primary" id="b-new">はじめての方</button>' +
      '<button class="big" id="b-ret">2回目からの方<br><span style="font-size:1rem;font-weight:500">（カードをお持ちの方）</span></button>' +
      '</div>' +
      '<div class="row"><button class="small" id="b-admin">運営メニュー</button></div>' +
      '<p class="note">試作版: データはこの端末のブラウザの中だけに保存されます。氏名や住所は記録しません。</p>'
    );
    on("b-new", function () { if (!currentEvent()) return home(); startNew(); });
    on("b-ret", function () { if (!currentEvent()) return home(); returning(""); });
    on("b-admin", function () { admin("event"); });
  }

  // ---------- はじめての方 ----------
  var answers = {};
  function questions() {
    var towns = settings.towns.length ? settings.towns.concat(["それ以外の町"]) : [];
    return [
      { key: "consent", q: "受付の記録をとってもよいですか？", hint: "年代や住んでいる町などを、会をよくするために使います。お名前は記録しません。", opts: ["はい", "いいえ"] },
      { key: "ageGroup", q: "年代を教えてください", opts: ["60代", "70代", "80代", "90代以上", "学生", "その他"] },
      { key: "gender", q: "性別を教えてください", opts: ["男性", "女性", "答えない"] },
      { key: "town", q: "お住まいの町はどちらですか？", opts: towns, emptyMsg: "町名が登録されていません（運営メニューの「設定」で登録できます）" },
      { key: "club", q: "老人会に入っていますか？", opts: settings.clubs.concat(["ほかの老人会", "入っていない"]) },
      { key: "trigger", q: "今日は何がきっかけで来ましたか？", opts: ["チラシ", "知り合いに誘われた", "老人会の声かけ", "その他"] },
      { key: "livingAlone", q: "一人で暮らしていますか？", hint: "答えたくなければ「とばす」を押してください。", opts: ["はい", "いいえ", "答えない"], optional: true },
      { key: "mobility", q: "今日はどうやって来ましたか？", hint: "答えたくなければ「とばす」を押してください。", opts: ["歩いて", "杖をついて", "手押し車", "車いす", "送迎", "その他"], optional: true }
    ];
  }
  function startNew() { answers = {}; ask(0); }
  function ask(i) {
    var qs = questions();
    if (answers.consent === "いいえ" && i > 0) return finishNew();
    if (i >= qs.length) return finishNew();
    var q = qs[i];
    var opts = q.opts.map(function (o, k) { return '<button class="' + (answers[q.key] === o ? "primary" : "") + '" data-k="' + k + '">' + esc(o) + "</button>"; }).join("");
    render(
      '<div class="progress">はじめての方　' + (i + 1) + " / " + qs.length + "</div>" +
      '<div class="q">' + esc(q.q) + "</div>" + (q.hint ? '<p class="hint">' + esc(q.hint) + "</p>" : "") +
      (q.opts.length ? '<div class="btns' + (q.opts.length > 3 ? " two" : "") + '">' + opts + "</div>" : '<div class="msg warn">' + esc(q.emptyMsg || "") + "</div>") +
      '<div class="row"><button id="b-back">戻る</button>' + (q.optional || !q.opts.length ? '<button id="b-skip">とばす</button>' : "") + "</div>"
    );
    app.querySelectorAll("button[data-k]").forEach(function (b) {
      b.addEventListener("click", function () { answers[q.key] = q.opts[Number(b.dataset.k)]; ask(i + 1); });
    });
    on("b-back", function () { if (i === 0) home(); else ask(answers.consent === "いいえ" ? 0 : i - 1); });
    on("b-skip", function () { delete answers[q.key]; ask(i + 1); });
  }
  function finishNew() {
    var r = Core.register(state, answers, now());
    commit(r.state);
    doneScreen(r.id, true);
  }

  function doneScreen(id, isNew, already) {
    var ev = currentEvent();
    render(
      '<div class="done"><div class="mark">✓</div><h1>' + (already ? "受付はもう済んでいます" : "受付しました") + "</h1>" +
      (isNew ? "<p>あなたの番号です</p>" : "") + '<div class="num">' + esc(id) + "</div></div>" +
      (isNew ? '<div class="card"><div class="t">朝ご飯会 参加カード</div><div id="qr"></div><div class="num" style="font-size:2rem">' + esc(id) + '</div>' +
        '<div class="next">次回　' + (ev && ev.nextDate ? esc(jp(ev.nextDate)) : "　　月　　日") + "</div></div>" +
        '<p class="hint" style="text-align:center">このカードを次回お持ちください。</p>' : "") +
      '<div class="row">' + (isNew ? '<button id="b-print">カードを印刷</button>' : "") + '<button class="primary" id="b-home">おわる</button></div>'
    );
    if (isNew && window.QRCode) { try { new QRCode(document.getElementById("qr"), { text: "CHOKO:" + id, width: 160, height: 160 }); } catch (e) {} }
    on("b-print", function () { window.print(); });
    on("b-home", home);
  }

  // ---------- 2回目からの方 ----------
  function returning(typed, msg) {
    var keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "消す", "0", "決定"];
    render(
      '<div class="q">カードの番号を押してください</div>' +
      (msg ? '<div class="msg warn">' + esc(msg) + "</div>" : "") +
      '<div class="display" aria-label="入力した番号">' + (esc(typed) || "&nbsp;") + "</div>" +
      '<div class="keypad">' + keys.map(function (k) { return '<button data-key="' + k + '"' + (k === "決定" ? ' class="primary"' : "") + ">" + k + "</button>"; }).join("") + "</div>" +
      '<div class="row"><button id="b-scan">カードのQRを読む（カメラ）</button></div>' +
      '<div id="reader"></div>' +
      '<div class="row"><button id="b-back">戻る</button></div>'
    );
    app.querySelectorAll("button[data-key]").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.dataset.key;
        if (k === "消す") return returning(typed.slice(0, -1));
        if (k === "決定") return submitId(typed);
        if (typed.length < 4) returning(typed + k);
      });
    });
    on("b-back", home);
    on("b-scan", function () {
      if (!window.Html5Qrcode) return returning(typed, "この端末ではカメラが使えません。番号を押してください。");
      scanner = new Html5Qrcode("reader");
      scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 220 }, function (text) {
        var m = /^CHOKO:(\d{4})$/.exec(text);
        if (m) submitId(m[1]);
      }).catch(function () { returning(typed, "カメラを使えませんでした。番号を押してください。"); });
    });
  }
  function submitId(typed) {
    if (!typed) return returning("", "番号を押してください。");
    var id = String(typed).padStart(4, "0");
    var r = Core.checkIn(state, id, now());
    if (!r.ok) return returning("", r.reason === "unknown" ? "その番号は見つかりませんでした。運営の人に声をかけてください。" : "今日の会が設定されていません。");
    commit(r.state);
    doneScreen(id, false, r.already);
  }

  // ---------- 運営メニュー ----------
  function admin(tab) {
    var tabs = [["event", "今日の会"], ["list", "出席と集計"], ["settings", "設定"], ["data", "データ"]];
    var body = { event: adminEvent, list: adminList, settings: adminSettings, data: adminData }[tab]();
    render('<h1>運営メニュー</h1><div class="tabs">' + tabs.map(function (t) { return '<button data-tab="' + t[0] + '" aria-pressed="' + (t[0] === tab) + '">' + t[1] + "</button>"; }).join("") + "</div>" + body.html +
      '<div class="row"><button class="primary" id="b-home">受付画面に戻る</button></div>');
    app.querySelectorAll("button[data-tab]").forEach(function (b) { b.addEventListener("click", function () { admin(b.dataset.tab); }); });
    on("b-home", home);
    if (body.bind) body.bind();
  }

  function adminEvent() {
    var ev = currentEvent();
    var kinds = ["朝ご飯会", "映画会", "ご飯会", "その他"];
    var hosts = settings.clubs.concat(["その他"]);
    return {
      html: (ev ? '<div class="msg ok">設定中: ' + esc(jp(ev.date) + " " + ev.kind) + "</div>" : "") +
        "<h2>新しく会を始める</h2>" +
        '<label for="f-date">日付</label><input id="f-date" type="date" value="' + today() + '">' +
        '<label for="f-kind">種類</label><select id="f-kind">' + kinds.map(function (k) { return "<option>" + esc(k) + "</option>"; }).join("") + "</select>" +
        '<label for="f-place">会場</label><input id="f-place" placeholder="例: 集会所">' +
        '<label for="f-host">主催の老人会</label><select id="f-host">' + hosts.map(function (k) { return "<option>" + esc(k) + "</option>"; }).join("") + "</select>" +
        '<label for="f-next">次回の日付（参加カードに印刷されます）</label><input id="f-next" type="date">' +
        '<div class="row"><button class="primary" id="b-start">この会で受付を始める</button></div>',
      bind: function () {
        on("b-start", function () {
          var r = Core.startEvent(state, { date: val("f-date"), kind: val("f-kind"), place: val("f-place"), host: val("f-host") }, now());
          var s = r.state;
          s.events[s.events.length - 1].nextDate = val("f-next");
          commit(s);
          home();
        });
      }
    };
  }
  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; }

  function kvLine(title, map) {
    var keys = Object.keys(map);
    return '<p class="kv"><b>' + esc(title) + "</b>: " + (keys.length ? keys.map(function (k) { return esc(k) + " " + map[k] + "人"; }).join(" / ") : "—") + "</p>";
  }

  function adminList() {
    var ev = currentEvent();
    if (!ev) return { html: '<div class="msg warn">今日の会が設定されていません。</div>' };
    var sum = Core.summarize(state, ev.id);
    var byId = {};
    state.participants.forEach(function (p) { byId[p.id] = p; });
    var rows = state.attendance.filter(function (a) { return a.eventId === ev.id; });
    var roles = ["参加", "準備を手伝った", "担当"];
    return {
      html: "<h2>" + esc(jp(ev.date) + " " + ev.kind) + " の集計</h2>" +
        '<div class="stats"><div class="stat"><b>' + sum.total + '</b><span>参加人数</span></div><div class="stat"><b>' + sum.newCount + '</b><span>はじめて</span></div><div class="stat"><b>' + sum.repeatCount + '</b><span>2回目以上</span></div><div class="stat"><b>' + sum.helpers + '</b><span>準備・担当</span></div></div>' +
        kvLine("性別", sum.byGender) + kvLine("年代", sum.byAge) + kvLine("町", sum.byTown) + kvLine("老人会", sum.byClub) + kvLine("きっかけ", sum.byTrigger) +
        (sum.noConsent ? '<p class="kv">記録に同意しなかった人: ' + sum.noConsent + "人（人数のみ）</p>" : "") +
        "<h2>出席した人</h2>" +
        '<div class="tw"><table><thead><tr><th>番号</th><th>年代</th><th>性別</th><th>役割</th></tr></thead><tbody>' +
        rows.map(function (a) {
          var p = byId[a.participantId] || {};
          return "<tr><td>" + esc(a.participantId) + "</td><td>" + esc(p.ageGroup || "—") + "</td><td>" + esc(p.gender || "—") + '</td><td><select data-pid="' + esc(a.participantId) + '">' +
            roles.map(function (r) { return "<option" + (a.role === r ? " selected" : "") + ">" + r + "</option>"; }).join("") + "</select></td></tr>";
        }).join("") + "</tbody></table></div>",
      bind: function () {
        app.querySelectorAll("select[data-pid]").forEach(function (sel) {
          sel.addEventListener("change", function () { commit(Core.setRole(state, ev.id, sel.dataset.pid, sel.value)); admin("list"); });
        });
      }
    };
  }

  function adminSettings() {
    return {
      html: '<label for="f-towns">町名（1行に1つ）</label><textarea id="f-towns">' + esc(settings.towns.join("\n")) + "</textarea>" +
        '<label for="f-clubs">老人会の名前（1行に1つ）</label><textarea id="f-clubs">' + esc(settings.clubs.join("\n")) + "</textarea>" +
        '<div class="row"><button class="primary" id="b-save">保存する</button></div>',
      bind: function () {
        on("b-save", function () {
          function lines(id) { return val(id).split("\n").map(function (x) { return x.trim(); }).filter(Boolean); }
          settings = { towns: lines("f-towns"), clubs: lines("f-clubs") };
          save(SETTINGS_KEY, settings);
          admin("settings");
        });
      }
    };
  }

  function download(name, text) {
    var blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function adminData() {
    return {
      html: "<p>このデータは、この端末のブラウザの中だけにあります。端末ごとに別々のデータになります。</p>" +
        '<div class="btns"><button id="d-p">参加者のCSVを保存</button><button id="d-a">出席のCSVを保存</button><button id="d-e">開催のCSVを保存</button></div>' +
        "<h2>データをすべて消す</h2><p class=\"hint\">元に戻せません。消す場合は下の欄に「けす」と入力してください。</p>" +
        '<input id="f-wipe" placeholder="けす"><div class="row"><button id="d-wipe">すべて消す</button></div><div id="wipe-msg"></div>',
      bind: function () {
        on("d-p", function () { download("participants.csv", Core.toCSV(state.participants, ["id", "consent", "ageGroup", "gender", "town", "club", "trigger", "livingAlone", "mobility", "createdAt"])); });
        on("d-a", function () { download("attendance.csv", Core.toCSV(state.attendance, ["eventId", "participantId", "role", "at"])); });
        on("d-e", function () { download("events.csv", Core.toCSV(state.events, ["id", "date", "kind", "place", "host", "nextDate", "createdAt"])); });
        on("d-wipe", function () {
          if (val("f-wipe") !== "けす") { document.getElementById("wipe-msg").innerHTML = '<div class="msg warn">「けす」と入力すると消せます。</div>'; return; }
          commit(Core.emptyState()); admin("data");
        });
      }
    };
  }

  home();
})();
