// 集計の計算（純粋関数）。DB や HTTP には依存しない。

export type Participant = {
  id: number; code: string; consent: boolean;
  ageGroup: string | null; gender: string | null; town: string | null; club: string | null;
  trigger: string | null; livingAlone: string | null; mobility: string | null;
};
export type EventRow = { id: number; date: string; kind: string };
export type Attendance = { eventId: number; participantId: number; role: string };
export type Dataset = { events: EventRow[]; participants: Participant[]; attendances: Attendance[] };
export type Range = { from?: string; to?: string; kind?: string; suppressBelow?: number };

export const HELPER_ROLES = ["準備を手伝った", "担当"];
export const NON_MEMBER = "入っていない";
const UNKNOWN = "不明";

export function nextCode(maxCode: string | null): string {
  const n = maxCode ? parseInt(maxCode, 10) : 0;
  return String(n + 1).padStart(4, "0");
}

type Cell = { visits: number; uniques: number; newcomers: number; helpers: number; avgVisits: number };
type Hidden<T> = { [K in keyof T]: T[K] | null } & { suppressed: boolean };

function hide<T extends Cell>(c: T, n: number, below?: number): Hidden<T> {
  if (below && n < below) {
    const out = { ...c, suppressed: true } as Record<string, unknown>;
    for (const k of ["visits", "uniques", "newcomers", "helpers", "avgVisits"]) out[k] = null;
    return out as Hidden<T>;
  }
  return { ...c, suppressed: false } as Hidden<T>;
}

function cellOf(rows: { participantId: number; role: string; isNew: boolean }[]): Cell {
  const ids = new Set(rows.map((r) => r.participantId));
  const helpers = new Set(rows.filter((r) => HELPER_ROLES.includes(r.role)).map((r) => r.participantId));
  const newcomers = new Set(rows.filter((r) => r.isNew).map((r) => r.participantId));
  return {
    visits: rows.length,
    uniques: ids.size,
    newcomers: newcomers.size,
    helpers: helpers.size,
    avgVisits: ids.size ? Math.round((rows.length / ids.size) * 100) / 100 : 0,
  };
}

export function buildDashboard(data: Dataset, range: Range) {
  const evById = new Map(data.events.map((e) => [e.id, e]));
  const pById = new Map(data.participants.map((p) => [p.id, p]));
  const inRange = (e: EventRow) =>
    (!range.from || e.date >= range.from) && (!range.to || e.date <= range.to) && (!range.kind || e.kind === range.kind);

  // 新規判定は全期間の履歴で行う（初めて来た開催）
  const firstDate = new Map<number, string>();
  for (const a of data.attendances) {
    const e = evById.get(a.eventId);
    if (!e) continue;
    const prev = firstDate.get(a.participantId);
    if (!prev || e.date < prev) firstDate.set(a.participantId, e.date);
  }

  const rows = data.attendances
    .map((a) => ({ ...a, event: evById.get(a.eventId)! }))
    .filter((a) => a.event && inRange(a.event))
    .map((a) => ({ ...a, isNew: firstDate.get(a.participantId) === a.event.date, person: pById.get(a.participantId) }));

  const events = data.events.filter(inRange).sort((a, b) => a.date.localeCompare(b.date));
  const visitsBy = new Map<number, number>();
  for (const r of rows) visitsBy.set(r.participantId, (visitsBy.get(r.participantId) ?? 0) + 1);
  const ids = [...visitsBy.keys()];
  const consented = ids.map((id) => pById.get(id)).filter((p): p is Participant => !!p && p.consent);
  const ratio = (n: number, d: number) => (d ? n / d : 0);

  const kpis = {
    events: events.length,
    uniques: ids.length,
    visits: rows.length,
    newcomers: new Set(rows.filter((r) => r.isNew).map((r) => r.participantId)).size,
    repeatRate: ratio(ids.filter((id) => (visitsBy.get(id) ?? 0) >= 2).length, ids.length),
    helpers: new Set(rows.filter((r) => HELPER_ROLES.includes(r.role)).map((r) => r.participantId)).size,
    nonMemberRate: ratio(consented.filter((p) => p.club === NON_MEMBER).length, consented.length),
    livingAloneRate: ratio(consented.filter((p) => p.livingAlone === "はい").length, consented.filter((p) => p.livingAlone && p.livingAlone !== "答えない").length),
    assistedMobilityRate: ratio(consented.filter((p) => p.mobility && !["歩いて", "その他"].includes(p.mobility)).length, consented.filter((p) => p.mobility).length),
  };

  const series = events.map((e) => {
    const r = rows.filter((x) => x.eventId === e.id);
    const newcomers = r.filter((x) => x.isNew).length;
    return { eventId: e.id, date: e.date, kind: e.kind, total: r.length, newcomers, repeaters: r.length - newcomers, helpers: r.filter((x) => HELPER_ROLES.includes(x.role)).length };
  });

  // 地域ヒートマップ（町×月）
  const townOf = (r: (typeof rows)[number]) => (r.person?.consent && r.person.town) || UNKNOWN;
  const months = [...new Set(rows.map((r) => r.event.date.slice(0, 7)))].sort();
  const towns = [...new Set(rows.map(townOf))].sort((a, b) => (a === UNKNOWN ? 1 : b === UNKNOWN ? -1 : a.localeCompare(b, "ja")));
  const below = range.suppressBelow;
  const cells = towns.flatMap((town) =>
    months.map((month) => {
      const r = rows.filter((x) => townOf(x) === town && x.event.date.startsWith(month));
      const c = cellOf(r);
      return { town, month, ...hide(c, c.uniques, below) };
    }),
  );
  const totals = towns.map((town) => {
    const c = cellOf(rows.filter((x) => townOf(x) === town));
    return { town, ...hide(c, c.uniques, below) };
  });

  // 属性の内訳（同意者のみ）
  const breakdown = (key: keyof Participant) => {
    const m = new Map<string, number>();
    for (const p of consented) {
      const v = (p[key] as string | null) || "未回答";
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    return [...m.entries()].map(([label, count]) => ({ label, count: below && count < below ? null : count })).sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  };

  return {
    kpis,
    series,
    townHeat: { months, towns, cells, totals },
    breakdowns: {
      gender: breakdown("gender"), ageGroup: breakdown("ageGroup"), club: breakdown("club"),
      trigger: breakdown("trigger"), livingAlone: breakdown("livingAlone"), mobility: breakdown("mobility"),
    },
    noConsent: ids.length - consented.length,
  };
}
