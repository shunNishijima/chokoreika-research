import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import { Kiosk } from "./kiosk/Kiosk";
import { Admin } from "./admin/Admin";
import { Neko } from "./neko/Neko";

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

function Landing() {
  return (
    <main className="min-h-full grid place-items-center p-6">
      <div className="max-w-xl w-full text-center screen-in">
        <h1 className="text-4xl font-bold mb-3">朝ご飯会 受付</h1>
        <p className="text-xl text-ink-soft mb-10">超幸齢化プロジェクト</p>
        <div className="grid gap-4">
          <Link to="/admin" className="block rounded-2xl bg-navy text-white text-2xl font-bold py-6">運営・管理画面へ</Link>
          <Link to="/neko" className="block rounded-2xl bg-sun text-white text-2xl font-bold py-6">ネコ受付をはじめる</Link>
          <p className="text-lg text-ink-soft">iPad の受付画面は、管理画面の「開催」から開きます。</p>
        </div>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/kiosk" element={<Kiosk />} />
          <Route path="/neko" element={<Neko />} />
          <Route path="/admin/*" element={<Admin />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
