// 参加カード（番号・QR・次回の日付）。シニアの「チケットを作ってほしい」という声に合わせ、次回の約束を形にする。
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { jpDate } from "../lib/api";

export function CardPreview({ code, nextDate }: { code: string; nextDate: string | null }) {
  const [src, setSrc] = useState("");
  useEffect(() => { QRCode.toDataURL(`CHOKO:${code}`, { margin: 1, width: 240 }).then(setSrc); }, [code]);
  return (
    <div className="rounded-3xl border-4 border-dashed border-ink-soft bg-white px-10 py-6 flex items-center gap-8 shadow-md">
      {src && <img src={src} alt={`番号 ${code} の QR コード`} className="w-40 h-40" />}
      <div className="text-left">
        <p className="text-xl font-bold text-ink-soft">朝ご飯会 参加カード</p>
        <p className="text-8xl font-bold tracking-widest leading-none my-3">{code}</p>
        <p className="text-2xl font-bold border-t-2 border-line pt-2">次回 {nextDate ? jpDate(nextDate) : "　　月　　日"}</p>
      </div>
    </div>
  );
}
