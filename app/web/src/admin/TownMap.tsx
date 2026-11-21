// 大阪府の市区町村ごとの地図ヒートマップ（e-Stat 国勢調査 2020 小地域境界を市区町村単位にまとめたもの。大阪市・堺市は区をまとめて1つ）。
// 背景の地図タイルは使わず、市町村の形を SVG で描いて色を塗る。
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { geoMercator, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";

type Props = { town: string; pop: number };
type Geo = FeatureCollection<Geometry, Props> & { attribution?: string };
export type TownValue = { value: number | null; suppressed: boolean; detail: string };

const W = 560;

export function useTownGeo() {
  return useQuery({ queryKey: ["osaka-geo"], queryFn: () => fetch("/geo/osaka-cities.geojson").then((r) => r.json() as Promise<Geo>), staleTime: Infinity });
}

export function TownMap({ values, colorOf, label, unit, fmt, ramp }: {
  ramp: string[];
  values: Map<string, TownValue>;
  colorOf: (v: number) => string;
  label: string;
  unit: string;
  fmt: (v: number | null) => string;
}) {
  const geo = useTownGeo();
  const [hover, setHover] = useState<string | null>(null);
  const [zoom, setZoom] = useState<"data" | "all">("data");
  const active = useMemo(() => new Set([...values.entries()].filter(([, v]) => v.value || v.suppressed).map(([t]) => t)), [values]);
  const layout = useMemo(() => {
    if (!geo.data) return { w: W, h: 0, font: 11, list: [] as { town: string; pop: number; d: string; c: [number, number] }[] };
    const focus = geo.data.features.filter((f) => active.has(f.properties.town));
    const useFocus = zoom === "data" && focus.length > 0;
    const projection = geoMercator();
    const path = geoPath(projection);
    let w = W, h: number;
    if (useFocus) {
      // 参加のある市町村が画面いっぱいに入るように寄せる（周りも少し見える）
      w = 760; h = 520;
      projection.fitExtent([[40, 40], [w - 40, h - 40]], { type: "FeatureCollection", features: focus });
    } else {
      // 府全体: 横幅に合わせて縮尺を決め、高さは府の形（縦長）に合わせる
      projection.fitWidth(W - 16, geo.data);
      const [[x0, y0], [, y1]] = path.bounds(geo.data);
      projection.translate([projection.translate()[0] - x0 + 8, projection.translate()[1] - y0 + 8]);
      h = Math.ceil(y1 - y0) + 16;
    }
    return { w, h, font: useFocus ? 14 : 10, list: geo.data.features.map((f: Feature<Geometry, Props>) => ({ town: f.properties.town, pop: f.properties.pop, d: path(f) ?? "", c: path.centroid(f) as [number, number] })) };
  }, [geo.data, active, zoom]);

  const shapes = layout.list;
  if (geo.isError) return <p className="text-ink-soft">地図データを読み込めませんでした。</p>;
  if (!geo.data) return <p className="text-ink-soft">地図を読み込み中…</p>;

  const hv = hover ? values.get(hover) : undefined;
  const hp = shapes.find((s) => s.town === hover);
  const unmatched = [...values.keys()].filter((t) => t !== "不明" && !shapes.some((s) => s.town === t));

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem] items-start">
      <svg viewBox={`0 0 ${layout.w} ${layout.h}`} className="w-full max-h-[78vh] bg-paper rounded-xl overflow-hidden" role="img" aria-label={`大阪府市の町ごとの${label}`}>
        <defs>
          <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="#f6f3ec" /><line x1="0" y1="0" x2="0" y2="8" stroke="#d9d2c5" strokeWidth="4" />
          </pattern>
        </defs>
        {shapes.map((s) => {
          const v = values.get(s.town);
          const fill = !v ? "#f6f3ec" : v.suppressed ? "url(#hatch)" : v.value ? colorOf(v.value) : "#f6f3ec";
          return (
            <path key={s.town} d={s.d} fill={fill} stroke={hover === s.town ? "#1b1b1b" : "#ffffff"} strokeWidth={hover === s.town ? 2.5 : 1}
              onMouseEnter={() => setHover(s.town)} onMouseLeave={() => setHover(null)} onClick={() => setHover(s.town)}
              style={{ cursor: "pointer" }}>
              <title>{`${s.town}：${v ? (v.suppressed ? "5人未満のため非表示" : `${label} ${fmt(v.value)}${unit}`) : "参加なし"}`}</title>
            </path>
          );
        })}
        {/* 参加がある市町村だけ名前を出す（文字が重なりすぎないように） */}
        {shapes.filter((s) => values.get(s.town)?.value).map((s) => (
          <text key={`l-${s.town}`} x={s.c[0]} y={s.c[1]} textAnchor="middle" dominantBaseline="middle" fontSize={layout.font} fontWeight="700"
            fill="#1b1b1b" stroke="#ffffff" strokeWidth="3" paintOrder="stroke" pointerEvents="none">{s.town}</text>
        ))}
      </svg>
      <div className="space-y-3">
        <div className="flex rounded-xl border-2 border-line bg-card p-1" role="group" aria-label="地図の範囲">
          {([["data", "参加のある市町村に寄せる"], ["all", "大阪府全体"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setZoom(k)} aria-pressed={zoom === k} className={`flex-1 px-2 py-1.5 rounded-lg text-sm font-bold ${zoom === k ? "bg-navy text-white" : ""}`}>{l}</button>
          ))}
        </div>
        <div className="rounded-xl border border-line p-4 min-h-28" aria-live="polite">
          {hover ? (
            <>
              <p className="text-lg font-bold">{hover}</p>
              <p className="text-3xl font-bold tabular-nums my-1">{hv ? (hv.suppressed ? "—" : `${fmt(hv.value)}${unit}`) : "0"}</p>
              <p className="text-sm text-ink-soft">{hv?.suppressed ? "5人未満のため非表示" : hv?.detail ?? "参加なし"}</p>
              {hp && <p className="text-sm text-ink-soft mt-1">人口 {hp.pop.toLocaleString()}人（2020年）</p>}
            </>
          ) : <p className="text-ink-soft">市町村にカーソルを合わせる（iPad では押す）と、数字が出ます。</p>}
        </div>
        <div className="text-sm text-ink-soft">
          <p className="font-bold text-ink mb-1">{label}</p>
          <span className="flex items-center gap-2">少ない <span className="flex">{ramp.map((c) => <span key={c} className="w-5 h-4" style={{ background: c }} />)}</span> 多い</span>
          <span className="flex items-center gap-2 mt-1"><span className="w-5 h-4 inline-block border border-line" style={{ background: "#f6f3ec" }} /> 参加なし</span>
          <span className="flex items-center gap-2 mt-1"><span className="w-5 h-4 inline-block" style={{ background: "repeating-linear-gradient(45deg,#ece7dc 0 4px,#f6f3ec 4px 8px)" }} /> 5人未満で非表示</span>
        </div>
        {unmatched.length > 0 && (
          <p className="text-sm text-ink-soft">地図にない名前: {unmatched.join("、")}（設定の市町村名を、地図の名前にそろえると表示されます）</p>
        )}
        <p className="text-xs text-ink-soft">{geo.data.attribution}</p>
      </div>
    </div>
  );
}
