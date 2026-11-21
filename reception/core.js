// 受付の計算部分（純粋関数のみ）。画面（app.js）と保存先（localStorage）には依存しない。
(function (root) {
  "use strict";

  var ATTR_KEYS = ["ageGroup", "gender", "town", "club", "trigger", "livingAlone", "mobility"];
  var HELPER_ROLES = ["準備を手伝った", "担当"];

  function emptyState() {
    return { participants: [], events: [], attendance: [], currentEventId: null };
  }

  function pad(n) { return String(n).padStart(4, "0"); }

  function startEvent(state, info, now) {
    var id = "e" + (state.events.length + 1);
    var ev = { id: id, date: info.date, kind: info.kind || "", place: info.place || "", host: info.host || "", createdAt: now };
    return { state: Object.assign({}, state, { events: state.events.concat([ev]), currentEventId: id }), id: id };
  }

  function addAttendance(state, participantId, now) {
    var rec = { eventId: state.currentEventId, participantId: participantId, role: "参加", at: now };
    return Object.assign({}, state, { attendance: state.attendance.concat([rec]) });
  }

  // 初めての人を登録し、今の回の出席も記録する。同意がなければ属性は保存しない。
  function register(state, attrs, now) {
    var id = pad(state.participants.length + 1);
    var p = { id: id, consent: attrs.consent === "はい" ? "はい" : "いいえ", createdAt: now };
    if (p.consent === "はい") {
      ATTR_KEYS.forEach(function (k) { if (attrs[k] !== undefined) p[k] = attrs[k]; });
    }
    var s = Object.assign({}, state, { participants: state.participants.concat([p]) });
    if (s.currentEventId) s = addAttendance(s, id, now);
    return { state: s, id: id };
  }

  function checkIn(state, participantId, now) {
    if (!state.currentEventId) return { ok: false, reason: "no-event", state: state };
    var known = state.participants.some(function (p) { return p.id === participantId; });
    if (!known) return { ok: false, reason: "unknown", state: state };
    var dup = state.attendance.some(function (a) { return a.eventId === state.currentEventId && a.participantId === participantId; });
    if (dup) return { ok: true, already: true, state: state };
    return { ok: true, already: false, state: addAttendance(state, participantId, now) };
  }

  function setRole(state, eventId, participantId, role) {
    return Object.assign({}, state, {
      attendance: state.attendance.map(function (a) {
        return a.eventId === eventId && a.participantId === participantId ? Object.assign({}, a, { role: role }) : a;
      })
    });
  }

  function eventIndex(state, eventId) {
    for (var i = 0; i < state.events.length; i++) if (state.events[i].id === eventId) return i;
    return -1;
  }

  function count(map, key) { if (key) map[key] = (map[key] || 0) + 1; }

  // その回の集計。新規＝その回より前の回に出席がない人。
  function summarize(state, eventId) {
    var idx = eventIndex(state, eventId);
    var earlier = {};
    state.events.slice(0, Math.max(idx, 0)).forEach(function (e) { earlier[e.id] = true; });
    var rows = state.attendance.filter(function (a) { return a.eventId === eventId; });
    var byId = {};
    state.participants.forEach(function (p) { byId[p.id] = p; });
    var sum = { total: rows.length, newCount: 0, repeatCount: 0, byGender: {}, byAge: {}, byTown: {}, byClub: {}, byTrigger: {}, noConsent: 0, helpers: 0 };
    rows.forEach(function (a) {
      var came = state.attendance.some(function (b) { return b.participantId === a.participantId && earlier[b.eventId]; });
      if (came) sum.repeatCount++; else sum.newCount++;
      if (HELPER_ROLES.indexOf(a.role) >= 0) sum.helpers++;
      var p = byId[a.participantId] || {};
      if (p.consent !== "はい") { sum.noConsent++; return; }
      count(sum.byGender, p.gender);
      count(sum.byAge, p.ageGroup);
      count(sum.byTown, p.town);
      count(sum.byClub, p.club);
      count(sum.byTrigger, p.trigger);
    });
    return sum;
  }

  function csvCell(v) {
    var s = v === undefined || v === null ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(rows, columns) {
    return [columns.join(",")].concat(rows.map(function (r) {
      return columns.map(function (c) { return csvCell(r[c]); }).join(",");
    })).join("\n");
  }

  var api = { emptyState: emptyState, startEvent: startEvent, register: register, checkIn: checkIn, setRole: setRole, summarize: summarize, toCSV: toCSV, HELPER_ROLES: HELPER_ROLES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Core = api;
})(this);
