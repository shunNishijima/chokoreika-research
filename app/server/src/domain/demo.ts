// デモデータ（ダッシュボードの見た目を確かめるためのモック）を作る純粋関数。
// 実データと区別できるよう、会の会場は DEMO_PLACE、参加者の名前は「デモ 」で始める。
export const DEMO_PLACE = "（デモデータ）";
export const DEMO_NAME_PREFIX = "デモ ";

type DemoEvent = { date: string; kind: string; host: string; nextDate: string | null };
type DemoPerson = { name: string; ageGroup: string; gender: string; town: string; club: string; trigger: string; livingAlone: string; mobility: string };
type DemoAttendance = { event: number; person: number; role: string; moodBefore: number; moodAfter: number };

// 再現できる疑似乱数（毎回同じデモになる）
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
function pick<T>(r: () => number, items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let x = r() * total;
  for (const [v, w] of items) if ((x -= w) < 0) return v;
  return items[items.length - 1][0];
}

const CITIES = [["豊中市", 34], ["吹田市", 14], ["池田市", 10], ["箕面市", 10], ["大阪市", 12], ["茨木市", 5], ["高槻市", 3], ["摂津市", 3], ["豊能町", 2], ["枚方市", 2]] as const;
const CLUBS = [["みゆき会", 40], ["さくら会", 25], ["ひまわり会", 15], ["ほかの老人会", 6], ["入っていない", 14]] as const;
const FAMILY = ["山本", "田中", "中村", "小林", "加藤", "吉田", "山田", "佐々木", "松本", "井上", "木村", "林", "清水", "森", "池田", "橋本", "石川", "前田"];
const GIVEN_M = ["一郎", "次郎", "三郎", "茂", "勇", "清", "実", "博"];
const GIVEN_F = ["和子", "幸子", "節子", "洋子", "恵子", "京子", "久子", "照子"];

function iso(d: Date) { return d.toISOString().slice(0, 10); }

export function generateDemo(today: string, seed = 20261122) {
  const r = rng(seed);
  // 過去26週の土曜: 2週おきに朝ご飯会（みゆき会・さくら会を交互）、月1回 映画会（ひまわり会）
  const end = new Date(`${today}T00:00:00Z`);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - 7 * 26);
  while (start.getUTCDay() !== 6) start.setUTCDate(start.getUTCDate() + 1);
  const events: DemoEvent[] = [];
  for (let d = new Date(start), i = 0; d < end; d.setUTCDate(d.getUTCDate() + 14), i++) {
    const next = new Date(d); next.setUTCDate(next.getUTCDate() + 14);
    events.push({ date: iso(d), kind: "朝ご飯会", host: i % 2 ? "さくら会" : "みゆき会", nextDate: iso(next) });
    if (i % 2 === 0) {
      const m = new Date(d); m.setUTCDate(m.getUTCDate() + 7);
      if (m < end) { const n2 = new Date(m); n2.setUTCDate(n2.getUTCDate() + 28); events.push({ date: iso(m), kind: "映画会", host: "ひまわり会", nextDate: iso(n2) }); }
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date));

  const people: DemoPerson[] = [];
  const firstEvent: number[] = [];
  const total = 92;
  for (let i = 0; i < total; i++) {
    const male = r() < 0.38;
    const student = r() < 0.08;
    people.push({
      name: `${DEMO_NAME_PREFIX}${FAMILY[i % FAMILY.length]} ${(male ? GIVEN_M : GIVEN_F)[Math.floor(r() * 8)]}`,
      ageGroup: student ? "学生" : pick(r, [["65歳未満", 1], ["65〜74歳", 4], ["75〜84歳", 5], ["85歳以上", 2]]),
      gender: male ? "男性" : "女性",
      town: pick(r, CITIES),
      club: pick(r, CLUBS),
      trigger: pick(r, [["チラシ", 4], ["知り合いに誘われた", 3], ["老人会の声かけ", 3], ["その他", 1]]),
      livingAlone: student ? "いいえ" : pick(r, [["はい", 3], ["いいえ", 6], ["答えない", 1]]),
      mobility: pick(r, [["歩いて", 7], ["杖をついて", 2], ["手押し車", 1], ["送迎", 1]]),
    });
    // 後半ほど新しく来る人が増える（口コミで広がる想定）
    firstEvent.push(Math.min(events.length - 1, Math.floor(Math.pow(r(), 0.75) * events.length)));
  }

  const helpers = new Set([0, 3, 7, 12, 20, 31]);
  const attendances: DemoAttendance[] = [];
  people.forEach((p, pi) => {
    const loyalty = r(); // 来る頻度の個人差
    events.forEach((e, ei) => {
      if (ei < firstEvent[pi]) return;
      const match = e.kind === "映画会" ? 0.55 : p.club === e.host ? 0.85 : 0.45;
      if (ei !== firstEvent[pi] && r() > loyalty * match) return;
      const before = pick(r, [[2, 2], [3, 5], [4, 3], [5, 1]]);
      const after = Math.min(5, before + pick(r, [[0, 3], [1, 5], [2, 2]]));
      const role = helpers.has(pi) && ei > firstEvent[pi] + 1 ? pick(r, [["参加", 2], ["準備を手伝った", 2], ["担当", 1]]) : "参加";
      attendances.push({ event: ei, person: pi, role, moodBefore: before, moodAfter: after });
    });
  });
  return { events, people, attendances };
}
