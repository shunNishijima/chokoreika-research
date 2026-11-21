// 報告書: 行政・協賛企業に見せるための、印刷（A4・PDF）向けのまとめ。ダッシュボードと同じ数字を、説明つきで並べる。
// 既定は外部共有（5人未満を隠す）。題名・団体名・所見は運営が書き込み、この端末に覚えておく。
import { Fragment, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../lib/api";
import { TownMap, type TownValue } from "./TownMap";

type Count = { label: string; count: number | null };
type Group = { label: string; events: number; visits: number; perEvent: number };
type Data = {
  dashboard: {
    kpis: { events: number; uniques: number; visits: number; newcomers: number; repeatRate: number; helpers: number; nonMemberRate: number; livingAloneRate: number; assistedMobilityRate: number };
    townHeat: { totals: { town: string; uniques: number | null; visits: number | null; newcomers: number | null; suppressed: boolean }[] };
    breakdowns: Record<"gender" | "ageGroup" | "club" | "trigger" | "livingAlone" | "mobility", Count[]>;
    noConsent: number;
    mood: { pairs: number; avgBefore: number | null; avgAfter: number | null; avgChange: number | null; improved: number; same: number; worse: number; beforeDist: number[]; afterDist: number[] };
  };
  report: {
    period: { first: string | null; last: string | null };
    monthly: { month: string; events: number; visits: number; uniques: number; newcomers: number }[];
    ageBands: Count[];
    comeback: { newcomers: number; returned: number; rate: number };
    stay: { count: number; avgMinutes: number | null; medianMinutes: number | null };
    kinds: Group[];
    hosts: Group[];
  };
};

const RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
const rampColor = (v: number, max: number) => RAMP[Math.min(RAMP.length - 1, Math.floor((v / (max || 1)) * (RAMP.length - 1) + 0.0001))];
const pct = (n: number) => `${Math.round(n * 100)}%`;
const ymd = (d: string | null) => (d ? `${Number(d.slice(0, 4))}年${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日` : "—");
const monthLabel = (m: string) => `${Number(m.slice(5))}月`;
const MOOD_LABELS = ["しんどい", "ちょっと元気ない", "ふつう", "いい", "すごくいい"];

function ranges() {
  const t = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const back = (months: number) => { const d = new Date(t); d.setMonth(d.getMonth() - months); return iso(d); };
  // 年度（4月始まり）
  const fy = t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1;
  return [
    { key: "all", label: "全期間", from: "", to: "" },
    { key: "fy", label: `${fy}年度`, from: `${fy}-04-01`, to: `${fy + 1}-03-31` },
    { key: "6m", label: "直近6か月", from: back(6), to: iso(t) },
    { key: "3m", label: "直近3か月", from: back(3), to: iso(t) },
  ];
}

function useStored(key: string, initial: string) {
  const [v, setV] = useState(() => { try { return localStorage.getItem(key) ?? initial; } catch { return initial; } });
  useEffect(() => { try { localStorage.setItem(key, v); } catch { /* 保存できなくても表示はできる */ } }, [key, v]);
  return [v, setV] as const;
}

export function Report() {
  const [range, setRange] = useState("all");
  const [share, setShare] = useState(true);
  const [title, setTitle] = useStored("choko-report-title", "地域の居場所づくり 活動報告");
  const [org, setOrg] = useStored("choko-report-org", "");
  const [comment, setComment] = useStored("choko-report-comment", "");
  const r = ranges().find((x) => x.key === range)!;
  const q = useQuery({
    queryKey: ["report", range, share],
    queryFn: () => api<Data>(`/api/admin/report?from=${r.from}&to=${r.to}&suppress=${share ? 1 : 0}`),
  });
  const d = q.data;

  return (
    <div className="report">
      <style>{`@page { size: A4 portrait; margin: 12mm; } @media print { .report-page { box-shadow: none !important; border: 0 !important; margin: 0 !important; padding: 0 !important; } .report-break { break-before: page; } }`}</style>
      <div className="no-print flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold mr-2">報告書</h1>
        <div className="flex rounded-xl border-2 border-line bg-card p-1">
          {ranges().map((x) => (
            <button key={x.key} onClick={() => setRange(x.key)} aria-pressed={range === x.key} className={`px-3 py-1.5 rounded-lg font-bold ${range === x.key ? "bg-navy text-white" : ""}`}>{x.label}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 rounded-xl border-2 border-line bg-card px-3 py-2 font-bold cursor-pointer">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="w-5 h-5" />
          外部共有モード（5人未満を隠す）
        </label>
        <button onClick={() => window.print()} className="ml-auto rounded-xl bg-navy text-white font-bold px-5 py-2">印刷・PDF に保存</button>
      </div>
      {!share && <p className="no-print mb-4 rounded-xl bg-alert-soft text-alert font-bold px-4 py-2">外部共有モードが切れています。少人数の区分から個人が分かるおそれがあるため、外に出す資料ではオンにしてください。</p>}
      <div className="no-print grid gap-3 md:grid-cols-2 mb-6">
        <label className="font-bold text-sm">報告書の題名<input className="inp mt-1" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="font-bold text-sm">団体名・作成者<input className="inp mt-1" value={org} onChange={(e) => setOrg(e.target.value)} placeholder="例: ○○老人会 連絡会" /></label>
      </div>

      {!d ? <p className="text-ink-soft">{q.isError ? "読み込めませんでした" : "読み込み中…"}</p> : d.dashboard.kpis.visits === 0 ? (
        <p className="rounded-2xl bg-card p-8 text-lg">この期間の参加記録はまだありません。</p>
      ) : (
        <Body d={d} title={title} org={org} share={share} comment={comment} setComment={setComment} />
      )}
    </div>
  );
}

function Body({ d, title, org, share, comment, setComment }: { d: Data; title: string; org: string; share: boolean; comment: string; setComment: (v: string) => void }) {
  const k = d.dashboard.kpis;
  const rp = d.report;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const perPerson = k.uniques ? Math.round((k.visits / k.uniques) * 10) / 10 : 0;
  const totals = d.dashboard.townHeat.totals.filter((t) => t.town !== "不明");
  const townMax = Math.max(0, ...totals.map((t) => t.uniques ?? 0));
  const moodTotal = d.dashboard.mood.beforeDist.reduce((a, b) => a + b, 0);
  const good = d.dashboard.mood.beforeDist[3] + d.dashboard.mood.beforeDist[4];
  const m = d.dashboard.mood;
  const afterTotal = m.afterDist.reduce((a, b) => a + b, 0);

  return (
    <article className="space-y-6">
      {/* 1. 表紙と要約 */}
      <Page>
        <header className="border-b-4 border-navy pb-5 mb-6">
          <p className="text-sm font-bold text-ink-soft">{org || "（団体名）"}</p>
          <h1 className="text-4xl font-bold mt-1 leading-tight">{title}</h1>
          <p className="mt-3 text-lg">対象期間: <b>{ymd(rp.period.first)} 〜 {ymd(rp.period.last)}</b>　／　作成日: {ymd(today)}</p>
        </header>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Big label="開催した回数" value={k.events} unit="回" />
          <Big label="延べ参加" value={k.visits} unit="人" />
          <Big label="参加した人（実人数）" value={k.uniques} unit="人" />
          <Big label="はじめて来た人" value={k.newcomers} unit="人" />
          <Big label="もう一度来た人の割合" value={pct(rp.comeback.rate)} note={`はじめて来た ${rp.comeback.newcomers}人のうち ${rp.comeback.returned}人`} />
          <Big label="1人あたりの参加回数" value={perPerson} unit="回" />
          <Big label="1回あたりの参加" value={k.events ? Math.round((k.visits / k.events) * 10) / 10 : 0} unit="人" />
          <Big label="滞在時間（中央値）" value={rp.stay.medianMinutes ?? "—"} unit={rp.stay.medianMinutes == null ? "" : "分"} note={rp.stay.count ? `退出を記録した ${rp.stay.count}件` : "退出の記録なし"} />
        </div>
        <section className="mt-6 rounded-2xl bg-paper p-5 leading-relaxed text-lg">
          <h2 className="font-bold text-xl mb-2">まとめ</h2>
          <p>
            対象期間に <b>{k.events}回</b> の会を開き、延べ <b>{k.visits}人</b>（実人数 <b>{k.uniques}人</b>）が参加しました。
            はじめて来た人は <b>{k.newcomers}人</b> で、そのうち <b>{rp.comeback.returned}人（{pct(rp.comeback.rate)}）</b> がもう一度来ています。
            {moodTotal > 0 && <> 来たときの気分を答えた延べ {moodTotal}人のうち、「いい」「すごくいい」は <b>{pct(good / moodTotal)}</b> でした。</>}
            {d.dashboard.mood.pairs > 0 && d.dashboard.mood.avgChange != null && <> 来たときと帰るときの両方に答えた {d.dashboard.mood.pairs}人では、気分の平均が <b>{d.dashboard.mood.avgBefore?.toFixed(1)} → {d.dashboard.mood.avgAfter?.toFixed(1)}</b> になりました。</>}
          </p>
        </section>
        <section className="mt-5">
          <h2 className="font-bold text-xl mb-2">運営からのひとこと</h2>
          <textarea className="no-print inp min-h-28" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="活動の様子、参加者の声、今後の予定などを書いてください（印刷に出ます）" />
          <p className="hidden print:block whitespace-pre-wrap text-lg leading-relaxed min-h-10">{comment || "　"}</p>
        </section>
      </Page>

      {/* 2. 参加の推移 */}
      <Page brk>
        <Sec title="参加の推移（月ごと）" note="棒は延べ参加、線は参加した人の実人数です">
          <div className="h-72">
            <ResponsiveContainer>
              <ComposedChart data={rp.monthly.map((m) => ({ ...m, label: monthLabel(m.month), repeat: m.visits - m.newcomers }))} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#ece7dc" />
                <XAxis dataKey="label" tick={{ fontSize: 13, fill: "#4a4740" }} tickLine={false} axisLine={{ stroke: "#d9d2c5" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#4a4740" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #d9d2c5", fontSize: 14 }} formatter={(v, n) => [`${v}人`, n]} />
                <Legend wrapperStyle={{ fontSize: 14 }} formatter={(v) => <span style={{ color: "#1b1b1b" }}>{v}</span>} />
                <Bar dataKey="repeat" name="延べ参加（2回目以上）" stackId="a" fill="var(--color-series-1)" isAnimationActive={false} />
                <Bar dataKey="newcomers" name="延べ参加（はじめて）" stackId="a" fill="var(--color-series-2)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Line dataKey="uniques" name="実人数" stroke="#1b1b1b" strokeWidth={2.5} dot={{ r: 4 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <table className="w-full mt-4 text-base tabular-nums">
            <thead className="text-ink-soft text-sm"><tr><th className="text-left py-1">月</th><th className="text-right">開催</th><th className="text-right">延べ参加</th><th className="text-right">実人数</th><th className="text-right">はじめて</th></tr></thead>
            <tbody>{rp.monthly.map((m) => <tr key={m.month} className="border-t border-line"><td className="py-1">{Number(m.month.slice(0, 4))}年{Number(m.month.slice(5))}月</td><td className="text-right">{m.events}回</td><td className="text-right">{m.visits}人</td><td className="text-right">{m.uniques}人</td><td className="text-right">{m.newcomers}人</td></tr>)}</tbody>
          </table>
        </Sec>
        <Sec title="会の種類・主催ごと">
          <div className="grid md:grid-cols-2 gap-6">
            <GroupTable title="会の種類" rows={rp.kinds} />
            <GroupTable title="主催（老人会）" rows={rp.hosts} />
          </div>
        </Sec>
      </Page>

      {/* 3. 参加者の姿 */}
      <Page brk>
        <Sec title="どんな人が来ているか" note="記録に同意した人だけで数えています（実人数）">
          <div className="grid md:grid-cols-2 gap-6">
            <Bars title="年齢層" rows={rp.ageBands} />
            <Bars title="性別" rows={d.dashboard.breakdowns.gender} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            <Big label="老人会に入っていない人" value={pct(k.nonMemberRate)} small />
            <Big label="一人暮らしの人" value={pct(k.livingAloneRate)} small />
            <Big label="杖・手押し車などで来た人" value={pct(k.assistedMobilityRate)} small />
            <Big label="準備・担当をした人（担い手）" value={k.helpers} unit="人" small />
          </div>
          <p className="text-sm text-ink-soft mt-2">割合は、その質問に答えた人のうちの割合です。受付の種類によっては聞いていない項目があります。</p>
        </Sec>
        <Sec title="気分の変化" note="受付で「今日の気分」を、来たときと帰るときに選んでもらっています（延べ）">
          {moodTotal === 0 ? <p className="text-ink-soft">まだ記録がありません。</p> : (
            <>
              {m.pairs > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                  <Big label="気分が良くなった人" value={pct(m.improved / m.pairs)} note={`両方に答えた ${m.pairs}人のうち ${m.improved}人`} small />
                  <Big label="変わらなかった人" value={pct(m.same / m.pairs)} small />
                  <Big label="下がった人" value={pct(m.worse / m.pairs)} small />
                  <Big label="気分の平均（5段階）" value={`${m.avgBefore?.toFixed(1)}→${m.avgAfter?.toFixed(1)}`} small />
                </div>
              )}
              <div className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 items-center">
                {MOOD_LABELS.map((label, i) => ({ label, b: m.beforeDist[i], a: m.afterDist[i] })).reverse().filter((x) => x.b + x.a > 0).map((x) => (
                  <Fragment key={x.label}>
                    <span className="font-bold">{x.label}</span>
                    <span className="space-y-1">
                      <MoodBar n={x.b} total={moodTotal} color="var(--color-series-1)" tag="来たとき" />
                      {afterTotal > 0 && <MoodBar n={x.a} total={afterTotal} color="var(--color-series-2)" tag="帰るとき" />}
                    </span>
                  </Fragment>
                ))}
              </div>
            </>
          )}
        </Sec>
      </Page>

      {/* 4. 地域 */}
      {totals.length > 0 && (
        <Page brk>
          <Sec title="どこから来ているか" note="市町村ごとの参加した人（実人数）。色が濃いほど多い">
            <TownMap label="参加した人" unit="人" fmt={(v) => (v == null ? "—" : String(v))} ramp={RAMP} colorOf={(v) => rampColor(v, townMax)}
              values={new Map<string, TownValue>(totals.map((t) => [t.town, { value: t.uniques, suppressed: t.suppressed, detail: `延べ ${t.visits ?? "—"}回・はじめて ${t.newcomers ?? "—"}人` }]))} />
          </Sec>
        </Page>
      )}

      {/* 5. 定義と個人情報 */}
      <Page brk>
        <Sec title="数字の出し方と個人情報の扱い">
          <dl className="grid md:grid-cols-[12rem_1fr] gap-x-6 gap-y-3 text-base leading-relaxed">
            <dt className="font-bold">延べ参加・実人数</dt><dd>延べ参加は受付の回数の合計、実人数は期間中に1回以上来た人の数です。受付の ID（4けたの番号）で同じ人を数えています。</dd>
            <dt className="font-bold">はじめて来た人</dt><dd>これまでの記録の中で、はじめて受付をした人です。</dd>
            <dt className="font-bold">もう一度来た人の割合</dt><dd>期間中にはじめて来た人のうち、その後にもう一度来た人の割合です。期間の終わりごろにはじめて来た人は、まだ次の会がないため低めに出ます。</dd>
            <dt className="font-bold">滞在時間</dt><dd>入室から退出までの時間です。退出を記録した参加だけで出し、5分未満（押し間違い）と12時間を超えるもの（退出の押し忘れ）は除いています。</dd>
            <dt className="font-bold">年齢層</dt><dd>生まれ年（昭和○年）から計算しています。誕生日前の人は1歳多く数えることがあります。区分は前期高齢者（65〜74歳）・後期高齢者（75歳以上）に合わせています。</dd>
            <dt className="font-bold">個人情報</dt><dd>名前や生まれ年は、本人が記録に同意した場合だけ保存し、この報告書には載せていません。{share ? "5人未満の区分は「—」で隠しています。" : "（この版は内部用です。5人未満の区分も表示しています）"}記録に同意しなかった人（{d.dashboard.noConsent}人）は、人数と気分だけを数えています。</dd>
          </dl>
        </Sec>
      </Page>
    </article>
  );
}

function Page({ children, brk }: { children: React.ReactNode; brk?: boolean }) {
  return <div className={`report-page rounded-2xl bg-card border border-line shadow-sm p-8 ${brk ? "report-break" : ""}`}>{children}</div>;
}

function Sec({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid mb-8 last:mb-0">
      <h2 className="text-2xl font-bold border-l-8 border-navy pl-3">{title}</h2>
      {note && <p className="text-sm text-ink-soft mt-1">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Big({ label, value, unit, note, small }: { label: string; value: string | number; unit?: string; note?: string; small?: boolean }) {
  return (
    <div className="rounded-2xl border-2 border-line p-4 break-inside-avoid">
      <p className="text-sm font-bold text-ink-soft">{label}</p>
      <p className={`${small ? "text-3xl" : "text-4xl"} font-bold tabular-nums mt-1`}>{value}<span className="text-lg ml-1">{unit}</span></p>
      {note && <p className="text-xs text-ink-soft mt-1">{note}</p>}
    </div>
  );
}

function Bars({ title, rows }: { title: string; rows: Count[] }) {
  const total = rows.reduce((a, r) => a + (r.count ?? 0), 0);
  return (
    <div className="break-inside-avoid">
      <h3 className="font-bold text-lg mb-2">{title}</h3>
      {rows.length === 0 ? <p className="text-ink-soft">回答なし</p> : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[7rem_1fr_6.5rem] items-center gap-3">
              <span className="font-bold truncate">{r.label}</span>
              <span className="h-5 bg-paper rounded-r"><span className="block h-5 bg-series-1 rounded-r" style={{ width: r.count == null || !total ? 0 : `${(r.count / total) * 100}%` }} /></span>
              <span className="text-right tabular-nums font-bold">{r.count == null ? "—" : `${r.count}人（${pct(r.count / (total || 1))}）`}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GroupTable({ title, rows }: { title: string; rows: Group[] }) {
  return (
    <div className="break-inside-avoid">
      <h3 className="font-bold text-lg mb-2">{title}</h3>
      <table className="w-full tabular-nums">
        <thead className="text-ink-soft text-sm"><tr><th className="text-left py-1"> </th><th className="text-right">開催</th><th className="text-right">延べ参加</th><th className="text-right">1回あたり</th></tr></thead>
        <tbody>{rows.map((g) => <tr key={g.label} className="border-t border-line"><td className="py-1 font-bold">{g.label}</td><td className="text-right">{g.events}回</td><td className="text-right">{g.visits}人</td><td className="text-right">{g.perEvent}人</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function MoodBar({ n, total, color, tag }: { n: number; total: number; color: string; tag: string }) {
  return (
    <span className="grid grid-cols-[4.5rem_1fr_3.5rem] items-center gap-2 text-sm">
      <span className="text-ink-soft font-bold">{tag}</span>
      <span className="h-4 bg-paper rounded-r"><span className="block h-4 rounded-r" style={{ width: `${(n / (total || 1)) * 100}%`, background: color }} /></span>
      <span className="text-right tabular-nums font-bold">{pct(n / (total || 1))}</span>
    </span>
  );
}
