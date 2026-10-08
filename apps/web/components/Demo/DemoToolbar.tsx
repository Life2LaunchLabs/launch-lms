import type { ReactNode } from 'react'

/**
 * The one bar shown above the product during a demo. `visitor` is a private
 * copy; `setup` is an admin signed in as the real demo account, so it must
 * never look like the visitor bar.
 */
export default function DemoToolbar({ children, variant = 'visitor' }: { children: ReactNode; variant?: 'visitor' | 'setup' }) {
  const tone = variant === 'setup'
    ? 'border-orange-500 bg-[repeating-linear-gradient(-45deg,#1f1d2b_0,#1f1d2b_14px,#2c2433_14px,#2c2433_28px)] text-orange-50'
    : 'border-indigo-200 bg-indigo-50 text-indigo-950 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-100'
  return <div data-demo-bar={variant} className={`demo-experience relative z-50 flex h-12 min-h-12 w-full shrink-0 items-center justify-between gap-2 border-b px-2 py-1.5 print:hidden sm:px-4 ${tone}`}>{children}</div>
}

export function DemoTag({ tone, children }: { tone: 'demo' | 'unstable' | 'live'; children: ReactNode }) {
  const color = tone === 'unstable' ? 'bg-amber-400 text-amber-950' : tone === 'live' ? 'bg-orange-500 text-orange-950' : 'bg-indigo-600 text-white dark:bg-indigo-500'
  return <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${color}`}>{children}</span>
}
