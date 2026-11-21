// iPad の受付画面。運営のシニアが操作する前提で、大きな文字・1画面1つのこと・いつでも戻れる作り。
// 流れ: 端末の登録（初回のみ）→ 老人会を選ぶ → イベントを開く → ようこそ（今の気持ち）→ はじめて / 2回目以降 → 受付 → 退出
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { api, ApiError, jpDate, type Choices, type EventInfo } from "../lib/api";
import { CardIcon, CheckIcon, SparkIcon, SpeakerIcon } from "./icons";
import { QrScanner } from "./QrScanner";
import { CardPreview } from "./CardPreview";
import { MoodPicker } from "./Mood";

// 質問は管理画面の「アンケート」で追加・編集した内容をサーバーから受け取る
export type SurveyQuestion = { id: number; key: string; title: string; hint: string; type: "single" | "text"; options: string[]; optional: boolean; builtin: boolean };
type Session = { event: EventInfo; options: { town: string[]; club: string[] }; choices: Choices; questions?: SurveyQuestion[] };
type Screen =
  | { name: "welcome" }
  | { name: "mood" }
  | { name: "choose"; mood: number }
  | { name: "new"; mood: number; step: number }
  | { name: "id"; mood: number }
  | { name: "done"; code: string; who: string | null; isNew: boolean; already?: boolean; nextDate: string | null }
  | { name: "out-id" }
  | { name: "out-mood"; code: string }
  | { name: "bye"; who: string | null; nextDate: string | null };

const EVENT_KEY = "choko-kiosk-event";
const IDLE_MS = 90_000;
const DONE_MS = 12_000;

function useSpeech() {
  const [on, setOn] = useState(() => localStorage.getItem("choko-speech") === "1");
  const toggle = () => setOn((v) => { localStorage.setItem("choko-speech", v ? "0" : "1"); return !v; });
  const say = useCallback((text: string) => {
    if (!on || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  }, [on]);
  return { on, toggle, say };
}

const san = (who: string | null) => (who ? `${who}さん` : "");

export function Kiosk() {
  const [params, setParams] = useSearchParams();
  const [eventId, setEventId] = useState<number | null>(() => Number(localStorage.getItem(EVENT_KEY)) || null);
  const [token, setToken] = useState<string | undefined>(undefined);
  const [club, setClub] = useState<string | null>(null);

  // 管理画面の QR から来た場合（?e=イベントID&t=受付トークン）
  useEffect(() => {
    const e = Number(params.get("e"));
    const t = params.get("t");
    if (e && t) {
      setEventId(e);
      setToken(t);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const clubs = useQuery({
    queryKey: ["kiosk-clubs"],
    queryFn: () => api<string[]>("/api/kiosk/clubs").catch((e) => { if (e instanceof ApiError && e.status === 401) return null; throw e; }),
    enabled: !token,
  });

  const open = (id: number) => { localStorage.setItem(EVENT_KEY, String(id)); setEventId(id); };
  const leave = () => { localStorage.removeItem(EVENT_KEY); setEventId(null); setToken(undefined); setClub(null); clubs.refetch(); };

  const mode = useQuery({ queryKey: ["auth-config"], queryFn: () => api<{ open: boolean }>("/api/auth/config") });

  if (eventId) return <EventKiosk eventId={eventId} token={token} onLeave={leave} />;
  if (clubs.isLoading || mode.isLoading) return <Center><p className="text-3xl">準備しています…</p></Center>;
  if (clubs.data === null) return <DeviceSetup onDone={() => clubs.refetch()} />;
  // 試用モード: 運営がその場で「老人会」と「会の種類」を入れて始める
  if (mode.data?.open) return <StartEvent clubs={clubs.data ?? []} onOpen={open} />;
  if (!club) return <ClubPicker clubs={clubs.data ?? []} onPick={setClub} />;
  return <EventPicker club={club} onBack={() => setClub(null)} onOpen={open} />;
}

function Center({ children }: { children: React.ReactNode }) {
  return <main className="min-h-full grid place-items-center p-8 text-center screen-in"><div>{children}</div></main>;
}

function BigBack({ onClick, label = "← 戻る" }: { onClick: () => void; label?: string }) {
  return <button onClick={onClick} className="rounded-2xl border-4 border-line bg-card text-3xl font-bold px-10 min-h-24">{label}</button>;
}

// ---------- 運営: 端末の登録 ----------
export function DeviceSetup({ onDone }: { onDone: () => void }) {
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState("");
  const submit = async () => {
    try {
      await api("/api/kiosk/device", { method: "POST", body: JSON.stringify({ passcode: pass }) });
      onDone();
    } catch (e) {
      setMsg(e instanceof ApiError && e.status === 429 ? "何度も間違えたため、5分ほど待ってからやり直してください。" : "合言葉が違います。");
    }
  };
  return (
    <Center>
      <h1 className="text-5xl font-bold mb-4">受付の準備</h1>
      <p className="text-2xl text-ink-soft mb-8 leading-relaxed">運営の方へ：この iPad で受付を始めるには、<br />受付の合言葉を入れてください（はじめの1回だけ）。</p>
      <input value={pass} onChange={(e) => setPass(e.target.value)} type="password" autoComplete="off" aria-label="受付の合言葉"
        className="w-full max-w-lg text-4xl text-center rounded-2xl border-4 border-navy bg-card px-6 py-5" onKeyDown={(e) => e.key === "Enter" && submit()} />
      {msg && <p role="alert" className="mt-5 text-2xl font-bold text-alert">{msg}</p>}
      <div className="mt-8"><button onClick={submit} disabled={!pass} className="rounded-2xl bg-navy text-white text-3xl font-bold px-14 min-h-24 disabled:opacity-40">はじめる</button></div>
      <p className="mt-8 text-xl text-ink-soft">合言葉は、管理画面の「設定」で決められます。</p>
    </Center>
  );
}

// ---------- 運営: 老人会と会の種類を入れて始める（試用モード） ----------
const KINDS = ["朝ご飯会", "映画会", "ご飯会", "その他"];

function StartEvent({ clubs, onOpen }: { clubs: string[]; onOpen: (id: number) => void }) {
  const [step, setStep] = useState<"club" | "typing" | "kind" | "next">("club");
  const [club, setClub] = useState("");
  const [typed, setTyped] = useState("");
  const [kind, setKind] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const start = async (nextDate: string | null) => {
    setBusy(true);
    setMsg("");
    try {
      const ev = await api<{ id: number }>("/api/kiosk/events", { method: "POST", body: JSON.stringify({ club, kind, nextDate }) });
      onOpen(ev.id);
    } catch {
      setMsg("うまく始められませんでした。もう一度押してください。");
      setBusy(false);
    }
  };
  const Head = ({ n, title }: { n: number; title: string }) => (
    <>
      <p className="text-2xl text-ink-soft mt-4">運営の方へ　{n} / 3</p>
      <h1 className="text-5xl font-bold mb-8">{title}</h1>
    </>
  );
  return (
    <main className="min-h-full p-8 screen-in max-w-5xl mx-auto flex flex-col" key={step}>
      {step === "club" && (
        <>
          <Head n={1} title="どの老人会の会ですか？" />
          <div className="grid gap-5 md:grid-cols-2">
            {clubs.map((c) => (
              <button key={c} onClick={() => { setClub(c); setStep("kind"); }} className="rounded-3xl bg-card border-4 border-navy min-h-32 text-4xl font-bold shadow-md active:scale-[.98] transition">{c}</button>
            ))}
            <button onClick={() => setStep("typing")} className="rounded-3xl bg-card border-4 border-dashed border-line min-h-32 text-3xl font-bold active:scale-[.98] transition">＋ 老人会の名前を入れる</button>
          </div>
        </>
      )}
      {step === "typing" && (
        <>
          <Head n={1} title="老人会の名前を入れてください" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={40} autoFocus aria-label="老人会の名前" placeholder="例: みゆき会"
            className="w-full text-5xl rounded-2xl border-4 border-navy bg-card px-6 py-6" />
          <button onClick={() => { setClub(typed.trim()); setStep("kind"); }} disabled={!typed.trim()} className="mt-6 rounded-2xl bg-navy text-white text-4xl font-bold min-h-28 disabled:opacity-40">次へ</button>
          <div className="mt-auto pt-10"><BigBack onClick={() => setStep("club")} /></div>
        </>
      )}
      {step === "kind" && (
        <>
          <Head n={2} title={`${club}の、何の会ですか？`} />
          <div className="grid gap-5 grid-cols-2">
            {KINDS.map((k) => (
              <button key={k} onClick={() => { setKind(k); setStep("next"); }} className="rounded-3xl bg-card border-4 border-navy min-h-36 text-5xl font-bold shadow-md active:scale-[.98] transition">{k}</button>
            ))}
          </div>
          <div className="mt-auto pt-10"><BigBack onClick={() => setStep("club")} /></div>
        </>
      )}
      {step === "next" && (
        <>
          <Head n={3} title="次回はいつですか？" />
          <p className="text-2xl text-ink-soft mb-6">参加カードに書く日付です。決まっていなければ「まだ決まっていない」を押してください。</p>
          <input type="date" value={next} onChange={(e) => setNext(e.target.value)} aria-label="次回の日付" className="w-full max-w-xl text-4xl rounded-2xl border-4 border-navy bg-card px-6 py-5" />
          <div className="grid gap-5 md:grid-cols-2 mt-8">
            <button onClick={() => start(next || null)} disabled={!next || busy} className="rounded-2xl bg-navy text-white text-3xl font-bold min-h-28 disabled:opacity-40">この日付で受付を始める</button>
            <button onClick={() => start(null)} disabled={busy} className="rounded-2xl border-4 border-line bg-card text-3xl font-bold min-h-28">まだ決まっていない</button>
          </div>
          {msg && <p role="alert" className="mt-5 text-2xl font-bold text-alert">{msg}</p>}
          <div className="mt-auto pt-10 flex items-center gap-6">
            <BigBack onClick={() => setStep("kind")} />
            <span className="text-2xl text-ink-soft">{club}・{kind}</span>
          </div>
        </>
      )}
    </main>
  );
}

// ---------- 運営: 老人会を選ぶ ----------
export function ClubPicker({ clubs, onPick }: { clubs: string[]; onPick: (c: string) => void }) {
  return (
    <main className="min-h-full p-8 screen-in max-w-5xl mx-auto flex flex-col">
      <p className="text-2xl text-ink-soft mt-4">運営の方へ</p>
      <h1 className="text-5xl font-bold mb-10">どの老人会の会ですか？</h1>
      {clubs.length === 0 ? <p className="text-2xl bg-sun-soft rounded-2xl p-6">老人会がまだ登録されていません。管理画面の「設定」で登録してください。</p> : (
        <div className="grid gap-6 md:grid-cols-2">
          {clubs.map((c) => (
            <button key={c} onClick={() => onPick(c)} className="rounded-3xl bg-card border-4 border-navy min-h-40 text-5xl font-bold shadow-md active:scale-[.98] transition">{c}</button>
          ))}
        </div>
      )}
    </main>
  );
}

// ---------- 運営: イベントを開く ----------
export function EventPicker({ club, onBack, onOpen }: { club: string; onBack: () => void; onOpen: (id: number) => void }) {
  const q = useQuery({ queryKey: ["kiosk-events", club], queryFn: () => api<EventInfo[]>(`/api/kiosk/events?club=${encodeURIComponent(club)}`) });
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return (
    <main className="min-h-full p-8 screen-in max-w-5xl mx-auto flex flex-col">
      <p className="text-2xl text-ink-soft mt-4">{club}</p>
      <h1 className="text-5xl font-bold mb-10">開く会を選んでください</h1>
      {q.data?.length === 0 && <p className="text-2xl bg-sun-soft rounded-2xl p-6 leading-relaxed">{club}の会がありません。<br />管理画面の「開催」で、主催に「{club}」を選んで会を作ってください。</p>}
      <div className="grid gap-5">
        {q.data?.map((e) => (
          <button key={e.id} onClick={() => onOpen(e.id)} className={`rounded-3xl border-4 min-h-32 px-8 text-left flex items-center justify-between gap-6 shadow-md active:scale-[.99] transition ${e.date === today ? "bg-navy text-white border-navy" : "bg-card border-line"}`}>
            <span>
              <span className="block text-4xl font-bold">{jpDate(e.date)}　{e.kind}</span>
              {e.place && <span className="block text-2xl mt-1 opacity-90">{e.place}</span>}
            </span>
            {e.date === today && <span className="text-2xl font-bold rounded-full bg-white text-navy px-5 py-2">今日</span>}
          </button>
        ))}
      </div>
      <div className="mt-auto pt-10"><BigBack onClick={onBack} label="← 老人会を選び直す" /></div>
    </main>
  );
}

// ---------- 参加者の受付 ----------
function EventKiosk({ eventId, token, onLeave }: { eventId: number; token?: string; onLeave: () => void }) {
  const session = useQuery({
    queryKey: ["kiosk-session", eventId, token],
    queryFn: () => api<Session>(`/api/kiosk/events/${eventId}/session`, { kioskToken: token }),
  });
  const [screen, setScreen] = useState<Screen>({ name: "welcome" });
  const [answers, setAnswers] = useState<Record<string, string | boolean | undefined>>({});
  const speech = useSpeech();
  const idle = useRef<number | undefined>(undefined);
  const call = useCallback(<T,>(path: string, body: unknown) => api<T>(`/api/kiosk/events/${eventId}/${path}`, { method: "POST", kioskToken: token, body: JSON.stringify(body) }), [eventId, token]);
  const toWelcome = useCallback(() => { setAnswers({}); setScreen({ name: "welcome" }); }, []);

  useEffect(() => {
    const reset = () => {
      window.clearTimeout(idle.current);
      if (screen.name !== "welcome") idle.current = window.setTimeout(toWelcome, screen.name === "done" || screen.name === "bye" ? DONE_MS : IDLE_MS);
    };
    reset();
    window.addEventListener("pointerdown", reset);
    return () => { window.removeEventListener("pointerdown", reset); window.clearTimeout(idle.current); };
  }, [screen, toWelcome]);

  if (session.isError) return <Center><h1 className="text-4xl font-bold mb-6">この会を開けませんでした</h1><BigBack onClick={onLeave} label="会を選び直す" /></Center>;
  if (!session.data) return <Center><p className="text-3xl">準備しています…</p></Center>;
  const s = session.data;
  const ev = s.event;

  return (
    <div className="min-h-full flex flex-col">
      <header className="flex items-center justify-between px-8 pt-6 pb-2 text-xl text-ink-soft gap-4">
        <span><span className="font-bold text-ink">{jpDate(ev.date)}</span>　{ev.kind}{ev.host ? `（${ev.host}）` : ""}</span>
        <button onClick={speech.toggle} aria-pressed={speech.on}
          className={`flex items-center gap-2 rounded-full border-2 px-5 py-3 text-xl font-bold ${speech.on ? "bg-navy text-white border-navy" : "bg-card border-line text-ink"}`}>
          <SpeakerIcon /> 読み上げ {speech.on ? "オン" : "オフ"}
        </button>
      </header>
      <main className="flex-1 flex flex-col px-8 pb-8">
        {screen.name === "welcome" && <Welcome ev={ev} say={speech.say} onStart={() => setScreen({ name: "mood" })} onOut={() => setScreen({ name: "out-id" })} onLeave={onLeave} />}
        {screen.name === "mood" && (
          <Step onBack={toWelcome}><MoodPicker title="今の気持ちを教えてください" onPick={(m) => setScreen({ name: "choose", mood: m })} /></Step>
        )}
        {screen.name === "choose" && <Choose say={speech.say} onNew={() => setScreen({ name: "new", mood: screen.mood, step: 0 })} onReturning={() => setScreen({ name: "id", mood: screen.mood })} onBack={() => setScreen({ name: "mood" })} />}
        {screen.name === "new" && (
          <NewFlow key={screen.step} step={screen.step} session={s} answers={answers} say={speech.say}
            onAnswer={(k, v) => setAnswers((a) => ({ ...a, [k]: v }))}
            onStep={(st) => (st < 0 ? setScreen({ name: "choose", mood: screen.mood }) : setScreen({ name: "new", mood: screen.mood, step: st }))}
            onDone={async (final) => {
              const r = await call<{ code: string; name: string | null; nextDate: string | null }>("register", { ...final, mood: screen.mood });
              setScreen({ name: "done", code: r.code, who: r.name, isNew: true, nextDate: r.nextDate });
            }} />
        )}
        {screen.name === "id" && (
          <IdPad title="IDを押してください" action="受付する" say={speech.say} onBack={() => setScreen({ name: "choose", mood: screen.mood })}
            submit={async (code) => {
              const r = await call<{ status: string; code: string; name: string | null; nextDate: string | null }>("checkin", { code, mood: screen.mood });
              if (r.status === "unknown") return `ID ${r.code} は見つかりませんでした。IDを確かめるか、運営の人に声をかけてください。`;
              setScreen({ name: "done", code: r.code, who: r.name, isNew: false, already: r.status === "already", nextDate: r.nextDate });
            }} />
        )}
        {screen.name === "done" && <Done {...screen} say={speech.say} onHome={toWelcome} />}
        {screen.name === "out-id" && (
          <IdPad title="お帰りの方：IDを押してください" action="次へ" say={speech.say} onBack={toWelcome}
            submit={async (code) => {
              // 先に退出を記録して受付済みかを確かめ、帰るときの気持ちは次の画面で上書きする
              const r = await call<{ status: string; code: string }>("checkout", { code });
              if (r.status === "unknown") return `ID ${r.code} は見つかりませんでした。`;
              if (r.status === "not-checked-in") return `ID ${r.code} の方は、今日の受付がまだのようです。運営の人に声をかけてください。`;
              setScreen({ name: "out-mood", code: r.code });
            }} />
        )}
        {screen.name === "out-mood" && (
          <Step onBack={toWelcome}>
            <MoodPicker title="今日はどうでしたか？" onPick={async (m) => {
              const r = await call<{ name: string | null; nextDate: string | null }>("checkout", { code: screen.code, mood: m });
              setScreen({ name: "bye", who: r.name, nextDate: r.nextDate });
            }} />
          </Step>
        )}
        {screen.name === "bye" && <Bye {...screen} say={speech.say} onHome={toWelcome} />}
      </main>
    </div>
  );
}

function Step({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  return <section className="flex-1 flex flex-col justify-center screen-in">{children}<div className="mt-10"><BigBack onClick={onBack} /></div></section>;
}

function Welcome({ ev, say, onStart, onOut, onLeave }: { ev: EventInfo; say: (t: string) => void; onStart: () => void; onOut: () => void; onLeave: () => void }) {
  useEffect(() => { say(`ようこそ、${ev.kind}へ。画面を押して、受付をはじめてください。`); }, [ev.kind, say]);
  const [confirmLeave, setConfirmLeave] = useState(false);
  return (
    <section className="flex-1 flex flex-col screen-in">
      <button onClick={onStart} className="flex-1 relative overflow-hidden rounded-[2.5rem] mt-4 bg-gradient-to-b from-[#fde7d9] via-[#fff4e6] to-[#fbf7f0] border-4 border-[#f3cdb4] flex flex-col items-center justify-center text-center px-8 py-12" aria-label="受付をはじめる">
        <svg viewBox="0 0 200 200" className="sunrise w-56 h-56 mb-2" aria-hidden="true">
          <g className="rays" stroke="#f5a524" strokeWidth="6" strokeLinecap="round">
            {Array.from({ length: 12 }, (_, i) => <line key={i} x1="100" y1="18" x2="100" y2="40" transform={`rotate(${i * 30} 100 100)`} />)}
          </g>
          <circle cx="100" cy="100" r="46" fill="#f8a33b" />
          <circle cx="100" cy="100" r="46" fill="url(#g)" />
          <defs><radialGradient id="g"><stop offset="0" stopColor="#ffd77a" /><stop offset="1" stopColor="#f08a24" /></radialGradient></defs>
        </svg>
        <h1 className="rise-text text-7xl font-bold text-ink">ようこそ！</h1>
        <p className="rise-text text-4xl font-bold text-ink mt-4">{ev.kind}へ</p>
        <span className="rise-text mt-10 inline-flex items-center gap-3 rounded-full bg-navy text-white text-3xl font-bold px-12 py-6 shadow-lg">ここを押して受付をはじめる</span>
      </button>
      <div className="flex items-center gap-4 mt-6">
        <button onClick={onOut} className="rounded-2xl border-4 border-navy bg-card text-3xl font-bold px-10 min-h-24">お帰りの方（退出）</button>
        <div className="ml-auto">
          {confirmLeave ? (
            <span className="flex gap-3 items-center"><span className="text-xl">会を選び直しますか？</span><button onClick={onLeave} className="rounded-xl bg-navy text-white text-xl font-bold px-6 min-h-16">はい</button><button onClick={() => setConfirmLeave(false)} className="rounded-xl border-2 border-line bg-card text-xl font-bold px-6 min-h-16">いいえ</button></span>
          ) : <button onClick={() => setConfirmLeave(true)} className="text-xl text-ink-soft underline px-4 min-h-16">運営：会を選び直す</button>}
        </div>
      </div>
    </section>
  );
}

function Choose({ onNew, onReturning, onBack, say }: { onNew: () => void; onReturning: () => void; onBack: () => void; say: (t: string) => void }) {
  useEffect(() => { say("はじめての方は左、2回目からの方は右を押してください。"); }, [say]);
  return (
    <section className="flex-1 flex flex-col justify-center screen-in">
      <h2 className="text-5xl font-bold text-center mb-10">あてはまる方を押してください</h2>
      <div className="grid gap-6 md:grid-cols-2 max-w-5xl w-full mx-auto">
        <button onClick={onNew} className="rounded-3xl bg-navy text-white p-10 min-h-64 flex flex-col items-center justify-center gap-4 shadow-lg active:scale-[.98] transition">
          <SparkIcon className="w-16 h-16" />
          <span className="text-5xl font-bold">はじめての方は<br />こちら</span>
        </button>
        <button onClick={onReturning} className="rounded-3xl bg-card text-ink border-4 border-navy p-10 min-h-64 flex flex-col items-center justify-center gap-4 shadow-lg active:scale-[.98] transition">
          <CardIcon className="w-16 h-16 text-navy" />
          <span className="text-5xl font-bold">2回目からの方</span>
          <span className="text-2xl text-ink-soft">IDで入ります</span>
        </button>
      </div>
      <div className="mt-10"><BigBack onClick={onBack} /></div>
    </section>
  );
}

type Q = { key: string; title: string; hint?: string; options?: string[]; text?: boolean; optional?: boolean };

const CONSENT: Q = { key: "consent", title: "受付の記録をとってもよいですか？", hint: "お名前や住んでいる市町村などを、会の運営のためだけに使います。外に出すときは人数だけにします。", options: ["はい", "いいえ"] };
const BUILTIN_KEYS = ["name", "club", "town", "trigger", "ageGroup", "gender", "livingAlone", "mobility"];

// 記録の同意は必ず最初。そのあとは管理画面で決めた順番・内容
function questions(s: Session): Q[] {
  const host = s.event.host;
  const list = (s.questions ?? []).map((q): Q => {
    // 主催の老人会を一番上に出す
    const options = q.key === "club" && host ? [host, ...q.options.filter((o) => o !== host)] : q.options;
    return { key: q.builtin ? q.key : `extra:${q.id}`, title: q.title, hint: q.hint || undefined, options: q.type === "single" ? options : undefined, text: q.type === "text", optional: q.optional };
  });
  return [CONSENT, ...list];
}

function NewFlow({ step, session, answers, onAnswer, onStep, onDone, say }: {
  step: number; session: Session; answers: Record<string, string | boolean | undefined>;
  onAnswer: (k: string, v: string | boolean | undefined) => void; onStep: (s: number) => void;
  onDone: (final: Record<string, unknown>) => Promise<void>; say: (t: string) => void;
}) {
  const qs = questions(session);
  const q = qs[step];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [text, setText] = useState(typeof answers[q.key] === "string" ? (answers[q.key] as string) : "");
  useEffect(() => { say(q.title + (q.hint ? "。" + q.hint : "")); }, [q, say]);

  const finish = async (a: Record<string, string | boolean | undefined>) => {
    setBusy(true);
    setError("");
    try {
      const consent = a.consent === true;
      const pick = (k: string) => (consent && typeof a[k] === "string" && a[k] ? (a[k] as string) : undefined);
      const builtin = Object.fromEntries(BUILTIN_KEYS.map((k) => [k, pick(k)]));
      const extra = Object.fromEntries(Object.keys(a).filter((k) => k.startsWith("extra:")).map((k) => [k.slice(6), pick(k)]).filter(([, v]) => v));
      await onDone({ consent, ...builtin, extra });
    } catch {
      setError("うまく受付できませんでした。もう一度押すか、運営の人に声をかけてください。");
      setBusy(false);
      setPicked(null);
    }
  };

  const advance = (value: string | undefined) => {
    const v = q.key === "consent" ? value === "はい" : value;
    const next = { ...answers, [q.key]: v };
    onAnswer(q.key, v);
    if ((q.key === "consent" && v === false) || step === qs.length - 1) return finish(next);
    onStep(step + 1);
  };
  const choose = (o: string) => {
    if (busy || picked) return;
    setPicked(o);
    window.setTimeout(() => advance(o), 350);
  };
  const current = q.key === "consent" ? (answers.consent === true ? "はい" : answers.consent === false ? "いいえ" : undefined) : (answers[q.key] as string | undefined);
  const opts = q.options ?? [];

  return (
    <section className="flex-1 flex flex-col screen-in max-w-5xl w-full mx-auto">
      <div className="pt-2 pb-6" aria-label={`${qs.length}問中${step + 1}問目`}>
        <div className="flex justify-between text-xl text-ink-soft mb-2"><span>はじめての方</span><span className="font-bold text-ink">{step + 1} / {qs.length}</span></div>
        <div className="h-3 rounded-full bg-line overflow-hidden"><div className="h-full bg-navy rounded-full transition-all" style={{ width: `${((step + 1) / qs.length) * 100}%` }} /></div>
      </div>
      <h2 className="text-5xl font-bold leading-tight mb-3">{q.title}</h2>
      {q.hint && <p className="text-2xl text-ink-soft leading-relaxed mb-6">{q.hint}</p>}
      {q.text ? (
        <div className="mt-2">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={q.key === "name" ? 40 : 200} autoFocus aria-label={q.title}
            className="w-full text-5xl rounded-2xl border-4 border-navy bg-card px-6 py-6" onKeyDown={(e) => e.key === "Enter" && text.trim() && advance(text.trim())} />
          <button onClick={() => advance(text.trim())} disabled={!text.trim() || busy} className="mt-6 w-full rounded-2xl bg-navy text-white text-4xl font-bold min-h-28 disabled:opacity-40">次へ</button>
        </div>
      ) : opts.length ? (
        <div className={`grid gap-5 mt-2 ${opts.length <= 4 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-3"}`}>
          {opts.map((o) => {
            const on = picked === o || (!picked && current === o);
            return (
              <button key={o} onClick={() => choose(o)} disabled={busy} aria-pressed={on}
                className={`rounded-2xl border-4 min-h-28 px-6 py-5 text-3xl font-bold text-left flex items-center gap-4 transition active:scale-[.98] ${on ? "bg-navy text-white border-navy" : "bg-card border-line text-ink"}`}>
                <span className={`grid place-items-center w-10 h-10 rounded-full border-4 shrink-0 ${on ? "border-white bg-white text-navy" : "border-line"}`}>{on && <CheckIcon className="w-6 h-6" />}</span>
                {o}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-2xl rounded-2xl bg-sun-soft p-6">市町村の一覧がまだ登録されていません。「とばす」を押してください。</p>
      )}
      {error && <p role="alert" className="mt-6 text-2xl font-bold text-alert bg-alert-soft rounded-2xl p-5">{error}</p>}
      <div className="mt-auto pt-8 flex gap-5">
        <BigBack onClick={() => onStep(step - 1)} />
        {(q.optional || (!q.text && !opts.length)) && <button onClick={() => advance(undefined)} disabled={busy} className="rounded-2xl border-4 border-line bg-card text-3xl font-bold px-10 min-h-24 ml-auto">とばす →</button>}
      </div>
    </section>
  );
}

function IdPad({ title, action, submit, onBack, say }: { title: string; action: string; submit: (code: string) => Promise<string | void>; onBack: () => void; say: (t: string) => void }) {
  const [typed, setTyped] = useState("");
  const [msg, setMsg] = useState("");
  const [scan, setScan] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { say(`${title}。押したら「${action}」を押してください。`); }, [title, action, say]);
  const go = async (code: string) => {
    if (!code || busy) return;
    setBusy(true);
    setMsg("");
    try {
      const err = await submit(code);
      if (err) { setMsg(err); say(err); setTyped(""); }
    } catch {
      setMsg("うまくいきませんでした。もう一度押してください。");
    } finally {
      setBusy(false);
    }
  };
  const key = (k: string) => (k === "消す" ? setTyped((t) => t.slice(0, -1)) : setTyped((t) => (t.length < 4 ? t + k : t)));
  return (
    <section className="flex-1 flex flex-col screen-in max-w-5xl w-full mx-auto">
      <h2 className="text-5xl font-bold mb-3 pt-2">{title}</h2>
      <p className="text-2xl text-ink-soft mb-6">カードに書いてある数字です</p>
      <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] items-start">
        <div>
          <div aria-live="polite" aria-label="入力したID" className="rounded-2xl border-4 border-navy bg-card h-32 grid place-items-center text-7xl font-bold tracking-[.3em] mb-5">{typed.padEnd(4, "・")}</div>
          <button onClick={() => go(typed)} disabled={!typed || busy} className="w-full rounded-2xl bg-navy text-white text-4xl font-bold min-h-28 disabled:opacity-40">{busy ? "確認しています…" : action}</button>
          <button onClick={() => setScan(true)} className="w-full mt-5 rounded-2xl border-4 border-line bg-card text-2xl font-bold min-h-24">カードの QR をカメラで読む</button>
          {msg && <p role="alert" className="mt-5 text-2xl font-bold text-alert bg-alert-soft rounded-2xl p-5 leading-relaxed">{msg}</p>}
        </div>
        <div className="grid grid-cols-3 gap-4">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "消す", "0"].map((k) => (
            <button key={k} onClick={() => key(k)} className={`rounded-2xl border-4 border-line bg-card font-bold min-h-28 active:bg-sun-soft ${k === "消す" ? "text-3xl" : "text-5xl"}`}>{k}</button>
          ))}
        </div>
      </div>
      <div className="mt-auto pt-8"><BigBack onClick={onBack} /></div>
      {scan && <QrScanner onClose={() => setScan(false)} onCode={(c) => { setScan(false); setTyped(c); go(c); }} />}
    </section>
  );
}

function useCountdown(ms: number) {
  const [left, setLeft] = useState(ms / 1000);
  useEffect(() => { const t = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000); return () => window.clearInterval(t); }, []);
  return left;
}

function Done({ code, who, isNew, already, nextDate, onHome, say }: { code: string; who: string | null; isNew: boolean; already?: boolean; nextDate: string | null; onHome: () => void; say: (t: string) => void }) {
  const left = useCountdown(DONE_MS);
  const headline = isNew ? (who ? `${san(who)}、ようこそ！` : "ようこそ！") : already ? "受付はもう済んでいます" : `おかえりなさい、${san(who) || `ID ${code} の方`}！`;
  useEffect(() => {
    say(isNew ? `受付しました。あなたのIDは、${code.split("").join("、")}、です。` : already ? "受付はもう済んでいます。" : `おかえりなさい。受付しました。`);
  }, [code, isNew, already, say]);
  return (
    <section className="flex-1 flex flex-col items-center justify-center text-center screen-in">
      <div className="pop grid place-items-center w-28 h-28 rounded-full bg-leaf text-white mb-5"><CheckIcon className="w-16 h-16" /></div>
      <h2 className="text-6xl font-bold mb-4">{headline}</h2>
      {isNew ? (
        <>
          <p className="text-3xl text-ink-soft mb-6">あなたのIDです。次からはこのIDで入れます。</p>
          <CardPreview code={code} nextDate={nextDate} />
        </>
      ) : (
        <>
          <p className="text-3xl text-ink-soft">{already ? "そのままお入りください" : "今日も来てくれてありがとうございます"}</p>
          {nextDate && <p className="text-3xl font-bold mt-6 rounded-2xl bg-sun-soft px-8 py-4">次回は {jpDate(nextDate)} です</p>}
        </>
      )}
      <button onClick={onHome} className="mt-10 rounded-2xl bg-navy text-white text-3xl font-bold px-14 min-h-24">おわる（{left}秒後に自動で戻ります）</button>
    </section>
  );
}

function Bye({ who, nextDate, onHome, say }: { who: string | null; nextDate: string | null; onHome: () => void; say: (t: string) => void }) {
  const left = useCountdown(DONE_MS);
  useEffect(() => { say(`ありがとうございました。${nextDate ? `次回は${jpDate(nextDate).replace(/（.）/, "")}です。` : ""}気をつけてお帰りください。`); }, [nextDate, say]);
  return (
    <section className="flex-1 flex flex-col items-center justify-center text-center screen-in">
      <svg viewBox="0 0 200 120" className="sunrise w-64 mb-4" aria-hidden="true"><circle cx="100" cy="100" r="50" fill="#f8a33b" /><rect x="0" y="100" width="200" height="20" fill="#fbf7f0" /></svg>
      {who && <p className="text-4xl font-bold mb-2">{san(who)}</p>}
      <h2 className="text-6xl font-bold mb-4">ありがとうございました！</h2>
      <p className="text-3xl text-ink-soft">気をつけてお帰りください</p>
      {nextDate && <p className="text-4xl font-bold mt-8 rounded-2xl bg-sun-soft px-10 py-5">次回は {jpDate(nextDate)} です</p>}
      <button onClick={onHome} className="mt-10 rounded-2xl bg-navy text-white text-3xl font-bold px-14 min-h-24">おわる（{left}秒後に自動で戻ります）</button>
    </section>
  );
}
