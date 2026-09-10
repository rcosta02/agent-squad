// Small inline SVG icons used in menus and buttons (16px, currentColor).
const P = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className: 'ico' }
export const IPlan = () => (
  <svg {...P}><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3h6v1M9 11h6M9 15h4" /></svg>
)
export const IBook = () => (
  <svg {...P}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19a2 2 0 0 1 2-2h13M8 7h7" /></svg>
)
export const IPlug = () => (
  <svg {...P}><path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4" /></svg>
)
export const IClock = () => (
  <svg {...P}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
)
export const IPlus = () => (
  <svg {...P}><path d="M12 5v14M5 12h14" /></svg>
)
export const IGear = () => (
  <svg {...P}><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></svg>
)
export const IComment = () => (
  <svg {...P}><path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 3.5V16H6a2 2 0 0 1-2-2z" /></svg>
)
export const IPlay = () => (
  <svg {...P} fill="currentColor" stroke="none"><path d="M7 5.5v13l11-6.5z" /></svg>
)
export const IStop = () => (
  <svg {...P} fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
)
export const IRecord = () => (
  <svg {...P} fill="currentColor" stroke="none"><circle cx="12" cy="12" r="6" /></svg>
)
export const IPencil = () => (
  <svg {...P}><path d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16z" /><path d="M13 7l4 4" /></svg>
)
export const ISession = () => (
  <svg {...P}><path d="M4 12a8 8 0 0 1 13.7-5.7M20 12a8 8 0 0 1-13.7 5.7" /><path d="M18 3v4h-4M6 21v-4h4" /></svg>
)
