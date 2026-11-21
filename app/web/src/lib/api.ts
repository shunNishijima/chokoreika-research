export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T>(path: string, init: RequestInit & { kioskToken?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (init.kioskToken) headers.set("x-kiosk-token", init.kioskToken);
  const res = await fetch(path, { ...init, headers, credentials: "same-origin" });
  if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => ""));
  return res.json() as Promise<T>;
}

export type Choices = {
  ageGroup: string[]; gender: string[]; trigger: string[]; livingAlone: string[]; mobility: string[]; kind: string[]; role: string[];
};
export type EventInfo = { id: number; date: string; kind: string; place: string; host: string; nextDate: string | null };

export function jpDate(d?: string | null) {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  const w = "日月火水木金土"[new Date(y, m - 1, day).getDay()];
  return `${m}月${day}日（${w}）`;
}
