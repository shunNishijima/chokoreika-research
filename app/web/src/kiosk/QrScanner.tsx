// 参加カードの QR を iPad のカメラで読む。読めない場合は番号入力に戻れる。
import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

export function QrScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const [error, setError] = useState("");
  const done = useRef(false);
  useEffect(() => {
    const scanner = new Html5Qrcode("qr-reader", { verbose: false });
    scanner
      .start({ facingMode: "user" }, { fps: 10, qrbox: 260 }, (text) => {
        const m = /^CHOKO:(\d{4})$/.exec(text);
        if (m && !done.current) { done.current = true; onCode(m[1]); }
      }, () => {})
      .catch(() => setError("カメラを使えませんでした。番号を押してください。"));
    return () => { scanner.isScanning && scanner.stop().catch(() => {}); };
  }, [onCode]);
  return (
    <div className="fixed inset-0 bg-black/70 grid place-items-center p-6 z-50 screen-in">
      <div className="bg-card rounded-3xl p-8 w-full max-w-2xl text-center">
        <h3 className="text-4xl font-bold mb-4">カードの QR をカメラに向けてください</h3>
        <div id="qr-reader" className="mx-auto w-full max-w-md rounded-2xl overflow-hidden bg-black min-h-72" />
        {error && <p role="alert" className="mt-4 text-2xl font-bold text-alert">{error}</p>}
        <button onClick={onClose} className="mt-6 rounded-2xl border-4 border-line bg-card text-3xl font-bold px-10 min-h-24">番号で入力する</button>
      </div>
    </div>
  );
}
