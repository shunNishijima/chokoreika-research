// iPad の受付画面。シニアが自分で（または担当が代わりに）操作する前提で、1画面1問・大きなボタン・いつでも戻れる作り。
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { api, jpDate, type Choices, type EventInfo } from "../lib/api";
import { CardIcon, CheckIcon, SparkIcon, SpeakerIcon } from "./icons";
import { QrScanner } from "./QrScanner";
import { CardPreview } from "./CardPreview";

type Session = { event: EventInfo; options: { town: string[]; club: string[] }; choices: Choices };
type Screen =
  | { name: "home" }
  | { name: "new"; step: number }
  | { name: "returning" }
  | { name: "done"; code: string; isNew: boolean; already?: boolean; nextDate: string | null };

const TOKEN_KEY = "choko-kiosk-token";
const IDLE_MS = 90_000; // 途中で90秒触られなかったら最初の画面に戻る
const DONE_MS = 15_000; // 受付完了から15秒で最初の画面に戻る

function greeting() {
  const h = new Date().getHours();
  return h < 11 ? "おはようございます" : h < 17 ? "こんにちは" : "こんばんは";
}

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

export function Kiosk() {
  const [params, setParams] = useSearchParams();
  const [token, setToken] = useState(() => params.get("t") || localStorage.getItem(TOKEN_KEY) || "");
  useEffect(() => {
    const t = params.get("t");
    if (t) {
      localStorage.setItem(TOKEN_KEY, t);
      setToken(t);
      setParams({}, { replace: true }); // URL からトークンを消す
    }
  }, [params, setParams]);

  const session = useQuery({
    queryKey: ["kiosk", token],
    queryFn: () => api<Session>("/api/kiosk/session", { kioskToken: token }),
    enabled: !!token,
  });

  if (!token || session.isError) {
    return (
      <Center>
        <h1 className="text-4xl font-bold mb-4">受付を始められません</h1>
        <p className="text-2xl text-ink-soft leading-relaxed">運営の方は、管理画面の「開催」から<br />この iPad で受付画面を開いてください。</p>
      </Center>
    );
  }
  if (!session.data) return <Center><p className="text-3xl">準備しています…</p></Center>;
  return <KioskFlow token={token} session={session.data} />;
}

function Center({ children }: { children: React.ReactNode }) {
  return <main className="min-h-full grid place-items-center p-8 text-center screen-in"><div>{children}</div></main>;
}

function KioskFlow({ token, session }: { token: string; session: Session }) {
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [answers, setAnswers] = useState<Record<string, string | boolean | undefined>>({});
  const speech = useSpeech();
  const idle = useRef<number | undefined>(undefined);

  const goHome = useCallback(() => { setAnswers({}); setScreen({ name: "home" }); }, []);

  // 操作がないまま一定時間たったら最初に戻る
  useEffect(() => {
    const reset = () => {
      window.clearTimeout(idle.current);
      if (screen.name !== "home") idle.current = window.setTimeout(goHome, screen.name === "done" ? DONE_MS : IDLE_MS);
    };
    reset();
    window.addEventListener("pointerdown", reset);
    return () => { window.removeEventListener("pointerdown", reset); window.clearTimeout(idle.current); };
  }, [screen, goHome]);

  const ev = session.event;
  return (
    <div className="min-h-full flex flex-col">
      <header className="flex items-center justify-between px-8 pt-6 pb-2 text-xl text-ink-soft">
        <span><span className="font-bold text-ink">{jpDate(ev.date)}</span>　{ev.kind}{ev.place ? `（${ev.place}）` : ""}</span>
        <button onClick={speech.toggle} aria-pressed={speech.on}
          className={`flex items-center gap-2 rounded-full border-2 px-5 py-3 text-xl font-bold ${speech.on ? "bg-navy text-white border-navy" : "bg-card border-line text-ink"}`}>
          <SpeakerIcon /> 読み上げ {speech.on ? "オン" : "オフ"}
        </button>
      </header>
      <main className="flex-1 flex flex-col px-8 pb-8">
        {screen.name === "home" && <Home onNew={() => setScreen({ name: "new", step: 0 })} onReturning={() => setScreen({ name: "returning" })} say={speech.say} />}
        {screen.name === "new" && (
          <NewFlow key={screen.step} step={screen.step} session={session} answers={answers} say={speech.say}
            onAnswer={(k, v) => setAnswers((a) => ({ ...a, [k]: v }))}
            onStep={(s) => (s < 0 ? goHome() : setScreen({ name: "new", step: s }))}
            onDone={async (final) => {
              const r = await api<{ code: string; nextDate: string | null }>("/api/kiosk/register", { method: "POST", kioskToken: token, body: JSON.stringify(final) });
              setScreen({ name: "done", code: r.code, isNew: true, nextDate: r.nextDate });
            }} />
        )}
        {screen.name === "returning" && (
          <Returning token={token} say={speech.say} onBack={goHome}
            onDone={(code, already, nextDate) => setScreen({ name: "done", code, isNew: false, already, nextDate })} />
        )}
        {screen.name === "done" && <Done {...screen} say={speech.say} onHome={goHome} />}
      </main>
    </div>
  );
}

function Home({ onNew, onReturning, say }: { onNew: () => void; onReturning: () => void; say: (t: string) => void }) {
  useEffect(() => { say(`${greeting()}。はじめての方は左、2回目からの方は右を押してください。`); }, [say]);
  return (
    <section className="flex-1 flex flex-col justify-center screen-in">
      <h1 className="text-5xl font-bold text-center mb-3">{greeting()}</h1>
      <p className="text-2xl text-center text-ink-soft mb-10">あてはまる方を押してください</p>
      <div className="grid gap-6 md:grid-cols-2 max-w-5xl w-full mx-auto">
        <button onClick={onNew} className="rounded-3xl bg-navy text-white p-10 min-h-64 flex flex-col items-center justify-center gap-4 shadow-lg active:scale-[.98] transition">
          <SparkIcon className="w-16 h-16" />
          <span className="text-5xl font-bold">はじめての方</span>
          <span className="text-2xl opacity-90">かんたんな質問に答えます</span>
        </button>
        <button onClick={onReturning} className="rounded-3xl bg-card text-ink border-4 border-navy p-10 min-h-64 flex flex-col items-center justify-center gap-4 shadow-lg active:scale-[.98] transition">
          <CardIcon className="w-16 h-16 text-navy" />
          <span className="text-5xl font-bold">2回目からの方</span>
          <span className="text-2xl text-ink-soft">カードの番号を押します</span>
        </button>
      </div>
    </section>
  );
}

type Q = { key: string; title: string; hint?: string; options: string[]; optional?: boolean };

function questions(s: Session): Q[] {
  const c = s.choices;
  return [
    { key: "consent", title: "受付の記録をとってもよいですか？", hint: "年代や住んでいる町などを、会をよくするためだけに使います。お名前や住所はうかがいません。", options: ["はい", "いいえ"] },
    { key: "ageGroup", title: "年代を教えてください", options: c.ageGroup },
    { key: "gender", title: "性別を教えてください", options: c.gender },
    { key: "town", title: "お住まいの町はどちらですか？", options: s.options.town.length ? [...s.options.town, "それ以外の町"] : [], optional: true },
    { key: "club", title: "老人会に入っていますか？", options: [...s.options.club, "ほかの老人会", "入っていない"] },
    { key: "trigger", title: "今日は何がきっかけで来ましたか？", options: c.trigger },
    { key: "livingAlone", title: "一人で暮らしていますか？", hint: "答えたくなければ「とばす」を押してください。", options: c.livingAlone, optional: true },
    { key: "mobility", title: "今日はどうやって来ましたか？", hint: "答えたくなければ「とばす」を押してください。", options: c.mobility, optional: true },
  ];
}

function NewFlow({ step, session, answers, onAnswer, onStep, onDone, say }: {
  step: number; session: Session; answers: Record<string, string | boolean | undefined>;
  onAnswer: (k: string, v: string | boolean | undefined) => void; onStep: (s: number) => void;
  onDone: (final: Record<string, unknown>) => Promise<void>; say: (t: string) => void;
}) {
  const qs = questions(session);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const q = qs[step];
  useEffect(() => { say(q.title + (q.hint ? "。" + q.hint : "")); }, [q, say]);

  const finish = async (a: Record<string, string | boolean | undefined>) => {
    setBusy(true);
    setError("");
    try {
      const consent = a.consent === true;
      const pick = (k: string) => (consent && typeof a[k] === "string" ? (a[k] as string) : undefined);
      await onDone({ consent, ageGroup: pick("ageGroup"), gender: pick("gender"), town: pick("town"), club: pick("club"), trigger: pick("trigger"), livingAlone: pick("livingAlone"), mobility: pick("mobility") });
    } catch {
      setError("うまく受付できませんでした。もう一度押すか、運営の人に声をかけてください。");
      setBusy(false);
    }
  };

  const advance = (value: string | undefined) => {
    const v = q.key === "consent" ? value === "はい" : value;
    const next = { ...answers, [q.key]: v };
    onAnswer(q.key, v);
    // 同意しない場合は、ほかの質問をせずに受付を終える
    if ((q.key === "consent" && v === false) || step === qs.length - 1) return finish(next);
    onStep(step + 1);
  };

  const choose = (o: string) => {
    if (busy || picked) return;
    setPicked(o); // 選んだことが目で分かるよう少し待ってから次へ
    window.setTimeout(() => advance(o), 350);
  };

  const current = q.key === "consent" ? (answers.consent === true ? "はい" : answers.consent === false ? "いいえ" : undefined) : (answers[q.key] as string | undefined);
  const cols = q.options.length <= 2 ? "grid-cols-2" : q.options.length <= 4 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-3";

  return (
    <section className="flex-1 flex flex-col screen-in max-w-5xl w-full mx-auto">
      <div className="pt-2 pb-6" aria-label={`${qs.length}問中${step + 1}問目`}>
        <div className="flex justify-between text-xl text-ink-soft mb-2"><span>はじめての方</span><span className="font-bold text-ink">{step + 1} / {qs.length}</span></div>
        <div className="h-3 rounded-full bg-line overflow-hidden"><div className="h-full bg-navy rounded-full transition-all" style={{ width: `${((step + 1) / qs.length) * 100}%` }} /></div>
      </div>
      <h2 className="text-5xl font-bold leading-tight mb-3">{q.title}</h2>
      {q.hint && <p className="text-2xl text-ink-soft leading-relaxed mb-6">{q.hint}</p>}
      {q.options.length ? (
        <div className={`grid gap-5 ${cols} mt-2`}>
          {q.options.map((o) => {
            const on = picked === o || (!picked && current === o);
            return (
              <button key={o} onClick={() => choose(o)} disabled={busy} aria-pressed={on}
                className={`relative rounded-2xl border-4 min-h-28 px-6 py-5 text-3xl font-bold text-left flex items-center gap-4 transition active:scale-[.98] ${on ? "bg-navy text-white border-navy" : "bg-card border-line text-ink"}`}>
                <span className={`grid place-items-center w-10 h-10 rounded-full border-4 shrink-0 ${on ? "border-white bg-white text-navy" : "border-line"}`}>{on && <CheckIcon className="w-6 h-6" />}</span>
                {o}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-2xl rounded-2xl bg-sun-soft p-6">町の一覧がまだ登録されていません。「とばす」を押してください。</p>
      )}
      {error && <p role="alert" className="mt-6 text-2xl font-bold text-alert bg-alert-soft rounded-2xl p-5">{error}</p>}
      <div className="mt-auto pt-8 flex gap-5">
        <button onClick={() => onStep(step - 1)} disabled={busy} className="rounded-2xl border-4 border-line bg-card text-3xl font-bold px-10 min-h-24">← 戻る</button>
        {q.optional && <button onClick={() => advance(undefined)} disabled={busy} className="rounded-2xl border-4 border-line bg-card text-3xl font-bold px-10 min-h-24 ml-auto">とばす →</button>}
      </div>
    </section>
  );
}

function Returning({ token, onBack, onDone, say }: { token: string; onBack: () => void; onDone: (code: string, already: boolean, nextDate: string | null) => void; say: (t: string) => void }) {
  const [typed, setTyped] = useState("");
  const [msg, setMsg] = useState("");
  const [scan, setScan] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { say("カードに書いてある番号を押して、最後に「受付する」を押してください。"); }, [say]);

  const submit = async (code: string) => {
    if (!code || busy) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await api<{ status: "ok" | "already" | "unknown"; code: string; nextDate: string | null }>("/api/kiosk/checkin", { method: "POST", kioskToken: token, body: JSON.stringify({ code }) });
      if (r.status === "unknown") {
        setMsg(`${r.code}番は見つかりませんでした。番号を確かめるか、運営の人に声をかけてください。`);
        say("番号が見つかりませんでした。");
        setTyped("");
      } else onDone(r.code, r.status === "already", r.nextDate);
    } catch {
      setMsg("うまく受付できませんでした。もう一度押してください。");
    } finally {
      setBusy(false);
    }
  };

  const key = (k: string) => {
    if (k === "消す") return setTyped((t) => t.slice(0, -1));
    setTyped((t) => (t.length < 4 ? t + k : t));
  };

  return (
    <section className="flex-1 flex flex-col screen-in max-w-5xl w-full mx-auto">
      <h2 className="text-5xl font-bold mb-3 pt-2">カードの番号を押してください</h2>
      <p className="text-2xl text-ink-soft mb-6">押したら「受付する」を押します</p>
      <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] items-start">
        <div>
          <div aria-live="polite" aria-label="入力した番号" className="rounded-2xl border-4 border-navy bg-card h-32 grid place-items-center text-7xl font-bold tracking-[.3em] mb-5">
            {typed.padEnd(4, "・")}
          </div>
          <button onClick={() => submit(typed)} disabled={!typed || busy}
            className="w-full rounded-2xl bg-navy text-white text-4xl font-bold min-h-28 disabled:opacity-40">{busy ? "受付しています…" : "受付する"}</button>
          <button onClick={() => setScan(true)} className="w-full mt-5 rounded-2xl border-4 border-line bg-card text-2xl font-bold min-h-24">カードの QR をカメラで読む</button>
          {msg && <p role="alert" className="mt-5 text-2xl font-bold text-alert bg-alert-soft rounded-2xl p-5 leading-relaxed">{msg}</p>}
        </div>
        <div className="grid grid-cols-3 gap-4">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "消す", "0"].map((k) => (
            <button key={k} onClick={() => key(k)} className={`rounded-2xl border-4 border-line bg-card font-bold min-h-28 active:bg-sun-soft ${k === "消す" ? "text-3xl" : "text-5xl"}`}>{k}</button>
          ))}
        </div>
      </div>
      <div className="mt-auto pt-8"><button onClick={onBack} className="rounded-2xl border-4 border-line bg-card text-3xl font-bold px-10 min-h-24">← 戻る</button></div>
      {scan && <QrScanner onClose={() => setScan(false)} onCode={(c) => { setScan(false); setTyped(c); submit(c); }} />}
    </section>
  );
}

function Done({ code, isNew, already, nextDate, onHome, say }: { code: string; isNew: boolean; already?: boolean; nextDate: string | null; onHome: () => void; say: (t: string) => void }) {
  const [left, setLeft] = useState(DONE_MS / 1000);
  useEffect(() => {
    say(already ? `${Number(code)}番の方、受付はもう済んでいます。` : isNew ? `受付しました。あなたの番号は、${code.split("").join("、")}、です。` : `${Number(code)}番の方、受付しました。今日もありがとうございます。`);
    const t = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [code, isNew, already, say]);
  return (
    <section className="flex-1 flex flex-col items-center justify-center text-center screen-in">
      <div className="pop grid place-items-center w-32 h-32 rounded-full bg-leaf text-white mb-6"><CheckIcon className="w-20 h-20" /></div>
      <h2 className="text-6xl font-bold mb-4">{already ? "受付はもう済んでいます" : "受付しました"}</h2>
      {isNew ? (
        <>
          <p className="text-3xl text-ink-soft mb-6">あなたの番号です。カードは運営の人がお渡しします。</p>
          <CardPreview code={code} nextDate={nextDate} />
        </>
      ) : (
        <>
          <p className="text-8xl font-bold tracking-widest my-4">{code}</p>
          <p className="text-3xl text-ink-soft">{already ? "そのままお入りください" : "今日も来てくれてありがとうございます"}</p>
          {nextDate && <p className="text-3xl font-bold mt-6 rounded-2xl bg-sun-soft px-8 py-4">次回は {jpDate(nextDate)} です</p>}
        </>
      )}
      <button onClick={onHome} className="mt-10 rounded-2xl bg-navy text-white text-3xl font-bold px-14 min-h-24">おわる（{left}秒後に自動で戻ります）</button>
    </section>
  );
}
