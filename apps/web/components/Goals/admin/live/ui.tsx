'use client'

import React from 'react'
import { Loader2 } from 'lucide-react'
import { UserAvatar } from '@components/Admin/Platform/shared'
import { routePaths } from '@services/config/config'
import { gradeLearningResponse } from '@services/learning/learning'
import type { ActivityReview, StaffPerson } from '@services/goals/admin'
import { cn } from '@/lib/utils'

/** Signing off steps: the capability staff review with. */
export const REVIEW_CAPABILITY = 'complete_restricted_objectives'

/** The staff views' shared bits: people, empty and loading states, pills and the review link. */
export function personName(person?: Partial<StaffPerson> & { name?: string } | null) {
  if (!person) return 'Learner'
  return person.name || [person.first_name, person.last_name].filter(Boolean).join(' ') || person.username || 'Learner'
}

export function PersonAvatar({ person, size = 28 }: { person?: Partial<StaffPerson> & { name?: string } | null; size?: number }) {
  if (person?.user_uuid) return <UserAvatar userUuid={person.user_uuid} avatarImage={person.avatar_image || undefined} size={size} />
  const initials = personName(person).split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  return person?.avatar_image ? <img src={person.avatar_image} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} /> : <span className="flex shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-bold text-gray-700" style={{ width: size, height: size }}>{initials}</span>
}

type Tone = 'gray' | 'green' | 'amber' | 'blue' | 'red'
const TONES: Record<Tone, string> = { gray: 'bg-gray-100 text-gray-600', green: 'bg-green-100 text-green-700', amber: 'bg-amber-100 text-amber-800', blue: 'bg-blue-100 text-blue-700', red: 'bg-red-100 text-red-700' }

export function StatusPill({ tone = 'gray', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase', TONES[tone])}>{children}</span>
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

export function PageLoader({ tall = false }: { tall?: boolean }) {
  return <div className={cn('flex items-center justify-center', tall ? 'min-h-[70vh] bg-[#f8f8f8]' : 'min-h-[320px]')}><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
}

export function EmptyState({ icon, title, detail }: { icon?: React.ReactNode; title: string; detail?: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center">{icon ? <div className="mx-auto mb-3 flex justify-center text-gray-300">{icon}</div> : null}<p className="text-sm font-black text-gray-800">{title}</p>{detail ? <p className="mt-1 text-xs text-gray-500">{detail}</p> : null}</div>
}

export function Legend({ cls, label }: { cls: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={cn('h-2.5 w-2.5 rounded-sm', cls)} />{label}</span>
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

export function dateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''
}

export function humanize(value: string) {
  return String(value).replaceAll('.', ' ').replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
}

/** The review queue for one step of an assignment (or the activity grading list). */
export function reviewHref(params: { assignment: string | null; stepKey?: string | null; stepUuid?: string | null; activity?: string | null; focus?: string | null; from?: 'assignment' }) {
  const query = new URLSearchParams()
  if (params.assignment) query.set('assignment', params.assignment)
  if (params.stepKey) query.set('step_key', params.stepKey)
  if (params.stepUuid) query.set('step', params.stepUuid)
  if (params.activity) query.set('activity', params.activity)
  if (params.focus) query.set('focus', params.focus)
  if (params.from) query.set('from', params.from)
  return `${routePaths.org.admin.assignments()}/review?${query}`
}

/** The manual scores still needed for an activity review, blank. */
export function pendingScores(review?: ActivityReview | null) {
  const pending: Record<string, string> = {}
  ;(review?.attempts || []).forEach((attempt: any) => Object.entries(attempt.result?.questions || {}).forEach(([id, result]: [string, any]) => { if (result?.grading_status === 'pending') pending[`${attempt.attempt_uuid}:${id}`] = '' }))
  return pending
}

/** Saves the grades for every pending attempt of one activity review. */
export function gradeActivityReview(review: ActivityReview, scores: Record<string, string>, questionFeedback: Record<string, string>, feedback: string, token?: string) {
  return Promise.all((review.attempts || []).filter((attempt: any) => attempt.result?.grading_status === 'pending').map((attempt: any) => {
    const prefix = `${attempt.attempt_uuid}:`
    const questionScores = Object.fromEntries(Object.entries(scores).filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key.slice(prefix.length), Number(value)]))
    const total = Object.entries(attempt.result?.questions || {}).reduce((sum: number, [id, result]: [string, any]) => sum + (result.grading_status === 'pending' ? Number(questionScores[id] || 0) : Number(result.score || 0)), 0)
    const notes = Object.fromEntries(Object.entries(questionFeedback).filter(([key, value]) => key.startsWith(prefix) && value.trim()).map(([key, value]) => [key.slice(prefix.length), value.trim()]))
    return gradeLearningResponse(attempt.attempt_uuid, { score: total, question_scores: questionScores, question_feedback: notes, feedback }, token)
  }))
}
