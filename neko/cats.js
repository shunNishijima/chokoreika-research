// ネコのキャラクター（SVG）。同じ顔・同じ線で、ポーズだけを描き分ける。動きは SMIL（iPad の Safari でも動く）。
(function (root) {
  "use strict";

  var LINE = "#5a3d2b";
  var PALETTES = {
    tora: { base: "#f7b267", shade: "#e39a4e", stripe: "#e0853a", white: "#fffaf2", inner: "#ffb3be" }, // 茶トラ
    sabi: { base: "#a9b2bc", shade: "#8e98a3", stripe: "#7a838e", white: "#fbfbfb", inner: "#ffb3be" }, // グレー
    shiro: { base: "#fff6ea", shade: "#efe3d2", stripe: "#f0c99a", white: "#ffffff", inner: "#ffb3be" } // しろ
  };

  function pal(name) { return PALETTES[name] || PALETTES.tora; }
  function line(w) { return ' stroke="' + LINE + '" stroke-width="' + (w || 4) + '" stroke-linejoin="round" stroke-linecap="round"'; }

  // まばたき: 目の縦の半径を一瞬だけ小さくする
  function blinkAnim(ry, dur, begin) {
    return '<animate attributeName="ry" values="' + ry + ";" + ry + ";1;" + ry + '" keyTimes="0;0.92;0.96;1" dur="' + (dur || 4) + 's" begin="' + (begin || 0) + 's" repeatCount="indefinite"/>';
  }

  function eyes(expr) {
    var dark = "#3b2a20";
    function openEye(x) {
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

  function mouth(kind) {
    if (kind === "smile") return '<path d="M-11 18 Q0 36 11 18 Z" fill="#c9475a"' + line(3) + '/><path d="M-6 27 Q0 33 6 27 Q0 24 -6 27 Z" fill="#ff8fa0"/>';
    if (kind === "yawn") return '<ellipse cx="0" cy="27" rx="13" ry="18" fill="#8e2f3f"' + line(3) + '/><ellipse cx="0" cy="37" rx="8" ry="5" fill="#ff8fa0"/><path d="M-7 12 l2 6 l2 -6 M3 12 l2 6 l2 -6" fill="#fff"/>';
    if (kind === "sad") return '<path d="M-9 27 Q0 19 9 27" fill="none"' + line(3) + "/>";
    return '<path d="M-11 18 Q-5.5 26 0 19 Q5.5 26 11 18" fill="none"' + line(3) + "/>";
  }

  // 頭。中心(0,0)、幅およそ120。expr: open / happy / sleep / squint / sad、m: w / smile / yawn / sad
  function head(p, expr, m) {
    var ear = function (s) {
      return '<path d="M' + (-50 * s) + " -16 L" + (-47 * s) + " -63 Q" + (-44 * s) + " -71 " + (-36 * s) + " -65 L" + (-11 * s) + ' -44 Z" fill="' + p.base + '"' + line() + "/>" +
        '<path d="M' + (-43 * s) + " -26 L" + (-42 * s) + " -55 L" + (-22 * s) + ' -41 Z" fill="' + p.inner + '"/>';
    };
    var whisk = function (s) {
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

  function tail(d, p, w) {
    return '<path d="' + d + '" fill="none"' + line(w + 7) + '/><path d="' + d + '" fill="none" stroke="' + p.base + '" stroke-width="' + w + '" stroke-linecap="round"/>';
  }

  // 座って正面を向くネコ。pose: idle（まばたき・首かしげ）/ yawn（あくび）/ wave（手をふる）/ happy
  function sitting(name, pose) {
    var p = pal(name);
    var body =
      '<g>' + tail("M28 86 C78 88 86 40 70 8", p, 13) +
      '<animateTransform attributeName="transform" type="rotate" values="-4 30 86;6 30 86;-4 30 86" dur="2.4s" repeatCount="indefinite"/></g>' +
      '<path d="M-45 92 C-52 40 -32 -5 0 -5 C32 -5 52 40 45 92 Q0 104 -45 92 Z" fill="' + p.base + '"' + line() + "/>" +
      '<path d="M-20 6 C-27 40 -20 70 0 75 C20 70 27 40 20 6 Q0 16 -20 6 Z" fill="' + p.white + '"/>' +
      '<path d="M-46 42 q10 3 15 -2 M-47 60 q10 3 15 -2 M46 42 q-10 3 -15 -2 M47 60 q-10 3 -15 -2" fill="none" stroke="' + p.stripe + '" stroke-width="5" stroke-linecap="round"/>';
    var paws = '<ellipse cx="-18" cy="93" rx="15" ry="10" fill="' + p.white + '"' + line() + '/>' +
      '<ellipse cx="18" cy="93" rx="15" ry="10" fill="' + p.white + '"' + line() + "/>" +
      '<path d="M-23 89 v6 M-14 89 v6 M14 89 v6 M23 89 v6" stroke="' + LINE + '" stroke-width="2.4" stroke-linecap="round"/>';
    var arm = pose === "wave"
      ? '<g><path d="M26 30 C50 18 66 2 74 -14" fill="none"' + line(25) + '/><path d="M26 30 C50 18 66 2 74 -14" fill="none" stroke="' + p.base + '" stroke-width="18" stroke-linecap="round"/>' +
        '<circle cx="77" cy="-22" r="14" fill="' + p.white + '"' + line() + '/><ellipse cx="77" cy="-19" rx="6" ry="5" fill="' + p.inner + '"/>' +
        '<circle cx="70" cy="-30" r="2.6" fill="' + p.inner + '"/><circle cx="77" cy="-33" r="2.6" fill="' + p.inner + '"/><circle cx="84" cy="-30" r="2.6" fill="' + p.inner + '"/>' +
        '<animateTransform attributeName="transform" type="rotate" values="-12 26 30;14 26 30;-12 26 30" dur=".7s" repeatCount="indefinite"/></g>'
      : "";
    var h;
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

  function leg(x, y, fill, from, to, dur) {
    return '<g transform="translate(' + x + "," + y + ')"><g><path d="M-9 0 h18 v36 a9 9 0 0 1 -18 0 Z" fill="' + fill + '"' + line() + "/>" +
      '<animateTransform attributeName="transform" type="rotate" values="' + from + ";" + to + ";" + from + '" dur="' + dur + 's" repeatCount="indefinite"/></g></g>';
  }

  // 横向きに歩くネコ（右向き）
  function walking(name) {
    var p = pal(name), d = 0.7;
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
  function sleeping(name) {
    var p = pal(name);
    var z = function (x, y, size, begin) {
      return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" font-weight="800" fill="#8a7663" font-family="sans-serif" opacity="0">Z' +
        '<animate attributeName="opacity" values="0;1;0" dur="3s" begin="' + begin + 's" repeatCount="indefinite"/>' +
        '<animateTransform attributeName="transform" type="translate" values="0 0;14 -30" dur="3s" begin="' + begin + 's" repeatCount="indefinite"/></text>';
    };
    return '<svg viewBox="0 0 250 160" aria-hidden="true">' +
      '<g class="breath"><path d="M44 128 C32 86 72 52 132 52 C188 52 218 86 212 118 C210 134 197 138 177 138 L62 138 C48 138 46 134 44 128 Z" fill="' + p.base + '"' + line() + "/>" +
      '<path d="M124 53 q7 14 0 26 M150 56 q7 14 0 24 M174 64 q6 12 0 22" fill="none" stroke="' + p.stripe + '" stroke-width="6" stroke-linecap="round"/></g>' +
      '<ellipse cx="98" cy="138" rx="15" ry="9" fill="' + p.white + '"' + line() + '/><ellipse cx="124" cy="139" rx="15" ry="9" fill="' + p.white + '"' + line() + "/>" +
      tail("M206 120 C200 152 120 152 140 140", p, 12) +
      '<g transform="translate(80,104) rotate(-10) scale(.72)">' + head(p, "sleep", "w") + "</g>" +
      '<circle cx="64" cy="118" r="4" fill="#cfeeff" stroke="#7cc3ea" stroke-width="2" opacity=".85"><animate attributeName="r" values="3;12;3" dur="3.2s" repeatCount="indefinite"/></circle>' +
      z(30, 60, 18, 0) + z(44, 46, 24, 1) + z(22, 40, 14, 2) +
      "</svg>";
  }

  // 気分ボタン用の顔
  function face(name, mood) {
    var p = pal(name);
    var h = mood === "good" ? head(p, "happy", "smile") : mood === "bad" ? head(p, "sad", "sad") : head(p, "open", "w");
    var sparkle = mood === "good" ? '<path d="M58 -58 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 Z" fill="#ffd34d" stroke="#e0a800" stroke-width="2"><animateTransform attributeName="transform" type="rotate" values="0 58 -44;360 58 -44" dur="4s" repeatCount="indefinite"/></path>' : "";
    return '<svg viewBox="-80 -80 160 140" aria-hidden="true">' + h + sparkle + "</svg>";
  }

  function hearts() {
    var one = function (x, begin, c) {
      return '<path d="M0 6 C-10 -4 -6 -12 0 -6 C6 -12 10 -4 0 6 Z" fill="' + c + '" transform="translate(' + x + ',40)" opacity="0">' +
        '<animate attributeName="opacity" values="0;1;0" dur="2.6s" begin="' + begin + 's" repeatCount="indefinite"/>' +
        '<animateTransform attributeName="transform" type="translate" values="' + x + " 40;" + (x + 6) + ' -30" dur="2.6s" begin="' + begin + 's" repeatCount="indefinite"/></path>';
    };
    return one(-70, 0, "#ff7f96") + one(74, 0.9, "#ffb04d") + one(-60, 1.7, "#ff9ec0");
  }

  function byeCat(name) {
    return sitting(name, "wave").replace("</svg>", hearts() + "</svg>");
  }

  var api = { sitting: sitting, walking: walking, sleeping: sleeping, face: face, byeCat: byeCat };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Cats = api;
})(this);
