import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useTownGeo } from "./TownMap";

export function Settings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["options"], queryFn: () => api<{ town: string[]; club: string[] }>("/api/admin/options") });
  const [town, setTown] = useState("");
  const [club, setClub] = useState("");
  useEffect(() => { if (q.data) { setTown(q.data.town.join("\n")); setClub(q.data.club.join("\n")); } }, [q.data]);
  const geo = useTownGeo();
  const loadTowns = () => {
    const names = geo.data?.features.map((f) => f.properties.town).sort((a, b) => a.localeCompare(b, "ja")) ?? [];
    setTown(names.join("\n"));
  };
  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  const save = useMutation({
    mutationFn: () => api("/api/admin/options", { method: "PUT", body: JSON.stringify({ town: lines(town), club: lines(club) }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["options"] }),
  });
  const pass = useQuery({ queryKey: ["kiosk-passcode"], queryFn: () => api<{ isSet: boolean }>("/api/admin/kiosk-passcode") });
  const [newPass, setNewPass] = useState("");
  const setPass = useMutation({
    mutationFn: () => api("/api/admin/kiosk-passcode", { method: "PUT", body: JSON.stringify({ passcode: newPass }) }),
    onSuccess: () => { setNewPass(""); qc.invalidateQueries({ queryKey: ["kiosk-passcode"] }); },
  });
  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">設定</h1>
      <section className="rounded-2xl bg-card border border-line p-5">
        <h2 className="text-xl font-bold mb-1">受付の合言葉</h2>
        <p className="text-ink-soft mb-3">iPad で受付を始めるときに、はじめの1回だけ入れる合言葉です。変えると、登録済みの iPad でも入れ直しが必要になります。今の状態: <b>{pass.data?.isSet ? "設定済み" : "未設定"}</b></p>
        <div className="flex gap-2 flex-wrap">
          <input value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="4文字以上" className="inp max-w-xs" autoComplete="off" />
          <button onClick={() => setPass.mutate()} disabled={newPass.trim().length < 4 || setPass.isPending} className="rounded-xl bg-navy text-white font-bold px-5 py-2 disabled:opacity-40">{pass.data?.isSet ? "変更する" : "設定する"}</button>
        </div>
        {setPass.isSuccess && <p className="mt-2 font-bold text-leaf">設定しました</p>}
      </section>
      <p className="text-ink-soft">受付の「お住まいの町」「老人会」の選択肢です。iPad では最初にこの老人会から選びます。1行に1つ書いてください。並び順がそのまま受付の画面の順番になります。地図に色を付けるには、町名を地図の町名（「豊中市の町名を読み込む」で入る名前）にそろえてください。読み込んだあとは「保存する」を押します。</p>
      <div className="grid gap-6 md:grid-cols-2">
        <div><div className="flex items-center justify-between gap-2"><label htmlFor="towns" className="font-bold">町名</label><button type="button" onClick={loadTowns} disabled={!geo.data} className="text-sm rounded-lg border-2 border-line px-2 py-1 font-bold">豊中市の町名（{geo.data?.features.length ?? "…"}）を読み込む</button></div><textarea id="towns" value={town} onChange={(e) => setTown(e.target.value)} rows={12} className="inp mt-1 font-normal" /></div>
        <label className="block"><span className="font-bold">老人会</span><textarea value={club} onChange={(e) => setClub(e.target.value)} rows={12} className="inp mt-1 font-normal" /></label>
      </div>
      <button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-xl bg-navy text-white font-bold px-6 py-3">{save.isSuccess ? "保存しました" : "保存する"}</button>
    </div>
  );
}
