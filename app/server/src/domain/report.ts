// 報告書（行政・協賛企業向け）の集計（純粋関数）。ダッシュボード（metrics.ts）にない指標だけをここで出す。

export type ReportData = {
  events: { id: number; date: string; kind: string; host: string }[];
  participants: { id: number; consent: boolean; ageGroup: string | null; birthYear: number | null; gender: string | null }[];
  attendances: { eventId: number; participantId: number; checkedInAt: string | Date; checkedOutAt: string | Date | null }[];
};
export type ReportRange = { asOf: string; from?: string; to?: string; kind?: string; suppressBelow?: number };

// 国の集計（前期・後期高齢者）に合わせた区分。受付の「年代」の選択肢と同じ文字列にする
export const AGE_BANDS = ["65歳未満", "65〜74歳", "75〜84歳", "85歳以上"] as const;
const NO_ANSWER = "未回答";
const MAX_STAY_MIN = 12 * 60; // これより長いのは退出の押し忘れとみなす

// 生まれ年だけから年齢を出すので、誕生日前の人は1歳多くなることがある
export function ageBand(birthYear: number, asOfYear: number): string {
  const age = asOfYear - birthYear;
  if (age < 65) return AGE_BANDS[0];
  if (age < 75) return AGE_BANDS[1];
  if (age < 85) return AGE_BANDS[2];
  return AGE_BANDS[3];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildReport(data: ReportData, range: ReportRange) {
  const inRange = (e: { date: string; kind: string }) =>
    (!range.from || e.date >= range.from) && (!range.to || e.date <= range.to) && (!range.kind || e.kind === range.kind);
  const evById = new Map(data.events.map((e) => [e.id, e]));
  const events = data.events.filter(inRange).sort((a, b) => a.date.localeCompare(b.date));
  const rows = data.attendances.map((a) => ({ ...a, event: evById.get(a.eventId)! })).filter((a) => a.event && inRange(a.event));
  const hide = (n: number) => (range.suppressBelow && n < range.suppressBelow ? null : n);

  // 初めて来た日は全期間の履歴で決める
  const firstDate = new Map<number, string>();
  for (const a of data.attendances) {
    const e = evById.get(a.eventId);
    if (!e) continue;
    const prev = firstDate.get(a.participantId);
    if (!prev || e.date < prev) firstDate.set(a.participantId, e.date);
  }

  const months = [...new Set(events.map((e) => e.date.slice(0, 7)))].sort();
  const monthly = months.map((month) => {
    const r = rows.filter((x) => x.event.date.startsWith(month));
    const ids = new Set(r.map((x) => x.participantId));
    const newIds = new Set(r.filter((x) => firstDate.get(x.participantId) === x.event.date).map((x) => x.participantId));
    return { month, events: events.filter((e) => e.date.startsWith(month)).length, visits: r.length, uniques: ids.size, newcomers: newIds.size };
  });

  // 年齢層: 記録に同意した人だけ。生まれ年があればそれを優先し、なければ受付で選んだ年代
  const asOfYear = Number(range.asOf.slice(0, 4));
  const ids = [...new Set(rows.map((r) => r.participantId))];
  const pById = new Map(data.participants.map((p) => [p.id, p]));
  const consented = ids.map((id) => pById.get(id)).filter((p) => p?.consent) as ReportData["participants"];
  const ageCount = new Map<string, number>();
  for (const p of consented) {
    const label = p.birthYear ? ageBand(p.birthYear, asOfYear) : p.ageGroup || NO_ANSWER;
    ageCount.set(label, (ageCount.get(label) ?? 0) + 1);
  }
  const order = [...AGE_BANDS, "学生", NO_ANSWER];
  const ageBands = [...ageCount.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([label, count]) => ({ label, count: hide(count) }));

  // 再来率: 期間中にはじめて来た人のうち、その後にもう一度来た人
  const newcomerIds = ids.filter((id) => rows.some((r) => r.participantId === id && firstDate.get(id) === r.event.date));
  const returned = newcomerIds.filter((id) => data.attendances.some((a) => {
    const e = evById.get(a.eventId);
    return a.participantId === id && e && e.date > firstDate.get(id)!;
  }));
  const comeback = { newcomers: newcomerIds.length, returned: returned.length, rate: newcomerIds.length ? returned.length / newcomerIds.length : 0 };

  // 滞在時間（入室〜退出）
  const minutes = rows
    .filter((r) => r.checkedOutAt)
    .map((r) => (new Date(r.checkedOutAt!).getTime() - new Date(r.checkedInAt).getTime()) / 60000)
    .filter((m) => m > 0 && m <= MAX_STAY_MIN)
    .sort((a, b) => a - b);
  const mid = minutes.length >> 1;
  const stay = {
    count: minutes.length,
    avgMinutes: minutes.length ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length) : null,
    medianMinutes: minutes.length ? Math.round(minutes.length % 2 ? minutes[mid] : (minutes[mid - 1] + minutes[mid]) / 2) : null,
  };

  const groupBy = (key: "kind" | "host") => {
    const m = new Map<string, { events: number; visits: number }>();
    for (const e of events) {
      const label = e[key] || "（未設定）";
      const g = m.get(label) ?? { events: 0, visits: 0 };
      g.events += 1;
      g.visits += rows.filter((r) => r.eventId === e.id).length;
      m.set(label, g);
    }
    return [...m.entries()].map(([label, g]) => ({ label, ...g, perEvent: round1(g.visits / g.events) })).sort((a, b) => b.visits - a.visits);
  };

  return {
    period: { first: events[0]?.date ?? null, last: events[events.length - 1]?.date ?? null },
    monthly,
    ageBands,
    comeback,
    stay,
    kinds: groupBy("kind"),
    hosts: groupBy("host"),
  };
}
