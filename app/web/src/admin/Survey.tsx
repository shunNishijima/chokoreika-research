// アンケートの質問を追加・編集・削除・並べ替えする画面。右側に受付（iPad）での見え方を出す。
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";

type Question = { id: number; key: string; title: string; hint: string; type: "single" | "text"; options: string[]; optional: boolean; enabled: boolean; builtin: boolean };
type Draft = { title: string; hint: string; type: "single" | "text"; options: string; optional: boolean; enabled: boolean };

const SOURCE_NOTE: Record<string, string> = {
  club: "選択肢は「設定」の老人会の一覧から作られます（＋ほかの老人会・入っていない）",
  town: "選択肢は「設定」の市町村の一覧から作られます（＋それ以外）",
  name: "文字で答える質問です",
};
const empty: Draft = { title: "", hint: "", type: "single", options: "", optional: true, enabled: true };
const toDraft = (q: Question): Draft => ({ title: q.title, hint: q.hint, type: q.type, options: q.options.join("\n"), optional: q.optional, enabled: q.enabled });
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export function Survey() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["questions"], queryFn: () => api<Question[]>("/api/admin/questions") });
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["questions"] });
  const fail = async (e: unknown) => {
    const msg = e instanceof ApiError ? (() => { try { const b = JSON.parse(e.message); return b.issues?.join("、") || b.error; } catch { return ""; } })() : "";
    setError(msg && msg !== "invalid" ? msg : "保存できませんでした。題名と選択肢（選択式は1つ以上・重複なし）を確かめてください。");
  };

  const save = useMutation({
    mutationFn: async () => {
      const q = list.data?.find((x) => x.id === editing);
      const body: Record<string, unknown> = { title: draft.title, hint: draft.hint, optional: draft.optional, enabled: draft.enabled };
      if (!q?.builtin) Object.assign(body, { type: draft.type, options: draft.type === "single" ? lines(draft.options) : [] });
      return editing === "new"
        ? api<Question>("/api/admin/questions", { method: "POST", body: JSON.stringify(body) })
        : api<Question>(`/api/admin/questions/${editing}`, { method: "PATCH", body: JSON.stringify(body) });
    },
    onSuccess: (q) => { setError(""); setEditing(q.id); refresh(); },
    onError: fail,
  });
  // 「出す」の切り替えは押した瞬間に画面へ反映し、保存に失敗したら元に戻す
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<Question> }) => api(`/api/admin/questions/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onMutate: ({ id, body }) => {
      void qc.cancelQueries({ queryKey: ["questions"] });
      const prev = qc.getQueryData<Question[]>(["questions"]);
      qc.setQueryData<Question[]>(["questions"], (old) => old?.map((q) => (q.id === id ? { ...q, ...body } : q)));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(["questions"], ctx.prev),
    onSettled: refresh,
  });
  const order = useMutation({
    mutationFn: (ids: number[]) => api("/api/admin/questions/order", { method: "PUT", body: JSON.stringify({ ids }) }),
    onMutate: (ids) => {
      void qc.cancelQueries({ queryKey: ["questions"] });
      const prev = qc.getQueryData<Question[]>(["questions"]);
      qc.setQueryData<Question[]>(["questions"], (old) => old && ids.map((id) => old.find((q) => q.id === id)!).filter(Boolean));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(["questions"], ctx.prev),
    onSettled: refresh,
  });
  const del = useMutation({ mutationFn: (id: number) => api(`/api/admin/questions/${id}`, { method: "DELETE" }), onSuccess: () => { setEditing(null); setConfirmDel(null); refresh(); } });

  const qs = list.data ?? [];
  const move = (i: number, d: -1 | 1) => {
    const ids = qs.map((q) => q.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    order.mutate(ids);
  };
  const open = (q: Question | "new") => { setError(""); setEditing(q === "new" ? "new" : q.id); setDraft(q === "new" ? empty : toDraft(q)); };
  const current = typeof editing === "number" ? qs.find((q) => q.id === editing) : undefined;
  const builtin = current?.builtin ?? false;
  const preview = { title: draft.title || "（題名）", hint: draft.hint, type: draft.type, options: builtin ? current!.options : lines(draft.options), optional: draft.optional };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold mr-4">アンケート</h1>
        <button onClick={() => open("new")} className="rounded-xl bg-navy text-white font-bold px-4 py-2">＋ 質問を追加</button>
      </div>
      <p className="text-ink-soft">受付（iPad）の「はじめての方」で聞く質問です。上から順に1画面1問で出ます。最初に必ず「記録の同意」を聞き、同意しない人には以下の質問をしません。</p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_26rem] items-start">
        <section className="rounded-2xl bg-card border border-line p-2">
          <div className="flex items-center gap-3 rounded-xl px-3 py-3 bg-paper">
            <span className="w-8 text-center font-bold text-ink-soft">1</span>
            <span className="flex-1"><b>受付の記録をとってもよいですか？</b><span className="block text-sm text-ink-soft">記録の同意（固定・いつも最初）</span></span>
            <span className="text-sm text-ink-soft">変更不可</span>
          </div>
          <ol>
            {qs.map((q, i) => (
              <li key={q.id} className={`flex items-center gap-3 rounded-xl px-3 py-3 border-t border-line ${editing === q.id ? "bg-sun-soft" : ""} ${q.enabled ? "" : "opacity-55"}`}>
                <span className="w-8 text-center font-bold text-ink-soft">{i + 2}</span>
                <button onClick={() => open(q)} className="flex-1 text-left min-w-0">
                  <b className="block truncate">{q.title}</b>
                  <span className="text-sm text-ink-soft">
                    {q.type === "text" ? "文字で答える" : `選択肢 ${q.options.length}個`}・{q.optional ? "とばせる" : "必須"}
                    {q.builtin ? "・最初からある質問" : "・追加した質問"}{q.enabled ? "" : "・出さない"}
                  </span>
                </button>
                <label className="flex items-center gap-1 text-sm font-bold whitespace-nowrap cursor-pointer">
                  <input type="checkbox" checked={q.enabled} onChange={(e) => patch.mutate({ id: q.id, body: { enabled: e.target.checked } })} className="w-5 h-5" />出す
                </label>
                <span className="flex flex-col">
                  <button onClick={() => move(i, -1)} disabled={i === 0 || order.isPending} aria-label={`${q.title}を上へ`} className="px-2 leading-none text-lg disabled:opacity-25">▲</button>
                  <button onClick={() => move(i, 1)} disabled={i === qs.length - 1 || order.isPending} aria-label={`${q.title}を下へ`} className="px-2 leading-none text-lg disabled:opacity-25">▼</button>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-24">
          {editing === null ? (
            <p className="rounded-2xl bg-card border border-line p-5 text-ink-soft">左の質問を押すと編集できます。「＋ 質問を追加」で新しい質問を作れます。</p>
          ) : (
            <section className="rounded-2xl bg-card border border-line p-5 space-y-3">
              <h2 className="text-xl font-bold">{editing === "new" ? "質問を追加" : "質問を編集"}</h2>
              {builtin && <p className="text-sm bg-paper rounded-lg p-2">最初からある質問です。ダッシュボードの数字に使うため、選択肢の変更と削除はできません（「出す」を外すと受付で聞かなくなります）。{SOURCE_NOTE[current!.key] ?? ""}</p>}
              <label className="block"><span className="text-sm font-bold text-ink-soft">題名（受付で大きく出る文）</span>
                <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={80} className="inp mt-1" placeholder="例: 朝ごはんは毎日食べますか？" /></label>
              <label className="block"><span className="text-sm font-bold text-ink-soft">説明（任意・題名の下に小さく出る）</span>
                <input value={draft.hint} onChange={(e) => setDraft({ ...draft, hint: e.target.value })} maxLength={200} className="inp mt-1" /></label>
              {!builtin && (
                <fieldset className="flex gap-2">
                  <legend className="text-sm font-bold text-ink-soft mb-1">答え方</legend>
                  {([["single", "選択肢から選ぶ"], ["text", "文字で答える"]] as const).map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setDraft({ ...draft, type: v })} aria-pressed={draft.type === v}
                      className={`flex-1 rounded-xl border-2 px-3 py-2 font-bold ${draft.type === v ? "bg-navy text-white border-navy" : "border-line"}`}>{l}</button>
                  ))}
                </fieldset>
              )}
              {!builtin && draft.type === "single" && (
                <label className="block"><span className="text-sm font-bold text-ink-soft">選択肢（1行に1つ・20個まで）</span>
                  <textarea value={draft.options} onChange={(e) => setDraft({ ...draft, options: e.target.value })} rows={6} className="inp mt-1" placeholder={"毎日\nときどき\nほとんど食べない"} /></label>
              )}
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={draft.optional} onChange={(e) => setDraft({ ...draft, optional: e.target.checked })} className="w-5 h-5" />「とばす」を出す</label>
                <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} className="w-5 h-5" />受付で出す</label>
              </div>
              {error && <p role="alert" className="font-bold text-alert">{error}</p>}
              <div className="flex flex-wrap gap-2 items-center">
                <button onClick={() => save.mutate()} disabled={!draft.title.trim() || save.isPending} className="rounded-xl bg-navy text-white font-bold px-5 py-2 disabled:opacity-40">{save.isPending ? "保存しています…" : "保存する"}</button>
                <button onClick={() => { setEditing(null); setError(""); }} className="rounded-xl border-2 border-line font-bold px-4 py-2">閉じる</button>
                {current && !builtin && (confirmDel === current.id ? (
                  <span className="flex items-center gap-2 ml-auto"><span className="text-sm font-bold">回答も消えます。削除しますか？</span>
                    <button onClick={() => del.mutate(current.id)} className="rounded-xl bg-alert text-white font-bold px-3 py-2">削除</button>
                    <button onClick={() => setConfirmDel(null)} className="rounded-xl border-2 border-line font-bold px-3 py-2">やめる</button></span>
                ) : <button onClick={() => setConfirmDel(current.id)} className="ml-auto text-sm text-alert underline font-bold">この質問を削除</button>)}
              </div>
              {save.isSuccess && !save.isPending && <p className="text-sm font-bold text-leaf">保存しました。受付に次に開いたときから反映されます。</p>}
            </section>
          )}
          {editing !== null && <Preview q={preview} />}
        </aside>
      </div>
    </div>
  );
}

// 受付（iPad）での見え方を小さく再現する
function Preview({ q }: { q: { title: string; hint: string; type: "single" | "text"; options: string[]; optional: boolean } }) {
  return (
    <section className="rounded-2xl border-2 border-dashed border-line p-4 bg-paper" aria-label="受付での見え方">
      <p className="text-xs font-bold text-ink-soft mb-2">受付（iPad）での見え方</p>
      <div className="rounded-xl bg-[#fbf7f0] p-4">
        <p className="text-xl font-bold leading-snug">{q.title}</p>
        {q.hint && <p className="text-sm text-ink-soft mt-1">{q.hint}</p>}
        {q.type === "text" ? (
          <div className="mt-3 rounded-lg border-2 border-navy bg-white h-12" />
        ) : (
          <div className={`grid gap-2 mt-3 ${q.options.length > 4 ? "grid-cols-3" : "grid-cols-2"}`}>
            {q.options.slice(0, 12).map((o) => <span key={o} className="rounded-lg border-2 border-line bg-white px-2 py-2 text-sm font-bold truncate">{o}</span>)}
            {q.options.length === 0 && <span className="text-sm text-ink-soft col-span-2">選択肢がまだありません</span>}
          </div>
        )}
        <div className="flex justify-between mt-3 text-xs font-bold"><span className="rounded-lg border-2 border-line bg-white px-3 py-1">← 戻る</span>{q.optional && <span className="rounded-lg border-2 border-line bg-white px-3 py-1">とばす →</span>}</div>
      </div>
    </section>
  );
}
