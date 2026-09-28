export const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export const pct = (x) => (x == null ? "–" : (x * 100).toFixed(1) + "%");
export const clock = (ts) => new Date(ts * 1000).toLocaleTimeString();
export const sevLabel = (s) => s.charAt(0) + s.slice(1).toLowerCase();
export const ms = (x) => (x == null ? "–" : x < 1000 ? `${Math.round(x)} ms` : `${(x / 1000).toFixed(2)} s`);
