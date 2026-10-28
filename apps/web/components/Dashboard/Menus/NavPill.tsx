import React from 'react'

/** The small pill beside a menu label, such as "Soon" on Opportunities. */
export default function NavPill({ children }: { children: React.ReactNode }) {
  return <span className="shrink-0 rounded-full border border-violet-400/60 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-violet-300">{children}</span>
}
