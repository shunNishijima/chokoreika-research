type P = { className?: string };
const base = { fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24", "aria-hidden": true };

export const CheckIcon = ({ className = "w-6 h-6" }: P) => <svg {...base} strokeWidth={3} className={className}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
export const CardIcon = ({ className = "w-6 h-6" }: P) => <svg {...base} className={className}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M7 10h5M7 14h3" /><rect x="14" y="9" width="4" height="4" rx=".5" /></svg>;
export const SparkIcon = ({ className = "w-6 h-6" }: P) => <svg {...base} className={className}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" /></svg>;
export const SpeakerIcon = ({ className = "w-7 h-7" }: P) => <svg {...base} className={className}><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" /><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" /></svg>;
