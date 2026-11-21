import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

type P = { code: string; consent: boolean; ageGroup: string | null; gender: string | null; town: string | null; club: string | null; trigger: string | null; livingAlone: string | null; mobility: string | null; createdAt: string };

export function Participants() {
  const q = useQuery({ queryKey: ["participants"], queryFn: () => api<P[]>("/api/admin/participants") });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold mr-4">参加者（{q.data?.length ?? 0}人）</h1>
        {["participants", "attendances", "events"].map((n) => (
          <a key={n} href={`/api/admin/export/${n}.csv`} className="rounded-xl border-2 border-line bg-card px-3 py-2 font-bold">
            {{ participants: "参加者", attendances: "出席", events: "開催" }[n]}のCSV
          </a>
        ))}
      </div>
      <p className="text-ink-soft">氏名・住所は記録していません。番号と参加カードの対応は、運営の手元で管理してください。</p>
      <div className="rounded-2xl bg-card border border-line p-4 overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-sm text-ink-soft"><tr>{["番号", "同意", "年代", "性別", "町", "老人会", "きっかけ", "一人暮らし", "来た手段", "登録日"].map((h) => <th key={h} className="py-2 pr-3 whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>
            {q.data?.map((p) => (
              <tr key={p.code} className="border-t border-line">
                <td className="py-2 pr-3 font-bold tabular-nums">{p.code}</td>
                <td className="pr-3">{p.consent ? "あり" : "なし"}</td>
                {[p.ageGroup, p.gender, p.town, p.club, p.trigger, p.livingAlone, p.mobility].map((v, i) => <td key={i} className="pr-3 whitespace-nowrap">{v ?? "—"}</td>)}
                <td className="pr-3 whitespace-nowrap">{p.createdAt.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
