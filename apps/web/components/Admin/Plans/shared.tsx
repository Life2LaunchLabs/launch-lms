'use client'

import React from 'react'
import { Award, CalendarCheck, CheckSquare, FileText, Link2, Loader2, Paperclip } from 'lucide-react'
import { UserAvatar } from '@components/Admin/Platform/shared'
import { cn } from '@/lib/utils'

export type Person = { id: number; username?: string; first_name?: string; last_name?: string; avatar_image?: string | null; user_uuid?: string }

export function personName(person?: Person | null) {
  if (!person) return 'Learner'
  return [person.first_name, person.last_name].filter(Boolean).join(' ') || person.username || 'Learner'
}

export function PersonAvatar({ person, size = 28 }: { person?: Person | null; size?: number }) {
  if (person?.user_uuid) return <UserAvatar userUuid={person.user_uuid} avatarImage={person.avatar_image} size={size} />
  const initials = personName(person).split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  return <span className="flex shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-bold text-gray-700" style={{ width: size, height: size }}>{initials}</span>
}

const STEP_ICONS: Record<string, React.ElementType> = { text: FileText, media: Paperclip, link: Link2, checkbox: CheckSquare, badge: Award }

/** The kind of thing a learner hands in for a step, as a small icon. A step with nothing to hand in is a sign-off. */
export function StepTypeIcon({ types, size = 14, className }: { types?: string[]; size?: number; className?: string }) {
  const Icon = (types?.length ? STEP_ICONS[types.find((type) => STEP_ICONS[type]) || 'text'] : CalendarCheck) || FileText
  return <Icon size={size} className={cn('shrink-0 text-gray-500', className)} aria-hidden="true" />
}

export function StatusPill({ tone = 'gray', children }: { tone?: 'gray' | 'green' | 'amber' | 'blue' | 'red'; children: React.ReactNode }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-600',
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-800',
    blue: 'bg-blue-100 text-blue-700',
    red: 'bg-red-100 text-red-700',
  }
  return <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase', tones[tone])}>{children}</span>
}

export function SectionCard({ title, action, children, className }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={cn('rounded-xl border border-gray-100 bg-white p-5 nice-shadow', className)}>
    {title || action ? <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-black text-gray-950">{title}</h2>{action}</div> : null}
    {children}
  </section>
}

// eslint-disable-next-line no-unused-vars
type Change<T> = (next: T) => void

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: React.ReactNode }[]; onChange: Change<T>; label: string }) {
  return <div role="tablist" aria-label={label} className="inline-flex rounded-lg bg-gray-100 p-0.5">
    {options.map((option) => <button key={option.value} type="button" role="tab" aria-selected={value === option.value} onClick={() => onChange(option.value)} className={cn('inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold transition', value === option.value ? 'bg-white text-black shadow-sm' : 'text-gray-600 hover:text-black')}>{option.label}</button>)}
  </div>
}

export function PageLoader() {
  return <div className="flex min-h-[320px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
}

export function EmptyState({ icon, title, detail }: { icon?: React.ReactNode; title: string; detail?: string }) {
  return <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center">{icon ? <div className="mx-auto mb-3 flex justify-center text-gray-300">{icon}</div> : null}<p className="text-sm font-black text-gray-800">{title}</p>{detail ? <p className="mt-1 text-xs text-gray-500">{detail}</p> : null}</div>
}

export function timeAgo(value?: string | null) {
  if (!value) return ''
  const then = new Date(value.endsWith('Z') || value.includes('+') ? value : `${value}Z`).getTime()
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000))
  if (minutes < 60) return minutes <= 1 ? 'just now' : `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 14) return days === 1 ? 'yesterday' : `${days} days ago`
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
