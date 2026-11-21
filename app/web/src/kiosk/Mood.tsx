// 「今の気持ち」を表情のボタンで聞く。選ぶと表情が大きくなり、小さな光が弾ける。
import { useState } from "react";

export const MOODS = [
  { v: 5, label: "すごくいい", color: "#f2b705", mouth: "M8 14.5c1.2 2.2 2.6 3.3 4 3.3s2.8-1.1 4-3.3", eyes: "happy" },
  { v: 4, label: "いい", color: "#f59f3a", mouth: "M8.5 15c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2", eyes: "dot" },
  { v: 3, label: "ふつう", color: "#8fb7d9", mouth: "M9 15.5h6", eyes: "dot" },
  { v: 2, label: "ちょっと元気ない", color: "#9aa3b2", mouth: "M9 16.5c.9-.9 1.9-1.4 3-1.4s2.1.5 3 1.4", eyes: "dot" },
  { v: 1, label: "しんどい", color: "#7d8899", mouth: "M8.5 17c1-1.4 2.2-2.1 3.5-2.1s2.5.7 3.5 2.1", eyes: "tired" },
] as const;

function Face({ m, size = 120 }: { m: (typeof MOODS)[number]; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill={m.color} />
      {m.eyes === "happy" && <g stroke="#3a2a00" strokeWidth="1.4" fill="none" strokeLinecap="round"><path d="M7.3 10.2c.6-.9 1.8-.9 2.4 0" /><path d="M14.3 10.2c.6-.9 1.8-.9 2.4 0" /></g>}
      {m.eyes === "dot" && <g fill="#2b2b2b"><circle cx="8.6" cy="10" r="1.15" /><circle cx="15.4" cy="10" r="1.15" /></g>}
      {m.eyes === "tired" && <g stroke="#2b2b2b" strokeWidth="1.4" strokeLinecap="round"><path d="M7.4 10.4h2.4" /><path d="M14.2 10.4h2.4" /></g>}
      <path d={m.mouth} stroke="#2b2b2b" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      {m.v === 5 && <g fill="#ff8f6b" opacity=".55"><circle cx="6.3" cy="13.3" r="1.3" /><circle cx="17.7" cy="13.3" r="1.3" /></g>}
    </svg>
  );
}

export function MoodPicker({ title, onPick }: { title: string; onPick: (v: number) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const choose = (v: number) => {
    if (picked) return;
    setPicked(v);
    window.setTimeout(() => onPick(v), 1100); // 選んだ表情を少し見せてから次へ
  };
  const chosen = MOODS.find((m) => m.v === picked);
  return (
    <div className="text-center">
      <h2 className="text-5xl font-bold mb-10">{title}</h2>
      <div className="flex flex-wrap justify-center gap-6">
        {MOODS.map((m, i) => {
          const on = picked === m.v;
          const off = picked !== null && !on;
          return (
            <button key={m.v} onClick={() => choose(m.v)} aria-pressed={on}
              className={`relative flex flex-col items-center gap-3 rounded-3xl px-4 pt-5 pb-4 w-44 transition-all duration-500 ${on ? "bg-card shadow-xl scale-110" : "bg-card/70"} ${off ? "opacity-25 scale-90" : ""}`}>
              <span className={on ? "mood-chosen" : "mood-bob"} style={{ animationDelay: `${i * 140}ms` }}><Face m={m} /></span>
              <span className="text-2xl font-bold leading-tight">{m.label}</span>
              {on && <span className="burst" aria-hidden="true">{Array.from({ length: 10 }, (_, k) => <i key={k} style={{ ["--a" as string]: `${k * 36}deg`, background: m.color }} />)}</span>}
            </button>
          );
        })}
      </div>
      <p className="text-3xl font-bold mt-10 h-10" aria-live="polite">{chosen ? "教えてくれて、ありがとう！" : ""}</p>
    </div>
  );
}
