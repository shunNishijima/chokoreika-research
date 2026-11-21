// ネコのキャラクター（SVG 文字列）。同じ顔・同じ線で、ポーズだけを描き分ける。動きは SMIL（iPad の Safari でも動く）。
// 中身はこのファイルで組み立てた固定の文字列だけ（利用者の入力は入らない）なので、innerHTML で描いてよい。
const LINE = "#5a3d2b";
type Pal = { base: string; shade: string; stripe: string; white: string; inner: string };
const PALETTES: Record<string, Pal> = {
  tora: { base: "#f7b267", shade: "#e39a4e", stripe: "#e0853a", white: "#fffaf2", inner: "#ffb3be" }, // 茶トラ
  sabi: { base: "#a9b2bc", shade: "#8e98a3", stripe: "#7a838e", white: "#fbfbfb", inner: "#ffb3be" }, // グレー
  shiro: { base: "#fff6ea", shade: "#efe3d2", stripe: "#f0c99a", white: "#ffffff", inner: "#ffb3be" } // しろ
};

function pal(name: string): Pal { return PALETTES[name] || PALETTES.tora; }
function line(w?: number) { return ' stroke="' + LINE + '" stroke-width="' + (w || 4) + '" stroke-linejoin="round" stroke-linecap="round"'; }

// まばたき: 目の縦の半径を一瞬だけ小さくする
function blinkAnim(ry: number, dur?: number, begin?: number) {
  return '<animate attributeName="ry" values="' + ry + ";" + ry + ";1;" + ry + '" keyTimes="0;0.92;0.96;1" dur="' + (dur || 4) + 's" begin="' + (begin || 0) + 's" repeatCount="indefinite"/>';
}

function eyes(expr: string) {
  const dark = "#3b2a20";
  function openEye(x: number) {
    return '<ellipse cx="' + x + '" cy="0" rx="9" ry="11.5" fill="' + dark + '">' + blinkAnim(11.5) + "</ellipse>" +
      '<circle cx="' + (x + 3.5) + '" cy="-4.5" r="3.6" fill="#fff"><animate attributeName="opacity" values="1;1;0;1" keyTimes="0;0.92;0.96;1" dur="4s" repeatCount="indefinite"/></circle>' +
      '<circle cx="' + (x - 3) + '" cy="4" r="1.6" fill="#fff"><animate attributeName="opacity" values="1;1;0;1" keyTimes="0;0.92;0.96;1" dur="4s" repeatCount="indefinite"/></circle>';
  }
  if (expr === "open") return openEye(-25) + openEye(25);
  if (expr === "sad") {
    return openEye(-25) + openEye(25) +
      '<path d="M-36 -18 L-16 -13 M36 -18 L16 -13" fill="none"' + line(3.5) + "/>" +
      '<path d="M-33 10 q-5 9 0 13 q5 -4 0 -13 Z" fill="#8fd0ff" stroke="#4a9fd8" stroke-width="1.5"><animateTransform attributeName="transform" type="translate" values="0 0;0 8;0 8" keyTimes="0;0.8;1" dur="2.2s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;1;0" keyTimes="0;0.7;1" dur="2.2s" repeatCount="indefinite"/></path>';
  }
  if (expr === "happy") return '<path d="M-34 4 q9 -13 18 0 M16 4 q9 -13 18 0" fill="none"' + line(4.5) + "/>";
  if (expr === "sleep") return '<path d="M-34 0 q9 9 18 0 M16 0 q9 9 18 0" fill="none"' + line(4) + "/>";
  if (expr === "squint") return '<path d="M-34 -7 L-19 0 L-34 7 M34 -7 L19 0 L34 7" fill="none"' + line(4.5) + "/>";
  return "";
}

function mouth(kind: string) {
  if (kind === "smile") return '<path d="M-11 18 Q0 36 11 18 Z" fill="#c9475a"' + line(3) + '/><path d="M-6 27 Q0 33 6 27 Q0 24 -6 27 Z" fill="#ff8fa0"/>';
  if (kind === "yawn") return '<ellipse cx="0" cy="27" rx="13" ry="18" fill="#8e2f3f"' + line(3) + '/><ellipse cx="0" cy="37" rx="8" ry="5" fill="#ff8fa0"/><path d="M-7 12 l2 6 l2 -6 M3 12 l2 6 l2 -6" fill="#fff"/>';
  if (kind === "sad") return '<path d="M-9 27 Q0 19 9 27" fill="none"' + line(3) + "/>";
  return '<path d="M-11 18 Q-5.5 26 0 19 Q5.5 26 11 18" fill="none"' + line(3) + "/>";
}

// 頭。中心(0,0)、幅およそ120。expr: open / happy / sleep / squint / sad、m: w / smile / yawn / sad
function head(p: Pal, expr: string, m: string) {
  const ear = function (s: number) {
    return '<path d="M' + (-50 * s) + " -16 L" + (-47 * s) + " -63 Q" + (-44 * s) + " -71 " + (-36 * s) + " -65 L" + (-11 * s) + ' -44 Z" fill="' + p.base + '"' + line() + "/>" +
      '<path d="M' + (-43 * s) + " -26 L" + (-42 * s) + " -55 L" + (-22 * s) + ' -41 Z" fill="' + p.inner + '"/>';
  };
  const whisk = function (s: number) {
    return '<path d="M' + (-47 * s) + " 13 L" + (-72 * s) + " 8 M" + (-47 * s) + " 20 L" + (-72 * s) + ' 22" fill="none" stroke="' + LINE + '" stroke-width="2.2" stroke-linecap="round" opacity=".75"/>';
  };
  return ear(1) + ear(-1) +
    '<path d="M-60 -4 C-60 -44 -30 -52 0 -52 C30 -52 60 -44 60 -4 C60 32 32 47 0 47 C-32 47 -60 32 -60 -4 Z" fill="' + p.base + '"' + line() + "/>" +
    '<path d="M-8 -50 q3 9 0 15 M0 -51 q0 11 0 19 M8 -50 q-3 9 0 15 M-58 -4 h11 M-57 6 h9 M58 -4 h-11 M57 6 h-9" fill="none" stroke="' + p.stripe + '" stroke-width="5" stroke-linecap="round"/>' +
    '<ellipse cx="0" cy="18" rx="23" ry="15" fill="' + p.white + '"/>' +
    '<ellipse cx="-38" cy="17" rx="9.5" ry="5.5" fill="#ff8fa0" opacity=".5"/><ellipse cx="38" cy="17" rx="9.5" ry="5.5" fill="#ff8fa0" opacity=".5"/>' +
    eyes(expr) +
    '<path d="M-6.5 9 Q0 6 6.5 9 Q0 17 -6.5 9 Z" fill="#f2899a"' + line(2) + "/>" +
    mouth(m) + whisk(1) + whisk(-1);
}

function tail(d: string, p: Pal, w: number) {
  return '<path d="' + d + '" fill="none"' + line(w + 7) + '/><path d="' + d + '" fill="none" stroke="' + p.base + '" stroke-width="' + w + '" stroke-linecap="round"/>';
}

// 座って正面を向くネコ。pose: idle（まばたき・首かしげ）/ yawn（あくび）/ wave（手をふる）/ happy
export function sitting(name: string, pose: "idle" | "yawn" | "wave" | "happy") {
  const p = pal(name);
  const body =
    '<g>' + tail("M28 86 C78 88 86 40 70 8", p, 13) +
    '<animateTransform attributeName="transform" type="rotate" values="-4 30 86;6 30 86;-4 30 86" dur="2.4s" repeatCount="indefinite"/></g>' +
    '<path d="M-45 92 C-52 40 -32 -5 0 -5 C32 -5 52 40 45 92 Q0 104 -45 92 Z" fill="' + p.base + '"' + line() + "/>" +
    '<path d="M-20 6 C-27 40 -20 70 0 75 C20 70 27 40 20 6 Q0 16 -20 6 Z" fill="' + p.white + '"/>' +
    '<path d="M-46 42 q10 3 15 -2 M-47 60 q10 3 15 -2 M46 42 q-10 3 -15 -2 M47 60 q-10 3 -15 -2" fill="none" stroke="' + p.stripe + '" stroke-width="5" stroke-linecap="round"/>';
  const paws = '<ellipse cx="-18" cy="93" rx="15" ry="10" fill="' + p.white + '"' + line() + '/>' +
    '<ellipse cx="18" cy="93" rx="15" ry="10" fill="' + p.white + '"' + line() + "/>" +
    '<path d="M-23 89 v6 M-14 89 v6 M14 89 v6 M23 89 v6" stroke="' + LINE + '" stroke-width="2.4" stroke-linecap="round"/>';
  const arm = pose === "wave"
    ? '<g><path d="M26 30 C50 18 66 2 74 -14" fill="none"' + line(25) + '/><path d="M26 30 C50 18 66 2 74 -14" fill="none" stroke="' + p.base + '" stroke-width="18" stroke-linecap="round"/>' +
      '<circle cx="77" cy="-22" r="14" fill="' + p.white + '"' + line() + '/><ellipse cx="77" cy="-19" rx="6" ry="5" fill="' + p.inner + '"/>' +
      '<circle cx="70" cy="-30" r="2.6" fill="' + p.inner + '"/><circle cx="77" cy="-33" r="2.6" fill="' + p.inner + '"/><circle cx="84" cy="-30" r="2.6" fill="' + p.inner + '"/>' +
      '<animateTransform attributeName="transform" type="rotate" values="-12 26 30;14 26 30;-12 26 30" dur=".7s" repeatCount="indefinite"/></g>'
    : "";
  let h: string;
  if (pose === "yawn") {
    h = '<g><g>' + head(p, "open", "w") + '<animate attributeName="opacity" values="1;1;0;0;1;1" keyTimes="0;0.5;0.54;0.82;0.86;1" dur="8s" repeatCount="indefinite"/></g>' +
      '<g opacity="0">' + head(p, "squint", "yawn") + '<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;0.5;0.54;0.82;0.86;1" dur="8s" repeatCount="indefinite"/></g>' +
      '<animateTransform attributeName="transform" type="rotate" values="0 0 40;0 0 40;-7 0 40;-7 0 40;0 0 40;0 0 40" keyTimes="0;0.5;0.56;0.8;0.86;1" dur="8s" repeatCount="indefinite" additive="sum"/></g>';
  } else if (pose === "wave" || pose === "happy") {
    h = head(p, "happy", "smile");
  } else {
    h = '<g>' + head(p, "open", "w") + '<animateTransform attributeName="transform" type="rotate" values="0 0 40;-5 0 40;0 0 40;5 0 40;0 0 40" dur="7s" repeatCount="indefinite" additive="sum"/></g>';
  }
  return '<svg viewBox="-100 -130 200 240" aria-hidden="true">' + body + paws + '<g transform="translate(0,-52)">' + h + "</g>" + arm + "</svg>";
}

function leg(x: number, y: number, fill: string, from: number, to: number, dur: number) {
  return '<g transform="translate(' + x + "," + y + ')"><g><path d="M-9 0 h18 v36 a9 9 0 0 1 -18 0 Z" fill="' + fill + '"' + line() + "/>" +
    '<animateTransform attributeName="transform" type="rotate" values="' + from + ";" + to + ";" + from + '" dur="' + dur + 's" repeatCount="indefinite"/></g></g>';
}

// 横向きに歩くネコ（右向き）
export function walking(name: string) {
  const p = pal(name), d = 0.7;
  return '<svg viewBox="0 0 250 160" aria-hidden="true"><g>' +
    '<g>' + tail("M62 74 C30 68 22 40 36 16", p, 12) + '<animateTransform attributeName="transform" type="rotate" values="-8 62 74;10 62 74;-8 62 74" dur="1.3s" repeatCount="indefinite"/></g>' +
    leg(88, 98, p.shade, -20, 20, d) + leg(158, 98, p.shade, 20, -20, d) +
    leg(102, 100, p.base, 20, -20, d) + leg(172, 100, p.base, -20, 20, d) +
    '<path d="M60 74 C60 54 80 48 106 48 L152 48 C180 48 190 68 188 88 C186 108 170 116 150 116 L94 116 C70 116 58 100 60 74 Z" fill="' + p.base + '"' + line() + "/>" +
    '<path d="M100 50 q5 12 0 22 M120 49 q5 12 0 22 M140 49 q5 12 0 22" fill="none" stroke="' + p.stripe + '" stroke-width="6" stroke-linecap="round"/>' +
    '<g transform="translate(192,62) scale(.74)">' + head(p, "open", "w") + "</g>" +
    '<animateTransform attributeName="transform" type="translate" values="0 0;0 -3;0 0" dur="' + d / 2 + 's" repeatCount="indefinite"/></g></svg>';
}

// 丸くなって寝るネコ（鼻ちょうちん・Zzz つき）
// 寝そべるネコ。mode: sleep（寝息・鼻ちょうちん・Zzz）/ awake（目を開けて顔を上げる）/ happy（笑顔でしっぽをふる・ハート）
export function lying(name: string, mode: "sleep" | "awake" | "happy") {
  const p = pal(name);
  const z = function (x: number, y: number, size: number, begin: number) {
    return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" font-weight="800" fill="#8a7663" font-family="sans-serif" opacity="0">Z' +
      '<animate attributeName="opacity" values="0;1;0" dur="3s" begin="' + begin + 's" repeatCount="indefinite"/>' +
      '<animateTransform attributeName="transform" type="translate" values="0 0;14 -30" dur="3s" begin="' + begin + 's" repeatCount="indefinite"/></text>';
  };
  const heart = (x: number, begin: number, c: string) =>
    '<path d="M0 6 C-10 -4 -6 -12 0 -6 C6 -12 10 -4 0 6 Z" fill="' + c + '" opacity="0">' +
    '<animate attributeName="opacity" values="0;1;0" dur="2.4s" begin="' + begin + 's" repeatCount="indefinite"/>' +
    '<animateTransform attributeName="transform" type="translate" values="' + x + " 70;" + (x + 8) + ' 0" dur="2.4s" begin="' + begin + 's" repeatCount="indefinite"/></path>';
  const wag = mode === "sleep" ? "" : '<animateTransform attributeName="transform" type="rotate" values="0 206 120;' + (mode === "happy" ? "-14" : "-7") + ' 206 120;0 206 120" dur="' + (mode === "happy" ? ".6" : "1.4") + 's" repeatCount="indefinite"/>';
  const headT = mode === "sleep" ? "translate(80,104) rotate(-10) scale(.72)" : "translate(80,92) rotate(-2) scale(.74)";
  const headInner = mode === "sleep" ? head(p, "sleep", "w") : mode === "happy" ? head(p, "happy", "smile") : head(p, "open", "w");
  const nod = mode === "sleep" ? "" : '<animateTransform attributeName="transform" type="rotate" values="0 0 40;' + (mode === "happy" ? "-6" : "-3") + ' 0 40;0 0 40;' + (mode === "happy" ? "6" : "3") + ' 0 40;0 0 40" dur="' + (mode === "happy" ? "1.2" : "4") + 's" repeatCount="indefinite" additive="sum"/>';
  return '<svg viewBox="0 0 250 160" aria-hidden="true">' +
    '<g class="breath"><path d="M44 128 C32 86 72 52 132 52 C188 52 218 86 212 118 C210 134 197 138 177 138 L62 138 C48 138 46 134 44 128 Z" fill="' + p.base + '"' + line() + "/>" +
    '<path d="M124 53 q7 14 0 26 M150 56 q7 14 0 24 M174 64 q6 12 0 22" fill="none" stroke="' + p.stripe + '" stroke-width="6" stroke-linecap="round"/></g>' +
    '<ellipse cx="98" cy="138" rx="15" ry="9" fill="' + p.white + '"' + line() + '/><ellipse cx="124" cy="139" rx="15" ry="9" fill="' + p.white + '"' + line() + "/>" +
    "<g>" + tail("M206 120 C200 152 120 152 140 140", p, 12) + wag + "</g>" +
    '<g transform="' + headT + '"><g>' + headInner + nod + "</g></g>" +
    (mode === "sleep"
      ? '<circle cx="64" cy="118" r="4" fill="#cfeeff" stroke="#7cc3ea" stroke-width="2" opacity=".85"><animate attributeName="r" values="3;12;3" dur="3.2s" repeatCount="indefinite"/></circle>' +
        z(30, 60, 18, 0) + z(44, 46, 24, 1) + z(22, 40, 14, 2)
      : mode === "happy" ? heart(30, 0, "#ff7f96") + heart(150, 0.8, "#ffb04d") + heart(200, 1.6, "#ff9ec0") : "") +
    "</svg>";
}

export function sleeping(name: string) {
  return lying(name, "sleep");
}

// 気分ボタン用の顔
export function face(name: string, mood: "good" | "mid" | "bad") {
  const p = pal(name);
  const h = mood === "good" ? head(p, "happy", "smile") : mood === "bad" ? head(p, "sad", "sad") : head(p, "open", "w");
  const sparkle = mood === "good" ? '<path d="M58 -58 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 Z" fill="#ffd34d" stroke="#e0a800" stroke-width="2"><animateTransform attributeName="transform" type="rotate" values="0 58 -44;360 58 -44" dur="4s" repeatCount="indefinite"/></path>' : "";
  return '<svg viewBox="-80 -80 160 140" aria-hidden="true">' + h + sparkle + "</svg>";
}

function hearts() {
  const one = function (x: number, begin: number, c: string) {
    return '<path d="M0 6 C-10 -4 -6 -12 0 -6 C6 -12 10 -4 0 6 Z" fill="' + c + '" transform="translate(' + x + ',40)" opacity="0">' +
      '<animate attributeName="opacity" values="0;1;0" dur="2.6s" begin="' + begin + 's" repeatCount="indefinite"/>' +
      '<animateTransform attributeName="transform" type="translate" values="' + x + " 40;" + (x + 6) + ' -30" dur="2.6s" begin="' + begin + 's" repeatCount="indefinite"/></path>';
  };
  return one(-70, 0, "#ff7f96") + one(74, 0.9, "#ffb04d") + one(-60, 1.7, "#ff9ec0");
}

export function byeCat(name: string) {
  return sitting(name, "wave").replace("</svg>", hearts() + "</svg>");
}


// 画面のすみから顔をのぞかせるネコ（質問画面の右下に出す）
export function peek(name: string) {
  const p = pal(name);
  return '<svg viewBox="-80 -80 160 120" aria-hidden="true"><g>' + head(p, "open", "w") +
    '<animateTransform attributeName="transform" type="rotate" values="0 0 40;-8 0 40;0 0 40;0 0 40" keyTimes="0;0.15;0.3;1" dur="5s" repeatCount="indefinite"/></g>' +
    '<ellipse cx="-34" cy="38" rx="16" ry="10" fill="' + p.white + '"' + line() + '/><ellipse cx="34" cy="38" rx="16" ry="10" fill="' + p.white + '"' + line() + "/>" +
    '<path d="M-39 34 v6 M-29 34 v6 M29 34 v6 M39 34 v6" stroke="' + LINE + '" stroke-width="2.4" stroke-linecap="round"/></svg>';
}

// 肉球（タップした所に出す・進み具合の表示）
export function paw(color = "#c4552b") {
  return '<svg viewBox="0 0 40 40" aria-hidden="true" fill="' + color + '"><ellipse cx="20" cy="26" rx="10" ry="8.5"/><ellipse cx="8" cy="15" rx="4.5" ry="5.5"/><ellipse cx="16" cy="8" rx="4.5" ry="5.5"/><ellipse cx="25" cy="8" rx="4.5" ry="5.5"/><ellipse cx="33" cy="15" rx="4.5" ry="5.5"/></svg>';
}

// ひらひら飛ぶちょうちょ（待ち受け画面）
export function butterfly() {
  const wing = (s: number) => '<g><path d="M0 0 C' + 14 * s + " -18 " + 26 * s + " -6 " + 16 * s + ' 4 C' + 26 * s + " 10 " + 12 * s + ' 20 0 6 Z" fill="#ffb7d0" stroke="' + LINE + '" stroke-width="2"/>' +
    '<animateTransform attributeName="transform" type="scale" values="1 1;0.25 1;1 1" dur=".35s" repeatCount="indefinite"/></g>';
  return '<svg viewBox="-30 -24 60 48" aria-hidden="true">' + wing(1) + wing(-1) + '<ellipse cx="0" cy="2" rx="2.5" ry="9" fill="' + LINE + '"/></svg>';
}
