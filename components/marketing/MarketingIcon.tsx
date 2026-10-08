import type { ReactNode } from "react";

const ICONS: Record<string, ReactNode> = {
  settings: <><circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/></>,
  chart: <><path d="M3 3v18h18M7 16v-5m5 5V7m5 9V4"/></>,
  sparkle: <><path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3ZM21 2v4m-2-2h4"/></>,
  team: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v3"/></>,
  phone: <><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4m-3 14h2"/></>,
  call: <path d="M5 3h4l2 5-3 2a15 15 0 0 0 6 6l2-3 5 2v4c0 1-1 2-2 2C10 21 3 14 3 5c0-1 1-2 2-2Z"/>,
  reception: <><path d="M3 17h18M5 16a7 7 0 0 1 14 0M12 6v3M10 6h4M3 21h18"/></>,
  housekeeping: <><path d="m17 3-7 10M6 11l10 7-3 4-11-8 4-3ZM7 16l-2 3m6 0-2 3"/></>,
  maintenance: <><path d="M15 3a6 6 0 0 0-7 7L3 16a3 3 0 0 0 4 4l6-6a6 6 0 0 0 8-7l-4 4-4-4 2-4Z"/></>,
  training: <><path d="m2 9 10-6 10 6-10 6L2 9Zm4 3v6c4 3 8 3 12 0v-6M22 9v8"/></>,
  euro: <text x="12" y="20" textAnchor="middle" fill="currentColor" stroke="none" fontFamily="Arial, sans-serif" fontSize="25" fontWeight="500">€</text>,
  link: <><path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 12a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1" transform="translate(1 0) scale(.9)"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.2"/></>,
  dining: <><path d="M4 3v6a3 3 0 0 0 6 0V3M7 3v18M18 3v18m0-18c-4 2-4 10 0 10"/></>,
  ai: <><rect x="4" y="6" width="16" height="14" rx="4"/><path d="M12 2v4M8 11v2m8-2v2m-8 3h8M1 10v6m22-6v6"/></>,
  bed: <><path d="M3 18V5m18 13V9M3 14h18M3 9h18v5M7 9V6h6v3M3 21v-3m18 3v-3"/></>,
  massage: <><path d="M3 17h18M5 21v-4m14 4v-4M8 14h8a3 3 0 0 0 3-3H9m2-7c-3 1-3 4 0 5m5-5c-3 1-3 4 0 5"/><circle cx="5" cy="11" r="2"/></>,
  chat: <path d="M21 11a9 9 0 0 1-13 8l-5 2 1-5a9 9 0 1 1 17-5Z"/>,
  globe: <><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></>,
  resort: <><path d="M12 9c3 3 3 8 2 12M12 9C7 3 3 6 2 10c4-1 7-2 10-1Zm0 0c1-7 7-7 10-2-5-1-7 0-10 2ZM4 21h16"/></>,
  luxury: <><path d="m3 8 4-5h10l4 5-9 13L3 8ZM3 8h18M7 3l5 18 5-18"/></>,
  business: <><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1M11 21v-3h2v3"/></>,
  boutique: <><path d="m2 8 10-5 10 5H2ZM4 21h16M5 11v7m5-7v7m4-7v7m5-7v7M2 21h20"/></>,
};

export default function MarketingIcon({name}:{name:string}) {
  return <svg className="gostaya-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{ICONS[name]||ICONS.reception}</svg>;
}

export function MarketingFlag({country}:{country:string}) {
  const flags: Record<string,ReactNode>={
    bg:<><path fill="#fff" d="M0 0h30v6H0z"/><path fill="#00966e" d="M0 6h30v6H0z"/><path fill="#d62612" d="M0 12h30v6H0z"/></>,
    en:<><path fill="#012169" d="M0 0h30v18H0z"/><path stroke="#fff" strokeWidth="4" d="m0 0 30 18M30 0 0 18"/><path stroke="#c8102e" strokeWidth="1.5" d="m0 0 30 18M30 0 0 18"/><path stroke="#fff" strokeWidth="6" d="M15 0v18M0 9h30"/><path stroke="#c8102e" strokeWidth="3.5" d="M15 0v18M0 9h30"/></>,
    de:<><path fill="#161616" d="M0 0h30v6H0z"/><path fill="#d00" d="M0 6h30v6H0z"/><path fill="#ffce00" d="M0 12h30v6H0z"/></>,
    ro:<><path fill="#002b7f" d="M0 0h10v18H0z"/><path fill="#fcd116" d="M10 0h10v18H10z"/><path fill="#ce1126" d="M20 0h10v18H20z"/></>,
    cz:<><path fill="#fff" d="M0 0h30v9H0z"/><path fill="#d7141a" d="M0 9h30v9H0z"/><path fill="#11457e" d="m0 0 15 9L0 18Z"/></>,
    ru:<><path fill="#fff" d="M0 0h30v6H0z"/><path fill="#0039a6" d="M0 6h30v6H0z"/><path fill="#d52b1e" d="M0 12h30v6H0z"/></>,
  };
  return <svg className="gostaya-flag" viewBox="0 0 30 18" aria-hidden="true" focusable="false">{flags[country]}</svg>;
}
