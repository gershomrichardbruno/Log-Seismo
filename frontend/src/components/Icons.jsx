// Small inline icon set (stroke icons, 24px grid) so the dashboard needs no icon library.
const base = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };

export const Logo = () => (
  <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="8" fill="var(--logo-bg)" />
    <polyline points="3,17 9,17 12,9 16,25 19,5 22,20 24,17 29,17" fill="none" stroke="#F97316" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
  </svg>
);
export const IconActivity = (p) => <svg {...base} {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>;
export const IconGauge = (p) => <svg {...base} {...p}><path d="M12 14l4-4" /><path d="M3.3 19a10 10 0 1 1 17.4 0" /></svg>;
export const IconZap = (p) => <svg {...base} {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>;
export const IconSend = (p) => <svg {...base} {...p}><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>;
export const IconAlert = (p) => <svg {...base} {...p}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
export const IconCheck = (p) => <svg {...base} {...p}><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1" /><polyline points="22 4 12 14 9 11" /></svg>;
export const IconFile = (p) => <svg {...base} {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
export const IconCloud = (p) => <svg {...base} {...p}><path d="M18 10h-1.3A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" /></svg>;
export const IconSearch = (p) => <svg {...base} {...p}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
export const IconChevron = (p) => <svg {...base} {...p}><polyline points="9 18 15 12 9 6" /></svg>;
export const IconGithub = (p) => <svg {...base} {...p}><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3.1-.4 6.4-1.5 6.4-7A5.4 5.4 0 0 0 20 4.8 5 5 0 0 0 19.9 1S18.7.7 16 2.5a13.4 13.4 0 0 0-7 0C6.3.7 5.1 1 5.1 1A5 5 0 0 0 5 4.8a5.4 5.4 0 0 0-1.5 3.7c0 5.4 3.3 6.6 6.4 7a3.4 3.4 0 0 0-.9 2.6V22" /></svg>;
