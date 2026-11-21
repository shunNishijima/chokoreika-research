// 管理画面。Google アカウント（許可リスト）でログインした運営だけが使う。
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, Navigate, Route, Routes } from "react-router";
import { api, ApiError } from "../lib/api";
import { Dashboard } from "./Dashboard";
import { Events } from "./Events";
import { Participants } from "./Participants";
import { Settings } from "./Settings";

declare global {
  interface Window { google?: { accounts: { id: { initialize: (o: object) => void; renderButton: (el: HTMLElement, o: object) => void } } } }
}

export function Admin() {
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ email: string }>("/api/admin/me").catch((e) => { if (e instanceof ApiError && e.status === 401) return null; throw e; }),
  });
  if (me.isLoading) return <p className="p-10 text-xl">読み込み中…</p>;
  if (!me.data) return <Login />;
  return <Shell email={me.data.email} />;
}

function Login() {
  const qc = useQueryClient();
  const btn = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const cfg = useQuery({ queryKey: ["auth-config"], queryFn: () => api<{ googleClientId: string; devBypass: boolean }>("/api/auth/config") });

  useEffect(() => {
    const id = cfg.data?.googleClientId;
    if (!id || !btn.current) return;
    const render = () => {
      window.google!.accounts.id.initialize({
        client_id: id,
        callback: async ({ credential }: { credential: string }) => {
          try {
            await api("/api/auth/google", { method: "POST", body: JSON.stringify({ credential }) });
            qc.invalidateQueries({ queryKey: ["me"] });
          } catch {
            setError("このアカウントには管理者の権限がありません。");
          }
        },
      });
      window.google!.accounts.id.renderButton(btn.current!, { theme: "outline", size: "large", text: "signin_with", locale: "ja" });
    };
    if (window.google) return render();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = render;
    document.head.appendChild(s);
  }, [cfg.data, qc]);

  return (
    <main className="min-h-full grid place-items-center p-6">
      <div className="bg-card rounded-3xl shadow-md p-10 w-full max-w-md text-center screen-in">
        <h1 className="text-3xl font-bold mb-2">管理画面</h1>
        <p className="text-lg text-ink-soft mb-8">運営の Google アカウントでログインしてください</p>
        {cfg.data?.googleClientId ? <div ref={btn} className="flex justify-center min-h-11" /> : <p className="text-ink-soft">Google ログインが未設定です（GOOGLE_CLIENT_ID）。</p>}
        {error && <p role="alert" className="mt-6 font-bold text-alert">{error}</p>}
      </div>
    </main>
  );
}

const tabs = [["", "ダッシュボード"], ["events", "開催"], ["participants", "参加者"], ["settings", "設定"]] as const;

function Shell({ email }: { email: string }) {
  const qc = useQueryClient();
  const logout = async () => { await api("/api/auth/logout", { method: "POST" }); qc.setQueryData(["me"], null); };
  return (
    <div className="min-h-full">
      <header className="no-print bg-card border-b border-line sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 flex items-center gap-6 h-16">
          <span className="font-bold text-lg whitespace-nowrap">朝ご飯会 管理</span>
          <nav className="flex gap-1 overflow-x-auto">
            {tabs.map(([to, label]) => (
              <NavLink key={to} to={`/admin/${to}`} end
                className={({ isActive }) => `px-4 py-2 rounded-xl text-base font-bold whitespace-nowrap ${isActive ? "bg-navy text-white" : "text-ink hover:bg-paper"}`}>{label}</NavLink>
            ))}
          </nav>
          {email === "認証なし" ? null : <>
            <span className="ml-auto text-sm text-ink-soft hidden md:inline">{email}</span>
            <button onClick={logout} className="text-sm font-bold rounded-xl border-2 border-line px-3 py-2">ログアウト</button>
          </>}
        </div>
        {email === "認証なし" && (
          <p role="note" className="bg-alert-soft text-alert font-bold text-sm px-6 py-2 text-center">
            この管理画面はログインなしで開けます。URL を知っている人は誰でも、名前などの参加者情報を見られます。URL は運営の中だけで共有してください。
          </p>
        )}
      </header>
      <div className="max-w-7xl mx-auto px-6 py-8">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="events" element={<Events />} />
          <Route path="participants" element={<Participants />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </div>
    </div>
  );
}
