import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export function Settings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["options"], queryFn: () => api<{ town: string[]; club: string[] }>("/api/admin/options") });
  const [town, setTown] = useState("");
  const [club, setClub] = useState("");
  useEffect(() => { if (q.data) { setTown(q.data.town.join("\n")); setClub(q.data.club.join("\n")); } }, [q.data]);
  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  const save = useMutation({
    mutationFn: () => api("/api/admin/options", { method: "PUT", body: JSON.stringify({ town: lines(town), club: lines(club) }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["options"] }),
  });
  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">設定</h1>
      <p className="text-ink-soft">受付の「お住まいの町」「老人会」の選択肢です。1行に1つ書いてください。並び順がそのまま受付の画面の順番になります。</p>
      <div className="grid gap-6 md:grid-cols-2">
        <label className="block"><span className="font-bold">町名</span><textarea value={town} onChange={(e) => setTown(e.target.value)} rows={12} className="inp mt-1 font-normal" /></label>
        <label className="block"><span className="font-bold">老人会</span><textarea value={club} onChange={(e) => setClub(e.target.value)} rows={12} className="inp mt-1 font-normal" /></label>
      </div>
      <button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-xl bg-navy text-white font-bold px-6 py-3">{save.isSuccess ? "保存しました" : "保存する"}</button>
    </div>
  );
}
