// 開催の作成・一覧・当日の出席と役割。iPad で受付を開くための QR とリンクもここで出す。
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { api, jpDate } from "../lib/api";

type Ev = { id: number; date: string; kind: string; place: string; host: string; nextDate: string | null; kioskToken: string; attendanceCount: number };
type Att = { id: number; role: string; checkedInAt: string; checkedOutAt: string | null; moodBefore: number | null; moodAfter: number | null; code: string; name: string | null; ageGroup: string | null; gender: string | null; town: string | null; club: string | null };
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export function Events() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["events"], queryFn: () => api<Ev[]>("/api/admin/events") });
  const opts = useQuery({ queryKey: ["options"], queryFn: () => api<{ town: string[]; club: string[] }>("/api/admin/options") });
  const [selected, setSelected] = useState<number | null>(null);
  const [form, setForm] = useState({ date: today(), kind: "朝ご飯会", place: "", host: "", nextDate: "" });
  const create = useMutation({
    mutationFn: () => api<Ev>("/api/admin/events", { method: "POST", body: JSON.stringify({ ...form, nextDate: form.nextDate || null }) }),
    onSuccess: (ev) => { qc.invalidateQueries({ queryKey: ["events"] }); setSelected(ev.id); },
  });
  const sel = list.data?.find((e) => e.id === selected) ?? null;

  return (
    <div className="grid gap-8 lg:grid-cols-[22rem_1fr]">
      <div className="space-y-6">
        <section className="rounded-2xl bg-card border border-line p-5">
          <h2 className="text-xl font-bold mb-4">新しく会を作る</h2>
          <Field label="日付"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="inp" /></Field>
          <Field label="種類">
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="inp">{["朝ご飯会", "映画会", "ご飯会", "その他"].map((k) => <option key={k}>{k}</option>)}</select>
          </Field>
          <Field label="会場"><input value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} placeholder="例: 集会所" className="inp" /></Field>
          <Field label="主催の老人会">
            <select value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} className="inp"><option value="">（選ばない）</option>{opts.data?.club.map((c) => <option key={c}>{c}</option>)}</select>
          </Field>
          <Field label="次回の日付（参加カードに出ます）"><input type="date" value={form.nextDate} onChange={(e) => setForm({ ...form, nextDate: e.target.value })} className="inp" /></Field>
          <button onClick={() => create.mutate()} disabled={create.isPending || !form.date} className="w-full mt-2 rounded-xl bg-navy text-white font-bold py-3">作成する</button>
        </section>
        <section className="rounded-2xl bg-card border border-line p-2">
          {list.data?.length === 0 && <p className="p-4 text-ink-soft">まだ会がありません</p>}
          <ul>
            {list.data?.map((e) => (
              <li key={e.id}>
                <button onClick={() => setSelected(e.id)} className={`w-full text-left rounded-xl px-4 py-3 flex justify-between gap-3 ${selected === e.id ? "bg-navy text-white" : "hover:bg-paper"}`}>
                  <span><b>{jpDate(e.date)}</b> {e.kind}</span><span className="tabular-nums">{e.attendanceCount}人</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div>{sel ? <EventDetail ev={sel} /> : <p className="text-ink-soft text-lg">左から会を選ぶか、新しく作ってください。</p>}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block mb-3"><span className="block text-sm font-bold text-ink-soft mb-1">{label}</span>{children}</label>;
}

function EventDetail({ ev }: { ev: Ev }) {
  const qc = useQueryClient();
  const url = `${location.origin}/kiosk?e=${ev.id}&t=${ev.kioskToken}`;
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { QRCode.toDataURL(url, { margin: 1, width: 220 }).then(setQr); }, [url]);
  const detail = useQuery({ queryKey: ["event", ev.id], queryFn: () => api<{ attendances: Att[] }>(`/api/admin/events/${ev.id}`), refetchInterval: 10_000 });
  const role = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) => api(`/api/admin/attendances/${id}`, { method: "PATCH", body: JSON.stringify({ role }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["event", ev.id] }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/admin/attendances/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["event", ev.id] }); qc.invalidateQueries({ queryKey: ["events"] }); },
  });
  const [confirmId, setConfirmId] = useState<number | null>(null);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-card border border-line p-6 flex flex-wrap gap-6 items-center">
        {qr && <img src={qr} alt="受付画面を開く QR コード" className="w-44 h-44" />}
        <div className="flex-1 min-w-64">
          <h2 className="text-2xl font-bold">{jpDate(ev.date)} {ev.kind}</h2>
          <p className="text-ink-soft">{[ev.place, ev.host].filter(Boolean).join("・")}{ev.nextDate ? `　次回 ${jpDate(ev.nextDate)}` : ""}</p>
          <p className="mt-3 font-bold">ふだんは iPad の受付画面で「老人会 → この会」を選んで開きます。合言葉を登録していない端末では、この QR からも開けます。</p>
          <div className="flex gap-2 mt-3">
            <button onClick={() => { navigator.clipboard.writeText(url); setCopied(true); }} className="rounded-xl border-2 border-line px-3 py-2 font-bold">{copied ? "コピーしました" : "リンクをコピー"}</button>
            <a href={url} target="_blank" rel="noreferrer" className="rounded-xl border-2 border-line px-3 py-2 font-bold">この端末で開く</a>
          </div>
          <p className="text-sm text-ink-soft mt-2">このリンクを知っている人は受付ができます。会のあとは共有しないでください。</p>
        </div>
      </section>
      <section className="rounded-2xl bg-card border border-line p-6">
        <h3 className="text-xl font-bold mb-3">出席した人（{detail.data?.attendances.length ?? 0}人）</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left [&_td]:pr-4 [&_th]:pr-4 [&_td]:whitespace-nowrap">
            <thead className="text-sm text-ink-soft"><tr><th className="py-2">ID</th><th>名前</th><th>年代</th><th>市町村</th><th>老人会</th><th>気持ち（来た→帰る）</th><th>退出</th><th>役割</th><th /></tr></thead>
            <tbody>
              {detail.data?.attendances.map((a) => (
                <tr key={a.id} className="border-t border-line">
                  <td className="py-2 font-bold tabular-nums">{a.code}</td><td className="font-bold">{a.name ?? "—"}</td><td>{a.ageGroup ?? "—"}</td><td>{a.town ?? "—"}</td><td>{a.club ?? "—"}</td><td className="tabular-nums">{a.moodBefore ?? "—"} → {a.moodAfter ?? "—"}</td><td className="tabular-nums">{a.checkedOutAt ? new Date(a.checkedOutAt).toTimeString().slice(0, 5) : "—"}</td>
                  <td>
                    <select value={a.role} onChange={(e) => role.mutate({ id: a.id, role: e.target.value })} className="rounded-lg border-2 border-line px-2 py-1">
                      {["参加", "準備を手伝った", "担当"].map((r) => <option key={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="text-right">
                    {confirmId === a.id ? (
                      <span className="flex gap-1 justify-end"><button onClick={() => remove.mutate(a.id)} className="rounded-lg bg-alert text-white px-2 py-1 text-sm font-bold">取り消す</button><button onClick={() => setConfirmId(null)} className="rounded-lg border-2 border-line px-2 py-1 text-sm">やめる</button></span>
                    ) : <button onClick={() => setConfirmId(a.id)} className="text-sm text-ink-soft underline">出席を取り消す</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
