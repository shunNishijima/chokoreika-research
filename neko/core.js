// ネコ受付（パターン2）の計算部分（純粋関数のみ）。画面（app.js）と保存先（localStorage）には依存しない。
(function (root) {
  "use strict";

  // 内容は運営の方が確認して差し替えてよい（出典を確認したものだけを置く）。
  var TRIVIA = [
    "ネコは とてもよく眠る動物です。\n「寝る子」が「ねこ」の名前の由来、という説もあります。",
    "ネコは 甘い味を ほとんど感じないと 言われています。",
    "ネコの肉球は 汗をかきます。\n緊張すると しっとりするそうです。",
    "招き猫は、右手を上げているとお金を、\n左手を上げていると人を招く、と言われています。",
    "ネコのひげは、せまい所を通れるか\nたしかめるのに 役立っていると言われています。",
    "ネコがのどを「ゴロゴロ」鳴らすのは、\n安心しているときが 多いそうです。"
  ];

  function emptyState() {
    return { participants: [], events: [], attendance: [], currentEventId: null };
  }

  function pad(n) { return String(n).padStart(4, "0"); }

  function greeting(hour) {
    if (hour >= 5 && hour < 11) return "おはようございます";
    if (hour >= 11 && hour < 18) return "こんにちは";
    return "こんばんは";
  }

  // 昭和元年 = 1926年（12月25日から）、昭和64年は1月7日まで。存在しない日付は null。
  function showaToISO(year, month, day) {
    year = Number(year); month = Number(month); day = Number(day);
    if (!(year >= 1 && year <= 64 && month >= 1 && month <= 12 && day >= 1)) return null;
    var y = 1925 + year;
    var d = new Date(Date.UTC(y, month - 1, day));
    if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
    if (year === 1 && (month < 12 || day < 25)) return null;
    if (year === 64 && (month > 1 || day > 7)) return null;
    return y + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
  }

  function startEvent(state, info, now) {
    var id = "e" + (state.events.length + 1);
    var ev = { id: id, club: info.club || "", kind: info.kind || "", date: info.date || "", createdAt: now };
    return { state: Object.assign({}, state, { events: state.events.concat([ev]), currentEventId: id }), id: id };
  }

  function addAttendance(state, participantId, mood, now) {
    var rec = { eventId: state.currentEventId, participantId: participantId, mood: mood || "", at: now };
    return Object.assign({}, state, { attendance: state.attendance.concat([rec]) });
  }

  function register(state, info, now) {
    var id = pad(state.participants.length + 1);
    var p = { id: id, name: info.name || "", gender: info.gender || "", birth: info.birth || "", createdAt: now };
    var s = Object.assign({}, state, { participants: state.participants.concat([p]) });
    if (s.currentEventId) s = addAttendance(s, id, info.mood, now);
    return { state: s, id: id };
  }

  function checkIn(state, participantId, mood, now) {
    if (!state.currentEventId) return { ok: false, reason: "no-event", state: state };
    var known = state.participants.some(function (p) { return p.id === participantId; });
    if (!known) return { ok: false, reason: "unknown", state: state };
    var dup = state.attendance.some(function (a) { return a.eventId === state.currentEventId && a.participantId === participantId; });
    if (dup) return { ok: true, already: true, state: state };
    return { ok: true, already: false, state: addAttendance(state, participantId, mood, now) };
  }

  function showaYearOf(iso) {
    var y = iso ? Number(iso.slice(0, 4)) : NaN;
    return y >= 1926 && y <= 1989 ? y - 1925 : null;
  }

  // 名前を選ぶ画面の一覧。同じ名前が複数あるときだけ性別・生まれ年を添える。
  function nameList(state) {
    var counts = {};
    state.participants.forEach(function (p) { counts[p.name] = (counts[p.name] || 0) + 1; });
    return state.participants.map(function (p) {
      var label = p.name;
      if (counts[p.name] > 1) {
        var extra = [];
        if (p.gender) extra.push(p.gender);
        var sy = showaYearOf(p.birth);
        if (sy) extra.push("昭和" + sy + "年生");
        else if (p.birth) extra.push(p.birth.slice(0, 4) + "年生");
        if (!extra.length) extra.push("番号" + p.id);
        label += "（" + extra.join("・") + "）";
      }
      return { id: p.id, label: label };
    }).sort(function (a, b) { return a.label < b.label ? -1 : a.label > b.label ? 1 : 0; });
  }

  function count(map, key) { if (key) map[key] = (map[key] || 0) + 1; }

  // その回の集計。はじめて＝その回より前の回に出席がない人。
  function summarize(state, eventId) {
    var idx = -1;
    state.events.forEach(function (e, i) { if (e.id === eventId) idx = i; });
    var earlier = {};
    state.events.slice(0, Math.max(idx, 0)).forEach(function (e) { earlier[e.id] = true; });
    var byId = {};
    state.participants.forEach(function (p) { byId[p.id] = p; });
    var rows = state.attendance.filter(function (a) { return a.eventId === eventId; });
    var sum = { total: rows.length, newCount: 0, repeatCount: 0, byMood: {}, byGender: {} };
    rows.forEach(function (a) {
      var came = state.attendance.some(function (b) { return b.participantId === a.participantId && earlier[b.eventId]; });
      if (came) sum.repeatCount++; else sum.newCount++;
      count(sum.byMood, a.mood);
      count(sum.byGender, (byId[a.participantId] || {}).gender);
    });
    return sum;
  }

  function trivia(i) { return TRIVIA[Math.abs(Math.floor(i)) % TRIVIA.length]; }

  function csvCell(v) {
    var s = v === undefined || v === null ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(rows, columns) {
    return [columns.join(",")].concat(rows.map(function (r) {
      return columns.map(function (c) { return csvCell(r[c]); }).join(",");
    })).join("\n");
  }

  var api = {
    TRIVIA: TRIVIA, emptyState: emptyState, greeting: greeting, showaToISO: showaToISO, startEvent: startEvent,
    register: register, checkIn: checkIn, nameList: nameList, summarize: summarize, trivia: trivia, toCSV: toCSV
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Core = api;
})(this);
