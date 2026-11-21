// アンケートの質問の定義。最初からある質問（builtin）は participants の列に保存し、選択肢は指標の計算に使うため変更しない。
import { CHOICES } from "./choices.js";

export type QuestionType = "single" | "text";
export type BuiltinDef = { key: string; title: string; hint: string; type: QuestionType; optional: boolean; options: readonly string[] };

// club と town の選択肢は「設定」の一覧から作る（ここでは空）
export const BUILTIN_QUESTIONS: BuiltinDef[] = [
  { key: "name", title: "お名前を教えてください", hint: "ニックネームでも大丈夫です。", type: "text", optional: false, options: [] },
  { key: "club", title: "どの老人会に入っていますか？", hint: "", type: "single", optional: false, options: [] },
  { key: "town", title: "お住まいの市町村はどちらですか？", hint: "", type: "single", optional: true, options: [] },
  { key: "trigger", title: "今日は何がきっかけで来ましたか？", hint: "", type: "single", optional: false, options: CHOICES.trigger },
  { key: "ageGroup", title: "年代を教えてください", hint: "", type: "single", optional: false, options: CHOICES.ageGroup },
  { key: "gender", title: "性別を教えてください", hint: "", type: "single", optional: false, options: CHOICES.gender },
  { key: "livingAlone", title: "一人で暮らしていますか？", hint: "答えたくなければ「とばす」を押してください。", type: "single", optional: true, options: CHOICES.livingAlone },
  { key: "mobility", title: "今日はどうやって来ましたか？", hint: "答えたくなければ「とばす」を押してください。", type: "single", optional: true, options: CHOICES.mobility },
];

export const OTHER_CLUBS = ["ほかの老人会", "入っていない"];
export const OTHER_TOWN = "それ以外";

// 最初からある質問の選択肢を、設定の一覧（市町村・老人会）と合わせて返す
export function resolveOptions(key: string, stored: string[], lists: { town: string[]; club: string[] }) {
  if (key === "club") return [...lists.club, ...OTHER_CLUBS];
  if (key === "town") return lists.town.length ? [...lists.town, OTHER_TOWN] : [];
  const def = BUILTIN_QUESTIONS.find((b) => b.key === key);
  return def ? [...def.options] : stored;
}
