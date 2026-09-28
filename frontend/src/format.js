export const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export const sevRank = (s) => SEVERITIES.indexOf(s);
export const pct = (x, d = 1) => (x == null ? "–" : (x * 100).toFixed(d) + "%");
export const clock = (ts) => new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
export const sevLabel = (s) => s.charAt(0) + s.slice(1).toLowerCase();
export const ms = (x) => (x == null ? "–" : x < 1000 ? `${Math.round(x)} ms` : `${(x / 1000).toFixed(2)} s`);
export const duration = (sec) => {
  if (sec == null) return "–";
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
};
