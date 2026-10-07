import type { ReactNode } from 'react'

/** Shared demo strip; actual controls also render in the native design preview. */
export default function DemoToolbar({ children }: { children: ReactNode }) {
  return <div className="demo-experience relative z-50 flex min-h-12 w-full items-center justify-between gap-2 border-b border-indigo-200 bg-indigo-50 px-3 py-2 text-indigo-950 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-100 print:hidden sm:px-5">{children}</div>
}
