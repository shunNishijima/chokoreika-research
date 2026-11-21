// ネコ受付（/neko）。運営が老人会と会の種類を入れて始め、待ち受け中はネコがうろうろしている。
// 流れ: 待ち受け → はじめて？ → 挨拶と気分 → （はじめて）同意 → 名前 → 性別 → 豆知識 → 昭和何年 → ID をお知らせ → また会いにきてね
//                                      （来たことある）ID 入力 → 豆知識 → また会いにきてね
//       かえる: ID 入力 → またね
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError, jpDate } from "../lib/api";
import { ClubPicker, DeviceSetup, EventPicker } from "../kiosk/Kiosk";
import * as Cats from "./cats";
import "./neko.css";

type Ev = { id: number; date: string; kind: string; host: string };
type Draft = { isNew: boolean; mood: number; consent: boolean; name: string; gender: string; birthYear: number | null };
type Screen =
  | { name: "idle" }
  | { name: "first" }
  | { name: "mood" }
  | { name: "consent" }
  | { name: "name" }
  | { name: "gender" }
  | { name: "trivia" }
  | { name: "birth" }
  | { name: "id"; purpose: "in" | "out" }
  | { name: "idShow"; code: string }
  | { name: "bye"; kind: "new" | "in" | "already" | "out"; who: string | null };

const EVENT_KEY = "choko-neko-event";
const IDLE_MS = 90_000;
const KINDS = ["朝ご飯会", "映画会", "ご飯会", "体操"];
const NEW_STEPS: Screen["name"][] = ["mood", "consent", "name", "gender", "trivia", "birth"];

// 内容は運営の方が確認して差し替えてよい（出典を確認したものだけを置く）
const TRIVIA = [
  "ネコは とてもよく眠る動物です。\n「寝る子」が「ねこ」の名前の由来、という説もあります。",
  "ネコは 甘い味を ほとんど感じないと 言われています。",
  "ネコの肉球は 汗をかきます。\n緊張すると しっとりするそうです。",
  "招き猫は、右手を上げているとお金を、\n左手を上げていると人を招く、と言われています。",
  "ネコのひげは、せまい所を通れるか\nたしかめるのに 役立っていると言われています。",
  "ネコがのどを「ゴロゴロ」鳴らすのは、\n安心しているときが 多いそうです。",
];

export function greeting(hour: number) {
  if (hour >= 5 && hour < 11) return "おはようございます";
  if (hour >= 11 && hour < 18) return "こんにちは";
  return "こんばんは";
}

const Svg = ({ html, className }: { html: string; className?: string }) => <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;

export function Neko() {
  const [eventId, setEventId] = useState<number | null>(() => Number(localStorage.getItem(EVENT_KEY)) || null);
  const [club, setClub] = useState<string | null>(null);
  const mode = useQuery({ queryKey: ["auth-config"], queryFn: () => api<{ open: boolean }>("/api/auth/config") });
  const clubs = useQuery({
    queryKey: ["kiosk-clubs"],
    queryFn: () => api<string[]>("/api/kiosk/clubs").catch((e) => { if (e instanceof ApiError && e.status === 401) return null; throw e; }),
  });
  const open = (id: number) => { localStorage.setItem(EVENT_KEY, String(id)); setEventId(id); };
  const leave = () => { localStorage.removeItem(EVENT_KEY); setEventId(null); setClub(null); clubs.refetch(); };

  if (eventId) return <NekoEvent eventId={eventId} onLeave={leave} />;
  if (clubs.isLoading || mode.isLoading) return <div className="nk-root nk-center"><p className="nk-q">じゅんび中…</p></div>;
  if (clubs.data === null) return <DeviceSetup onDone={() => clubs.refetch()} />;
  if (mode.data?.open) return <Setup clubs={clubs.data ?? []} onOpen={open} />;
  if (!club) return <ClubPicker clubs={clubs.data ?? []} onPick={setClub} />;
  return <EventPicker club={club} onBack={() => setClub(null)} onOpen={open} />;
}

// ---------- 運営: 老人会と会の種類を入れて始める ----------
function Setup({ clubs, onOpen }: { clubs: string[]; onOpen: (id: number) => void }) {
  const [club, setClub] = useState(clubs[0] ?? "");
  const [kind, setKind] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const start = async () => {
    if (!club.trim() || !kind.trim()) return setMsg("老人会の名前と、何の会かを入れてください。");
    setBusy(true);
    try {
      const ev = await api<{ id: number }>("/api/kiosk/events", { method: "POST", body: JSON.stringify({ club: club.trim(), kind: kind.trim() }) });
      onOpen(ev.id);
    } catch {
      setMsg("うまく始められませんでした。もう一度押してください。");
      setBusy(false);
    }
  };
  return (
    <div className="nk-root nk-admin">
      <main className="nk-page nk-in">
        <p className="nk-sub">運営の方へ</p>
        <h1 className="nk-q">ネコ受付をはじめる</h1>
        <label className="nk-label" htmlFor="nk-club">老人会の名前</label>
        <input id="nk-club" className="nk-input" value={club} onChange={(e) => setClub(e.target.value)} maxLength={40} placeholder="例: みゆき会" />
        {clubs.length > 0 && <div className="nk-chips">{clubs.map((c) => <button key={c} onClick={() => setClub(c)} aria-pressed={club === c}>{c}</button>)}</div>}
        <label className="nk-label" htmlFor="nk-kind">何の会ですか</label>
        <input id="nk-kind" className="nk-input" value={kind} onChange={(e) => setKind(e.target.value)} maxLength={40} placeholder="例: 朝ご飯会" />
        <div className="nk-chips">{KINDS.map((k) => <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k}>{k}</button>)}</div>
        {msg && <p role="alert" className="nk-msg">{msg}</p>}
        <button className="nk-btn nk-primary nk-mt" onClick={start} disabled={busy}>この会で受付をはじめる</button>
        <a className="nk-link" href="/admin">管理画面（出席一覧・集計）へ</a>
      </main>
    </div>
  );
}

// ---------- 受付本体 ----------
function NekoEvent({ eventId, onLeave }: { eventId: number; onLeave: () => void }) {
  const session = useQuery({
    queryKey: ["neko-session", eventId],
    queryFn: () => api<{ event: Ev }>(`/api/kiosk/events/${eventId}/session`),
    retry: false,
  });
  const [screen, setScreen] = useState<Screen>({ name: "idle" });
  const draft = useRef<Draft>({ isNew: true, mood: 3, consent: false, name: "", gender: "", birthYear: null });
  const last = useRef(Date.now());
  const rootRef = useRef<HTMLDivElement>(null);
  const go = useCallback((s: Screen) => { last.current = Date.now(); setScreen(s); window.scrollTo(0, 0); }, []);

  useEffect(() => { if (session.error) onLeave(); }, [session.error, onLeave]);

  // 操作がないまま 90 秒たったら待ち受けに戻る
  useEffect(() => {
    const t = window.setInterval(() => {
      if (screen.name !== "idle" && screen.name !== "bye" && Date.now() - last.current > IDLE_MS) go({ name: "idle" });
    }, 5000);
    return () => window.clearInterval(t);
  }, [screen.name, go]);

  // タップした所に肉球が出る
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onDown = (e: PointerEvent) => {
      last.current = Date.now();
      const el = document.createElement("span");
      el.className = "nk-tap";
      el.style.left = `${e.clientX}px`;
      el.style.top = `${e.clientY}px`;
      el.innerHTML = Cats.paw("#e0853a");
      root.appendChild(el);
      window.setTimeout(() => el.remove(), 700);
    };
    root.addEventListener("pointerdown", onDown);
    return () => root.removeEventListener("pointerdown", onDown);
  }, []);

  const ev = session.data?.event;
  if (!ev) return <div className="nk-root nk-center"><p className="nk-q">じゅんび中…</p></div>;

  const d = draft.current;
  const register = async () => {
    const body = d.consent
      ? { consent: true, name: d.name || null, gender: d.gender || null, birthYear: d.birthYear, mood: d.mood }
      : { consent: false, mood: d.mood };
    const r = await api<{ code: string }>(`/api/kiosk/events/${ev.id}/register`, { method: "POST", body: JSON.stringify(body) });
    go({ name: "idShow", code: r.code });
  };
  const step = NEW_STEPS.indexOf(screen.name);

  return (
    <div className="nk-root" ref={rootRef}>
      {screen.name === "idle" ? (
        <Idle ev={ev} onStart={() => go({ name: "first" })} onLeave={onLeave} />
      ) : (
        <main className="nk-page">
          <div className="nk-top">
            <span>{ev.host}　{ev.kind}</span>
            {d.isNew && step >= 0 ? <Progress at={step} total={NEW_STEPS.length} /> : <span />}
            <span>{jpDate(ev.date)}</span>
          </div>
          <div className="nk-in" key={screen.name + ("purpose" in screen ? screen.purpose : "")}>
            {screen.name === "first" && (
              <>
                <h1 className="nk-q">ここに来たのは はじめて？</h1>
                <div className="nk-grid2 nk-stagger">
                  <button className="nk-btn nk-tall nk-primary" onClick={() => { draft.current = { isNew: true, mood: 3, consent: false, name: "", gender: "", birthYear: null }; go({ name: "mood" }); }}>
                    はい<span className="nk-small">はじめて</span>
                  </button>
                  <button className="nk-btn nk-tall" onClick={() => { draft.current = { ...draft.current, isNew: false }; go({ name: "mood" }); }}>
                    来たこと<br />ある<span className="nk-small">IDで入る</span>
                  </button>
                </div>
                <button className="nk-btn nk-out nk-mt" onClick={() => go({ name: "id", purpose: "out" })}>かえる（退出）</button>
                <Row><Back onClick={() => go({ name: "idle" })} /></Row>
              </>
            )}
            {screen.name === "mood" && (
              <MoodPick onPick={(v) => { d.mood = v; go(d.isNew ? { name: "consent" } : { name: "id", purpose: "in" }); }} onBack={() => go({ name: "first" })} />
            )}
            {screen.name === "consent" && (
              <>
                <h1 className="nk-q">お名前や 生まれ年を<br />記録してもいいですか？</h1>
                <p className="nk-hint">会をよくするためだけに使います。ほかの人には見えません。</p>
                <div className="nk-grid2 nk-stagger">
                  <button className="nk-btn nk-tall nk-primary" onClick={() => { d.consent = true; go({ name: "name" }); }}>はい</button>
                  <button className="nk-btn nk-tall" onClick={() => { d.consent = false; d.name = ""; d.gender = ""; d.birthYear = null; go({ name: "trivia" }); }}>いいえ</button>
                </div>
                <Row><Back onClick={() => go({ name: "mood" })} /></Row>
              </>
            )}
            {screen.name === "name" && <NameInput initial={d.name} onNext={(n) => { d.name = n; go({ name: "gender" }); }} onBack={() => go({ name: "consent" })} />}
            {screen.name === "gender" && (
              <>
                <h1 className="nk-q">あなたについて 教えてね</h1>
                <div className="nk-grid2 nk-stagger">
                  {(["女性", "男性"] as const).map((g) => (
                    <button key={g} className="nk-btn nk-tall nk-person" onClick={() => { d.gender = g; go({ name: "trivia" }); }}>
                      <Person g={g} />{g === "女性" ? "女" : "男"}
                    </button>
                  ))}
                </div>
                <Row><Back onClick={() => go({ name: "name" })} /><button className="nk-btn nk-sub" onClick={() => { d.gender = "答えない"; go({ name: "trivia" }); }}>こたえない</button></Row>
              </>
            )}
            {screen.name === "trivia" && (
              <Trivia
                onNext={() => {
                  if (!d.isNew) return go({ name: "bye", kind: "in", who: d.name || null });
                  if (d.consent) return go({ name: "birth" });
                  register().catch(() => go({ name: "first" }));
                }}
                onBack={() => go(d.isNew ? (d.consent ? { name: "gender" } : { name: "consent" }) : { name: "id", purpose: "in" })}
              />
            )}
            {screen.name === "birth" && (
              <BirthYear initial={d.birthYear} onBack={() => go({ name: "trivia" })} onDone={async (y) => { d.birthYear = y; await register(); }} />
            )}
            {screen.name === "id" && (
              <IdPad
                purpose={screen.purpose}
                onBack={() => go(screen.purpose === "in" ? { name: "mood" } : { name: "first" })}
                onSubmit={async (code) => {
                  if (screen.purpose === "in") {
                    const r = await api<{ status: string; name: string | null }>(`/api/kiosk/events/${ev.id}/checkin`, { method: "POST", body: JSON.stringify({ code, mood: d.mood }) });
                    if (r.status === "unknown") return "その ID は 見つかりませんでした。";
                    d.name = r.name ?? "";
                    if (r.status === "already") go({ name: "bye", kind: "already", who: r.name });
                    else go({ name: "trivia" });
                  } else {
                    const r = await api<{ status: string; name: string | null }>(`/api/kiosk/events/${ev.id}/checkout`, { method: "POST", body: JSON.stringify({ code }) });
                    if (r.status === "unknown") return "その ID は 見つかりませんでした。";
                    if (r.status === "not-checked-in") return "今日は まだ 入室していないみたい。運営の人に 声をかけてね。";
                    go({ name: "bye", kind: "out", who: r.name });
                  }
                  return null;
                }}
              />
            )}
            {screen.name === "idShow" && <IdShow code={screen.code} onNext={() => go({ name: "bye", kind: "new", who: d.name || null })} />}
            {screen.name === "bye" && <Bye kind={screen.kind} who={screen.who} onEnd={() => go({ name: "idle" })} />}
          </div>
          {screen.name !== "bye" && screen.name !== "idShow" && <Svg className="nk-peek" html={Cats.peek(step % 2 ? "sabi" : "tora")} />}
        </main>
      )}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="nk-row">{children}</div>;
}
function Back({ onClick }: { onClick: () => void }) {
  return <button className="nk-btn nk-sub" onClick={onClick}>もどる</button>;
}

function Progress({ at, total }: { at: number; total: number }) {
  return (
    <span className="nk-progress" aria-label={`${at + 1} / ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <Svg key={i} className={i < at ? "nk-paw on" : i === at ? "nk-paw now" : "nk-paw"} html={Cats.paw(i <= at ? "#e0853a" : "#e6d8c5")} />
      ))}
    </span>
  );
}

// ---------- 待ち受け ----------
function Idle({ ev, onStart, onLeave }: { ev: Ev; onStart: () => void; onLeave: () => void }) {
  const [waking, setWaking] = useState(false);
  const [menu, setMenu] = useState(false);
  const hold = useRef<number | undefined>(undefined);
  // タップするとネコが起きて、少し喜んでから始まる
  const start = () => { if (waking) return; setWaking(true); window.setTimeout(onStart, 1500); };
  if (menu) {
    return (
      <main className="nk-page nk-in nk-admin">
        <h1 className="nk-q">運営メニュー</h1>
        <p className="nk-hint">{ev.host}　{ev.kind}（{jpDate(ev.date)}）</p>
        <div className="nk-grid1">
          <a className="nk-btn" href="/admin">管理画面（出席一覧・集計）</a>
          <button className="nk-btn" onClick={onLeave}>会を変える</button>
          <button className="nk-btn nk-primary" onClick={() => setMenu(false)}>受付にもどる</button>
        </div>
      </main>
    );
  }
  return (
    <div className={`nk-idle${waking ? " waking" : ""}`} role="button" aria-label="ネコをタップして はじめる" onClick={start}>
      <div className="nk-sky"><span className="nk-cloud a" /><span className="nk-cloud b" /></div>
      <div className="nk-floor" />
      <div className="nk-title">
        <div className="nk-club">{ev.host}　{ev.kind}</div>
        <div className="nk-tapme">{waking ? "おはよう！" : "ネコを タップして おこしてね"}</div>
      </div>
      <Svg className="nk-fly" html={Cats.butterfly()} />
      <div className="nk-bed">
        <Svg key={waking ? "awake" : "sleep"} className={waking ? "nk-wake" : ""} html={Cats.lying("tora", waking ? "happy" : "sleep")} />
        {waking && <span className="nk-nya">にゃっ！</span>}
      </div>
      <button
        className="nk-op"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.classList.add("holding"); hold.current = window.setTimeout(() => setMenu(true), 1500); }}
        onPointerUp={(e) => { e.currentTarget.classList.remove("holding"); window.clearTimeout(hold.current); }}
        onPointerLeave={(e) => { e.currentTarget.classList.remove("holding"); window.clearTimeout(hold.current); }}
        onContextMenu={(e) => e.preventDefault()}
      >運営（長押し）<i /></button>
    </div>
  );
}

// ---------- 気分 ----------
const MOODS = [
  { v: 5, label: "るんるん", face: "good" as const },
  { v: 3, label: "ふつう", face: "mid" as const },
  { v: 1, label: "ゆううつ…", face: "bad" as const },
];
function MoodPick({ onPick, onBack }: { onPick: (v: number) => void; onBack: () => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const pick = (v: number) => { if (picked) return; setPicked(v); window.setTimeout(() => onPick(v), 900); };
  return (
    <>
      <h1 className="nk-q">{greeting(new Date().getHours())}！<br />今日の気分は…？</h1>
      <div className="nk-grid1 nk-stagger">
        {MOODS.map((m) => (
          <button key={m.v} className={`nk-btn nk-mood${picked === m.v ? " chosen" : ""}${picked && picked !== m.v ? " dim" : ""}`} onClick={() => pick(m.v)}>
            <Svg className="nk-face" html={Cats.face("tora", m.face)} />
            <span>{m.label}</span>
            {picked === m.v && <span className="nk-burst" aria-hidden="true">{Array.from({ length: 10 }, (_, k) => <i key={k} style={{ ["--a" as string]: `${k * 36}deg` }} />)}</span>}
          </button>
        ))}
      </div>
      <p className="nk-thanks" aria-live="polite">{picked ? "おしえてくれて ありがとう！" : ""}</p>
      <Row><Back onClick={onBack} /></Row>
    </>
  );
}

// ---------- 名前 ----------
function NameInput({ initial, onNext, onBack }: { initial: string; onNext: (n: string) => void; onBack: () => void }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState("");
  const next = () => (v.trim() ? onNext(v.trim()) : setMsg("お名前を 入れてください。"));
  return (
    <>
      <h1 className="nk-q">お名前を 教えてください</h1>
      <p className="nk-hint">ニックネームでも いいです。</p>
      <input className="nk-input nk-big" value={v} maxLength={20} autoFocus autoComplete="off" aria-label="お名前"
        onChange={(e) => { setV(e.target.value); setMsg(""); }} onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && next()} />
      {msg && <p role="alert" className="nk-msg">{msg}</p>}
      <Row><Back onClick={onBack} /><button className="nk-btn nk-primary" onClick={next}>つぎへ</button></Row>
    </>
  );
}

function Person({ g }: { g: "女性" | "男性" }) {
  const col = g === "女性" ? "#e07a8a" : "#5b8bd0";
  return (
    <svg viewBox="0 0 100 110" aria-hidden="true" className="nk-person-ic">
      <circle cx="50" cy="28" r="20" fill="#fde2c8" stroke="#5a3d2b" strokeWidth="4" />
      {g === "女性"
        ? <polygon points="50,52 22,104 78,104" fill={col} stroke="#5a3d2b" strokeWidth="4" strokeLinejoin="round" />
        : <polygon points="22,52 78,52 50,104" fill={col} stroke="#5a3d2b" strokeWidth="4" strokeLinejoin="round" />}
    </svg>
  );
}

// ---------- 豆知識 ----------
function Trivia({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [t] = useState(() => TRIVIA[Math.floor(Math.random() * TRIVIA.length)]);
  return (
    <>
      <h1 className="nk-q nk-c">ネコの豆知識</h1>
      <div className="nk-trivia-cat"><Svg html={Cats.lying("tora", "awake")} /><span className="nk-think">!</span></div>
      <div className="nk-trivia">{t}</div>
      <Row><Back onClick={onBack} /><button className="nk-btn nk-primary" onClick={onNext}>すすむ</button></Row>
    </>
  );
}

// ---------- 生まれ年（昭和何年だけ） ----------
function BirthYear({ initial, onDone, onBack }: { initial: number | null; onDone: (y: number | null) => Promise<void>; onBack: () => void }) {
  const [sel, setSel] = useState<number | null>(initial ? initial - 1925 : null);
  const [decade, setDecade] = useState<number | null>(initial ? Math.floor((initial - 1925) / 10) * 10 : null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const done = async (y: number | null) => {
    setBusy(true);
    try { await onDone(y); } catch { setMsg("うまく登録できませんでした。もう一度押してください。"); setBusy(false); }
  };
  return (
    <>
      <h1 className="nk-q">さいごの質問だよ！<br />昭和 何年 生まれ？</h1>
      {decade === null ? (
        <div className="nk-decades nk-stagger" key="d">
          {[0, 10, 20, 30, 40, 50, 60].map((d0) => (
            <button key={d0} className="nk-btn" onClick={() => setDecade(d0)}>{d0 === 0 ? "元〜9" : `${d0}〜${Math.min(64, d0 + 9)}`}<span className="nk-unit">年</span></button>
          ))}
        </div>
      ) : (
        <div className="nk-years nk-stagger" key={decade}>
          {Array.from({ length: Math.min(64, decade + 9) - Math.max(1, decade) + 1 }, (_, i) => Math.max(1, decade) + i).map((n) => (
            <button key={n} className={`nk-btn${sel === n ? " on" : ""}`} onClick={() => setSel(n)} aria-pressed={sel === n}>{n === 1 ? "元" : n}</button>
          ))}
          <button className="nk-btn nk-sub" onClick={() => { setDecade(null); setSel(null); }}>ほかの年</button>
        </div>
      )}
      <p className="nk-picked" aria-live="polite">{sel ? <>昭和 <b>{sel === 1 ? "元" : sel}</b> 年（{sel + 1925}年）生まれ</> : decade === null ? "だいたいの年を えらんでね" : "数字を えらんでね"}</p>
      {msg && <p role="alert" className="nk-msg">{msg}</p>}
      <Row>
        <Back onClick={() => (decade === null ? onBack() : (setDecade(null), setSel(null)))} />
        <button className="nk-btn nk-sub" disabled={busy} onClick={() => done(null)}>こたえない</button>
        <button className="nk-btn nk-primary" disabled={!sel || busy} onClick={() => sel && done(sel + 1925)}>これでOK</button>
      </Row>
    </>
  );
}

// ---------- ID 入力（入室・退出） ----------
function IdPad({ purpose, onSubmit, onBack }: { purpose: "in" | "out"; onSubmit: (code: string) => Promise<string | null>; onBack: () => void }) {
  const [v, setV] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const submit = async (code: string) => {
    if (!code || busy) return;
    setBusy(true);
    try {
      const err = await onSubmit(code.padStart(4, "0"));
      if (err) { setMsg(err); setV(""); setShake((n) => n + 1); setBusy(false); }
    } catch {
      setMsg("うまく いきませんでした。もう一度 押してください。");
      setBusy(false);
    }
  };
  const press = (k: string) => {
    setMsg("");
    if (k === "けす") return setV((s) => s.slice(0, -1));
    if (k === "けってい") return submit(v);
    if (v.length >= 4) return;
    const next = v + k;
    setV(next);
    if (next.length === 4) window.setTimeout(() => submit(next), 250);
  };
  return (
    <>
      <h1 className="nk-q">{purpose === "in" ? "あなたの ID を 押してね" : "かえるときも ID を 押してね"}</h1>
      <div className="nk-idpad">
        <div className="nk-idleft">
          <div className={`nk-digits${shake ? " shake" : ""}`} key={shake} aria-label="入力した ID">
            {[0, 1, 2, 3].map((i) => <span key={i} className={v[i] ? "on" : ""}>{v[i] ?? ""}</span>)}
          </div>
          {msg ? <p role="alert" className="nk-msg">{msg}</p> : <p className="nk-hint nk-c">はじめての日に もらった<br />4けたの 数字です</p>}
          <Back onClick={onBack} />
        </div>
        <div className="nk-keypad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "けす", "0", "けってい"].map((k) => (
            <button key={k} className={k === "けってい" ? "nk-primary" : k === "けす" ? "nk-subkey" : ""} disabled={busy} onClick={() => press(k)}>{k}</button>
          ))}
        </div>
      </div>
    </>
  );
}

// ---------- ID のお知らせ ----------
function IdShow({ code, onNext }: { code: string; onNext: () => void }) {
  return (
    <div className="nk-idshow">
      <h1 className="nk-q nk-c">あなたの ID は</h1>
      <div className="nk-card">
        <div className="nk-card-digits">{code.split("").map((c, i) => <span key={i} style={{ animationDelay: `${300 + i * 220}ms` }}>{c}</span>)}</div>
        <Svg className="nk-card-cat" html={Cats.lying("tora", "happy")} />
      </div>
      <p className="nk-hint nk-c">次から この番号で 入れます。<br />運営の人に メモを もらってね。</p>
      <Row><button className="nk-btn nk-primary" onClick={onNext}>おぼえた！</button></Row>
    </div>
  );
}

// ---------- また会いにきてね ----------
function Bye({ kind, who, onEnd }: { kind: "new" | "in" | "already" | "out"; who: string | null; onEnd: () => void }) {
  useEffect(() => { const t = window.setTimeout(onEnd, 9000); return () => window.clearTimeout(t); }, [onEnd]);
  const [bits] = useState(() => Array.from({ length: 22 }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 1.6, dur: 2.6 + Math.random() * 1.8, rot: Math.random() * 360,
    color: ["#e0853a", "#ff8fa0", "#ffd34d", "#a9b2bc", "#8fd0ff"][i % 5],
  })));
  const san = who ? `${who}さん、` : "";
  const line = kind === "out" ? `${san}おつかれさま！` : kind === "already" ? `${san}今日はもう 受付ずみだよ` : kind === "in" ? `${san}おかえりなさい！` : `${san}ようこそ！`;
  return (
    <div className="nk-bye">
      <div className="nk-confetti" aria-hidden="true">
        {bits.map((b, i) => (
          <span key={i} style={{ left: `${b.left}%`, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, ["--r" as string]: `${b.rot}deg` }}><Svg html={Cats.paw(b.color)} /></span>
        ))}
      </div>
      <p className="nk-byeline">{line}</p>
      <div className="nk-bubble">また 会いにきてね</div>
      <div className="nk-jump"><Svg html={Cats.lying("tora", "happy")} /></div>
      <Row><button className="nk-btn nk-primary" onClick={onEnd}>おわる</button></Row>
    </div>
  );
}
