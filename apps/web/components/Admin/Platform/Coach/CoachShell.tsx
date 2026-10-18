'use client'

import Link from 'next/link'
import React from 'react'
import useSWR from 'swr'
import PlatformShell from '@components/Admin/Platform/PlatformShell'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { COACH_POLICY_PATH, coachAdminApi, type CoachPolicy } from '@services/coach/admin'

export type CoachTab = 'method' | 'knowledge' | 'routines' | 'abilities' | 'model' | 'tests' | 'releases'

const TABS: { id: CoachTab; label: string; path: string }[] = [
  { id: 'method', label: 'Method', path: '' },
  { id: 'knowledge', label: 'Knowledge', path: '/knowledge' },
  { id: 'routines', label: 'Routines', path: '/routines' },
  { id: 'abilities', label: 'Abilities', path: '/abilities' },
  { id: 'model', label: 'Model', path: '/model' },
  { id: 'tests', label: 'Tests', path: '/tests' },
  { id: 'releases', label: 'Releases', path: '/releases' },
]

export function useCoachPolicy() {
  const session = useLHSession() as any
  const token: string | undefined = session?.data?.tokens?.access_token
  const result = useSWR<CoachPolicy>(token ? [COACH_POLICY_PATH, token] : null, () => coachAdminApi.get(token))
  return { ...result, token }
}

// eslint-disable-next-line no-unused-vars
type PolicyView = (policy: CoachPolicy) => React.ReactNode

export default function CoachShell({ active, children }: { active: CoachTab; children: PolicyView }) {
  const org = useOrg() as { slug?: string } | undefined
  const { data, error } = useCoachPolicy()
  const base = routePaths.owner.platform.coach()
  const href = (path: string) => (org?.slug ? getUriWithOrg(org.slug, `${base}${path}`) : `${base}${path}`)

  return (
    <PlatformShell title="Coach" activeSection="coach">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-gray-950">Coach</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-600">The coaching policy every learner&apos;s Coach runs on. Edits save to a draft; learners get the live release.</p>
          </div>
          {data ? <CoachStatus policy={data} href={href('/model')} /> : null}
        </div>
        <nav aria-label="Coach policy" className="flex gap-1 overflow-x-auto border-b">
          {TABS.map((tab) => (
            <Link key={tab.id} href={href(tab.path)} aria-current={active === tab.id ? 'page' : undefined} className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-semibold ${active === tab.id ? 'border-gray-950 text-gray-950' : 'border-transparent text-gray-500 hover:text-gray-950'}`}>{tab.label}</Link>
          ))}
        </nav>
        {data && active !== 'releases' ? <DraftBar policy={data} href={href('/releases')} /> : null}
        {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">The coaching policy could not be loaded. {(error as Error).message}</p>
          : !data ? <p role="status" className="text-sm text-gray-500">Loading the coaching policy…</p>
            : children(data)}
      </div>
    </PlatformShell>
  )
}

function CoachStatus({ policy, href }: { policy: CoachPolicy; href: string }) {
  const on = policy.enabled
  return (
    <Link href={href} className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${on ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700'}`}>
      <span className={`h-2 w-2 rounded-full ${on ? 'bg-emerald-600' : 'bg-gray-500'}`} aria-hidden="true" />
      {on ? 'Coach is on' : 'Coach is off'}
    </Link>
  )
}

function DraftBar({ policy, href }: { policy: CoachPolicy; href: string }) {
  const { live_number: live, draft_changes: changes } = policy.release
  if (!changes.length) return <p className="text-xs text-gray-500">{live ? `Learners get release ${live}. The draft has no changes.` : 'No release yet.'}</p>
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <span>{changes.length === 1 ? '1 change' : `${changes.length} changes`} in the draft{live ? `, not in release ${live} yet` : ''}.</span>
      <Link href={href} className="font-bold underline underline-offset-2">Review and release</Link>
    </div>
  )
}

export function Panel({ title, description, children, actions }: { title: string; description?: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-black text-gray-950">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-6 text-gray-600">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  )
}

export function errorMessage(error: unknown, fallback: string) {
  return (error as Error)?.message || fallback
}
