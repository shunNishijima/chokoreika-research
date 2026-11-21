// ダッシュボード: 主要な数字、開催ごとの推移、地域の活性度ヒートマップ（軸を切り替え）、属性の内訳。
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, jpDate } from "../lib/api";
import { TownMap, type TownValue } from "./TownMap";

type Cell = { visits: number | null; uniques: number | null; newcomers: number | null; helpers: number | null; avgVisits: number | null; suppressed: boolean };
type Dash = {
  kpis: { events: number; uniques: number; visits: number; newcomers: number; repeatRate: number; helpers: number; nonMemberRate: number; livingAloneRate: number; assistedMobilityRate: number };
  series: { eventId: number; date: string; kind: string; total: number; newcomers: number; repeaters: number; helpers: number }[];
  townHeat: { months: string[]; towns: string[]; cells: (Cell & { town: string; month: string })[]; totals: (Cell & { town: string })[] };
  breakdowns: Record<"gender" | "ageGroup" | "club" | "trigger" | "livingAlone" | "mobility", { label: string; count: number | null }[]> & { custom?: { id: number; title: string; type: string; answered: number; rows: { label: string; count: number | null }[] }[] };
  noConsent: number;
  mood: { pairs: number; avgBefore: number | null; avgAfter: number | null; avgChange: number | null; improved: number; same: number; worse: number; beforeDist: number[]; afterDist: number[] };
};

const METRICS = [
  { key: "visits", label: "延べ参加回数", unit: "回", help: "その市町村の人が参加した回数の合計" },
  { key: "uniques", label: "参加した人数", unit: "人", help: "1回以上参加した人の数（実人数）" },
  { key: "newcomers", label: "はじめて来た人", unit: "人", help: "その月に初めて参加した人の数" },
  { key: "avgVisits", label: "1人あたりの参加回数", unit: "回", help: "延べ参加回数 ÷ 参加した人数" },
  { key: "helpers", label: "担い手（準備・担当）", unit: "人", help: "準備を手伝った・担当をした人の数" },
] as const;
type MetricKey = (typeof METRICS)[number]["key"];

// 連続量は青の単色階調（dataviz 参照パレット 100→700）
const RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
const rampColor = (v: number, max: number) => RAMP[Math.min(RAMP.length - 1, Math.floor((v / (max || 1)) * (RAMP.length - 1) + 0.0001))];
const inkOn = (bg: string) => (RAMP.indexOf(bg) >= 3 ? "#ffffff" : "#0b0b0b");

const pct = (n: number) => `${Math.round(n * 100)}%`;
const monthLabel = (m: string) => `${Number(m.slice(5))}月`;

function ranges() {
  const t = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const back = (months: number) => { const d = new Date(t); d.setMonth(d.getMonth() - months); return iso(d); };
  return [
    { key: "all", label: "全期間", from: "", to: "" },
    { key: "3m", label: "直近3か月", from: back(3), to: iso(t) },
    { key: "6m", label: "直近6か月", from: back(6), to: iso(t) },
    { key: "12m", label: "直近1年", from: back(12), to: iso(t) },
  ];
}

export function Dashboard() {
  const [range, setRange] = useState("all");
  const [kind, setKind] = useState("");
  const [suppress, setSuppress] = useState(false);
  const [metric, setMetric] = useState<MetricKey>("visits");
  const r = ranges().find((x) => x.key === range)!;
  const q = useQuery({
    queryKey: ["dash", range, kind, suppress],
    queryFn: () => api<Dash>(`/api/admin/dashboard?from=${r.from}&to=${r.to}&kind=${encodeURIComponent(kind)}&suppress=${suppress ? 1 : 0}`),
  });
  const d = q.data;

  return (
    <div className="space-y-8">
      <div className="no-print flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold mr-4">ダッシュボード</h1>
        <Seg value={range} onChange={setRange} items={ranges().map((x) => [x.key, x.label])} />
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-xl border-2 border-line bg-card px-3 py-2 font-bold">
          <option value="">すべての会</option><option>朝ご飯会</option><option>映画会</option><option>ご飯会</option><option>その他</option>
        </select>
        <label className="flex items-center gap-2 rounded-xl border-2 border-line bg-card px-3 py-2 font-bold cursor-pointer">
          <input type="checkbox" checked={suppress} onChange={(e) => setSuppress(e.target.checked)} className="w-5 h-5" />
          外部共有モード（5人未満を隠す）
        </label>
        <button onClick={() => window.print()} className="ml-auto rounded-xl bg-navy text-white font-bold px-4 py-2">印刷・PDF</button>
      </div>

      {!d ? <p className="text-ink-soft">{q.isError ? "読み込めませんでした" : "読み込み中…"}</p> : d.kpis.visits === 0 ? (
        <p className="rounded-2xl bg-card p-8 text-lg">この条件の参加記録はまだありません。「開催」から会を作り、iPad で受付をすると数字が出ます。</p>
      ) : (
        <>
          <section className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Kpi label="参加した人数" value={`${d.kpis.uniques}人`} sub={`延べ ${d.kpis.visits}回・${d.kpis.events}回開催`} />
            <Kpi label="はじめて来た人" value={`${d.kpis.newcomers}人`} sub="期間中の新規" />
            <Kpi label="2回以上来た人の割合" value={pct(d.kpis.repeatRate)} sub="リピート率" />
            <Kpi label="担い手" value={`${d.kpis.helpers}人`} sub="準備・担当をした人" />
            <Kpi label="老人会に入っていない人" value={pct(d.kpis.nonMemberRate)} sub="記録に同意した人のうち" />
            <Kpi label="一人暮らしの人" value={pct(d.kpis.livingAloneRate)} sub="回答した人のうち" />
            <Kpi label="杖・手押し車などで来た人" value={pct(d.kpis.assistedMobilityRate)} sub="回答した人のうち" />
            <Kpi label="記録に同意しなかった人" value={`${d.noConsent}人`} sub="人数のみ数えています" />
          </section>

          <Panel title="開催ごとの参加人数" note="はじめて来た人と、2回目以上の人に分けています">
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={d.series.map((s) => ({ ...s, label: `${jpDate(s.date).replace(/（.）/, "")} ${s.kind}` }))} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="30%" maxBarSize={64}>
                  <CartesianGrid vertical={false} stroke="#ece7dc" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#4a4740" }} tickLine={false} axisLine={{ stroke: "#d9d2c5" }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#4a4740" }} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "#f3eee4" }} contentStyle={{ borderRadius: 12, border: "1px solid #d9d2c5", fontSize: 14 }} formatter={(v, n) => [`${v}人`, n]} />
                  <Legend wrapperStyle={{ fontSize: 14 }} formatter={(v) => <span style={{ color: "#1b1b1b" }}>{v}</span>} />
                  <Bar dataKey="repeaters" name="2回目以上" stackId="a" fill="var(--color-series-1)" stroke="#fff" strokeWidth={2} />
                  <Bar dataKey="newcomers" name="はじめて" stackId="a" fill="var(--color-series-2)" stroke="#fff" strokeWidth={2} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <MoodPanel m={d.mood} />

          <TownHeat d={d} metric={metric} setMetric={setMetric} />

          <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Breakdown title="性別" rows={d.breakdowns.gender} />
            <Breakdown title="年代" rows={d.breakdowns.ageGroup} />
            <Breakdown title="老人会" rows={d.breakdowns.club} />
            <Breakdown title="来たきっかけ" rows={d.breakdowns.trigger} />
            <Breakdown title="一人暮らし" rows={d.breakdowns.livingAlone} />
            <Breakdown title="来た手段" rows={d.breakdowns.mobility} />
          </section>
          {(d.breakdowns.custom ?? []).length > 0 && (
            <>
              <h2 className="text-xl font-bold">アンケート（追加した質問）</h2>
              <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {d.breakdowns.custom!.map((q) => q.type === "single"
                  ? <Breakdown key={q.id} title={q.title} rows={q.rows} />
                  : <Panel key={q.id} title={q.title} note="文字で答える質問"><p className="text-3xl font-bold tabular-nums">{q.answered}件</p><p className="text-sm text-ink-soft">回答の中身は「参加者」の「アンケート回答のCSV」で見られます</p></Panel>)}
              </section>
            </>
          )}
          <p className="text-sm text-ink-soft">属性の内訳は、記録に同意した人だけで数えています。外部共有モードでは、5人未満の項目と市町村を「—」で隠します。</p>
        </>
      )}
    </div>
  );
}

function TownHeat({ d, metric, setMetric }: { d: Dash; metric: MetricKey; setMetric: (m: MetricKey) => void }) {
  const m = METRICS.find((x) => x.key === metric)!;
  const { months, towns, cells, totals } = d.townHeat;
  const cellMap = useMemo(() => new Map(cells.map((c) => [`${c.town}|${c.month}`, c])), [cells]);
  const max = Math.max(0, ...cells.map((c) => c[metric] ?? 0));
  const totalMax = Math.max(0, ...totals.map((c) => c[metric] ?? 0));
  const sortedTowns = [...towns].sort((a, b) => (totals.find((t) => t.town === b)?.[metric] ?? -1) - (totals.find((t) => t.town === a)?.[metric] ?? -1));
  const [hover, setHover] = useState<string>("");
  const fmt = (v: number | null) => (v == null ? "—" : metric === "avgVisits" ? v.toFixed(1) : String(v));

  return (
    <Panel title="地域ごとの活性度" note={`色が濃いほど「${m.label}」が多い。${m.help}。地図は期間合計、下の表は月ごと。`}>
      <div className="no-print flex flex-wrap gap-2 mb-4" role="radiogroup" aria-label="ヒートマップの軸">
        {METRICS.map((x) => (
          <button key={x.key} role="radio" aria-checked={metric === x.key} onClick={() => setMetric(x.key)}
            className={`rounded-full px-4 py-2 font-bold border-2 ${metric === x.key ? "bg-navy text-white border-navy" : "bg-card border-line"}`}>{x.label}</button>
        ))}
      </div>
      <TownMap label={m.label} unit={m.unit} fmt={fmt} ramp={RAMP} colorOf={(v) => rampColor(v, totalMax)}
        values={new Map<string, TownValue>(totals.map((t) => [t.town, { value: t[metric], suppressed: t.suppressed, detail: `参加 ${t.uniques ?? 0}人・延べ ${t.visits ?? 0}回・はじめて ${t.newcomers ?? 0}人` }]))} />
      <h3 className="text-lg font-bold mt-6 mb-2">月ごとの変化（市町村 × 月）</h3>
      <div className="overflow-x-auto">
        <table className="border-separate" style={{ borderSpacing: 2 }}>
          <thead>
            <tr>
              <th className="text-left text-sm text-ink-soft font-bold pr-3 sticky left-0 bg-card">市町村</th>
              {months.map((mo) => <th key={mo} className="text-sm text-ink-soft font-bold px-1 min-w-16">{monthLabel(mo)}</th>)}
              <th className="text-sm text-ink-soft font-bold pl-4 text-left min-w-48">期間合計</th>
            </tr>
          </thead>
          <tbody>
            {sortedTowns.map((town) => {
              const t = totals.find((x) => x.town === town)!;
              return (
                <tr key={town}>
                  <th scope="row" className="text-left font-bold pr-3 whitespace-nowrap sticky left-0 bg-card">{town}</th>
                  {months.map((mo) => {
                    const c = cellMap.get(`${town}|${mo}`)!;
                    const v = c?.[metric] ?? null;
                    const empty = !c || (!c.suppressed && (c.visits ?? 0) === 0);
                    const bg = c?.suppressed ? undefined : empty ? "#f6f3ec" : rampColor(v ?? 0, max);
                    const tip = c?.suppressed ? `${town}・${monthLabel(mo)}：5人未満のため非表示` : `${town}・${monthLabel(mo)}：${m.label} ${fmt(v)}${m.unit}（参加 ${c?.uniques ?? 0}人・延べ ${c?.visits ?? 0}回）`;
                    const id = `${town}|${mo}`;
                    return (
                      <td key={mo} title={tip} onMouseEnter={() => setHover(tip)} onMouseLeave={() => setHover("")} onClick={() => setHover(tip)}
                        className={`h-12 min-w-16 rounded-md text-center font-bold text-base ${hover && hover.startsWith(id.replace("|", "・")) ? "ring-2 ring-ink" : ""}`}
                        style={c?.suppressed ? { background: "repeating-linear-gradient(45deg,#ece7dc 0 6px,#f6f3ec 6px 12px)", color: "#4a4740" } : { background: bg, color: bg ? inkOn(bg) : undefined }}>
                        {empty ? "" : fmt(v)}
                      </td>
                    );
                  })}
                  <td className="pl-4">
                    <div className="flex items-center gap-2">
                      <div className="h-5 rounded-r-[4px] bg-series-1" style={{ width: t[metric] == null ? 0 : `${Math.max(4, ((t[metric] ?? 0) / (totalMax || 1)) * 140)}px` }} />
                      <span className="font-bold tabular-nums">{fmt(t[metric])}{t[metric] == null ? "" : m.unit}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-ink-soft">
        <span className="flex items-center gap-2">少ない <span className="flex">{RAMP.map((c) => <span key={c} className="w-6 h-4" style={{ background: c }} />)}</span> 多い</span>
        <span className="flex items-center gap-2"><span className="w-6 h-4 inline-block" style={{ background: "repeating-linear-gradient(45deg,#ece7dc 0 4px,#f6f3ec 4px 8px)" }} /> 5人未満で非表示</span>
        <span className="min-h-5 font-bold text-ink" aria-live="polite">{hover}</span>
      </div>
      <p className="text-sm text-ink-soft mt-2">「不明」は記録に同意しなかった人や市町村を答えなかった人です（地図には出ません）。</p>
    </Panel>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl bg-card border border-line p-5">
      <p className="text-sm font-bold text-ink-soft">{label}</p>
      <p className="text-4xl font-bold my-1 tabular-nums">{value}</p>
      <p className="text-sm text-ink-soft">{sub}</p>
    </div>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card border border-line p-6 break-inside-avoid">
      <h2 className="text-xl font-bold">{title}</h2>
      {note && <p className="text-sm text-ink-soft mt-1 mb-4">{note}</p>}
      {children}
    </section>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { label: string; count: number | null }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count ?? 0));
  return (
    <Panel title={title}>
      {rows.length === 0 ? <p className="text-ink-soft">回答なし</p> : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3">
              <span className="font-bold truncate" title={r.label}>{r.label}</span>
              <span className="h-4 bg-paper rounded-r-[4px]"><span className="block h-4 bg-series-1 rounded-r-[4px]" style={{ width: r.count == null ? 0 : `${(r.count / max) * 100}%` }} /></span>
              <span className="tabular-nums font-bold w-12 text-right">{r.count == null ? "—" : `${r.count}人`}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Seg({ value, onChange, items }: { value: string; onChange: (v: string) => void; items: [string, string][] }) {
  return (
    <div className="flex rounded-xl border-2 border-line bg-card p-1">
      {items.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)} aria-pressed={value === k} className={`px-3 py-1.5 rounded-lg font-bold ${value === k ? "bg-navy text-white" : ""}`}>{l}</button>
      ))}
    </div>
  );
}

const MOOD_LABELS = ["しんどい", "ちょっと元気ない", "ふつう", "いい", "すごくいい"];

function MoodPanel({ m }: { m: Dash["mood"] }) {
  const rows = MOOD_LABELS.map((label, i) => ({ label, before: m.beforeDist[i], after: m.afterDist[i] })).reverse();
  return (
    <Panel title="今の気持ちの変化（来たとき → 帰るとき）" note="1=しんどい〜5=すごくいい。両方答えた人だけで平均の変化を出しています">
      {m.pairs === 0 ? <p className="text-ink-soft">来たときと帰るときの両方に答えた人がまだいません（退出の受付で記録されます）。</p> : (
        <div className="grid gap-6 md:grid-cols-[16rem_1fr] items-center">
          <div>
            <p className="text-sm font-bold text-ink-soft">平均の変化</p>
            <p className="text-5xl font-bold tabular-nums">{(m.avgChange ?? 0) > 0 ? "+" : ""}{m.avgChange?.toFixed(2)}</p>
            <p className="text-sm text-ink-soft">{m.avgBefore?.toFixed(1)} → {m.avgAfter?.toFixed(1)}（{m.pairs}人）</p>
            <p className="mt-3 font-bold">良くなった {m.improved}人・同じ {m.same}人・下がった {m.worse}人</p>
          </div>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={rows} layout="vertical" margin={{ left: 24, right: 16 }} barCategoryGap="25%">
                <CartesianGrid horizontal={false} stroke="#ece7dc" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "#4a4740" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 13, fill: "#1b1b1b" }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "#f3eee4" }} contentStyle={{ borderRadius: 12, border: "1px solid #d9d2c5", fontSize: 14 }} formatter={(v, n) => [`${v}人`, n]} />
                <Legend wrapperStyle={{ fontSize: 14 }} formatter={(v) => <span style={{ color: "#1b1b1b" }}>{v}</span>} />
                <Bar dataKey="before" name="来たとき" fill="var(--color-series-1)" radius={[0, 4, 4, 0]} maxBarSize={18} />
                <Bar dataKey="after" name="帰るとき" fill="var(--color-series-2)" radius={[0, 4, 4, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Panel>
  );
}
