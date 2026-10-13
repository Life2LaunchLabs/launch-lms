'use client'

import React from 'react'
import Link from 'next/link'
import { ChevronDown, Compass, Pencil } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@components/ui/button'
import { getUriWithOrg } from '@services/config/config'
import { planningApi } from '@services/planning/planning'

// eslint-disable-next-line no-unused-vars
type Props = { orgslug: string; plans: any[]; completed: any[]; invitations: any[]; completedError?: boolean; retryCompleted: () => void; choose: (plan: any) => void; getPlanColor: (uuid: string) => string; onCreate: () => void; creating?: boolean; token?: string; refresh: () => Promise<unknown> }

export default function PlansOverviewPanel({ orgslug, plans, completed, invitations, completedError, retryCompleted, choose, getPlanColor, onCreate, creating, token, refresh }: Props) {
  const [expanded, setExpanded] = React.useState(false)
  const list = (items: any[]) => <ul className="space-y-2">{items.map((plan) => <li key={plan.plan_uuid}><button type="button" onClick={() => choose(plan)} aria-label={`${plan.name}, ${Math.round(plan.progress_percent || 0)}% complete`} className="relative flex min-h-14 w-full items-center gap-2.5 overflow-hidden rounded-xl px-3 py-3 text-left transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-2" style={{ backgroundColor: `color-mix(in srgb, ${getPlanColor(plan.plan_uuid)} 16%, hsl(var(--card)))` }}>
    <span className="pointer-events-none absolute inset-y-0 left-0" style={{ width: `${Math.max(0, Math.min(100, plan.progress_percent || 0))}%`, backgroundColor: `color-mix(in srgb, ${getPlanColor(plan.plan_uuid)} 48%, hsl(var(--card)))` }} aria-hidden="true" />
    <span className="relative min-w-0 flex-1"><span className="block text-sm font-medium">{plan.name}</span>{!plan.is_mine && (plan.subject?.name || plan.target_name) ? <span className="block text-xs text-muted-foreground">For {plan.subject?.name || plan.target_name}</span> : null}</span>
    <span className="relative text-xs tabular-nums">{Math.round(plan.progress_percent || 0)}%</span>
  </button></li>)}</ul>
  const respond = async (uuid: string, accept: boolean) => { try { await planningApi.respond(uuid, accept, token); await refresh() } catch { toast.error('Could not respond to this invitation') } }
  return <aside aria-label="Your plans" className="rounded-xl border border-border bg-card p-3">
    {list(plans)}
    {!plans.length ? <p className="px-3 py-4 text-sm text-muted-foreground">No active plans.</p> : null}
    {invitations.length ? <section className="mt-3 space-y-3 border-t border-border pt-3" aria-label="Plan invitations">{invitations.map((invite) => <div key={invite.invitation_uuid} className="rounded-lg bg-muted p-3"><p className="text-sm font-medium">{invite.plan.name}</p><p className="mt-1 text-xs text-muted-foreground">{invite.kind === 'subject' ? 'A plan for you' : `Help as ${invite.role.name}`}</p><div className="mt-2 flex gap-2"><Button size="sm" variant="ghost" onClick={() => void respond(invite.invitation_uuid, false)}>Decline</Button><Button size="sm" onClick={() => void respond(invite.invitation_uuid, true)}>Accept</Button></div></div>)}</section> : null}
    <div className="mt-3 grid gap-1 border-t border-border pt-3">
      <Button variant="ghost" className="min-h-11 justify-start" onClick={onCreate} disabled={creating}><Pencil size={16} />{creating ? "Creating…" : "Create your own"}</Button>
      <Button variant="ghost" asChild className="min-h-11 justify-start"><Link href={getUriWithOrg(orgslug, '/badges')}><Compass size={16} />Find one in Discover</Link></Button>
    </div>
    {completed.length ? <div className="mt-3 border-t border-border pt-2"><button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} className="flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted"><span>{completed.length} completed {completed.length === 1 ? 'plan' : 'plans'}</span><ChevronDown size={16} className={expanded ? 'rotate-180' : ''} /></button>{expanded ? list(completed) : null}</div> : null}
    {completedError ? <Button variant="ghost" onClick={retryCompleted} className="mt-2 text-xs">Retry completed plans</Button> : null}
  </aside>
}
