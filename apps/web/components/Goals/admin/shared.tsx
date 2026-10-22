'use client'

import React from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SectionCard({ title, action, children, className }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={cn('rounded-xl border border-gray-100 bg-white p-5 nice-shadow', className)}>
    {title || action ? <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-black text-gray-950">{title}</h2>{action}</div> : null}
    {children}
  </section>
}

export function PageLoader() {
  return <div className="flex min-h-[320px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
}

export function EmptyState({ icon, title, detail }: { icon?: React.ReactNode; title: string; detail?: string }) {
  return <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center">{icon ? <div className="mx-auto mb-3 flex justify-center text-gray-300">{icon}</div> : null}<p className="text-sm font-black text-gray-800">{title}</p>{detail ? <p className="mt-1 text-xs text-gray-500">{detail}</p> : null}</div>
}
