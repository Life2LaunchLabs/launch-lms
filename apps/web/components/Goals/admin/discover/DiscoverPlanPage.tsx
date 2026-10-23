'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Award, FolderOpen, ListChecks, Loader2, Lock, PencilLine } from 'lucide-react'
import { CaretRight } from '@phosphor-icons/react'
import { EmptyState } from '@components/Goals/admin/live/ui'
import { stepDefinition } from '@components/Goals/steps'
import { discoverApi, discoverKeys, type DiscoverPlanDetail } from '@services/goals/discover'
import type { TemplateStep } from '@services/goals/types'
import { PlanThumb } from '../plan/PlanCards'
import { plural } from '../plan/planVersions'
import { ByLine, PlanAction, discoverCollectionHref, discoverHref, useDiscoverContext } from './parts'

/** A plan another organization shares, as Discover shows it: its live steps, and Add or Request. */
export default function DiscoverPlanPage({ orgslug, templateUuid }: { orgslug: string; templateUuid: string }) {
  const { orgId, token, ready } = useDiscoverContext()
  const { data: plan, error } = useSWR(ready ? discoverKeys.plan(orgId, templateUuid) : null, () => discoverApi.plan(orgId, templateUuid, token))
  if (error && !plan) return <div className="p-10"><EmptyState title="Not in Discover" detail="Its creator may have stopped sharing it." /></div>
  if (!plan) return <div className="flex min-h-full w-full items-center justify-center bg-[#f8f8f8]"><Loader2 className="animate-spin text-muted-foreground" /></div>
  const collection = plan.collections[0]
  const stages = plan.document.stages || []
  const steps = stages.reduce((total, stage) => total + stage.steps.length, 0)

  return <div className="min-h-full w-full bg-[#f8f8f8]"><div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:px-10">
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
      <Link href={discoverHref(orgslug)} className="hover:text-foreground">Discover</Link>
      {collection ? <><CaretRight size={12} aria-hidden="true" /><Link href={discoverCollectionHref(orgslug, collection.collection_uuid)} className="hover:text-foreground">{collection.name}</Link></> : null}
      <CaretRight size={12} aria-hidden="true" />
      <span aria-current="page" className="min-w-0 truncate text-foreground">{plan.title}</span>
    </nav>
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
      <main className="min-w-0 space-y-6">
        <header className="flex items-start gap-4">
          <PlanThumb title={plan.title} image={plan.thumbnail_image} className="h-20 w-20 shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{plan.title}</h1>
            {plan.description ? <p className="mt-1 text-base text-muted-foreground">{plan.description}</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
              <ByLine org={plan.creator_org} partner={plan.partner} />
              {plan.live_version?.semver ? <span className="font-bold text-emerald-700">v{plan.live_version.semver}</span> : null}
              <span>{plural(steps, 'step')}{stages.length > 1 ? ` · ${plural(stages.length, 'stage')}` : ''}</span>
              {plan.mode === 'locked' ? <span className="inline-flex items-center gap-1"><Lock size={13} />Locked</span> : <span className="inline-flex items-center gap-1"><PencilLine size={13} />You can change your copy</span>}
            </div>
            <div className="mt-5"><PlanAction orgslug={orgslug} plan={plan} /></div>
            {plan.status === 'none' ? <p className="mt-3 max-w-xl text-sm text-muted-foreground">{note(plan)}</p> : null}
          </div>
        </header>
        <section aria-labelledby="discover-steps">
          <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-border pb-3">
            <h2 id="discover-steps" className="text-xl font-black">Steps</h2>
            <span className="text-sm text-muted-foreground">What learners get</span>
          </div>
          <div className="space-y-6">
            {stages.map((stage) => <div key={stage.key}>
              {stages.length > 1 ? <h3 className="mb-2 text-base font-black">{stage.title}</h3> : null}
              <ol className="space-y-2">{stage.steps.map((step) => <StepLine key={step.key} step={step} />)}</ol>
            </div>)}
          </div>
        </section>
      </main>
      <aside className="space-y-4">
        {plan.badges.length ? <Card icon={<Award size={16} />} title="Badge">
          {plan.badges.map((badge) => <p key={badge.route_uuid} className="text-sm"><b>{badge.name}</b>. Learners who finish every step earn it.</p>)}
        </Card> : null}
        {plan.frameworks.length ? <Card icon={<ListChecks size={16} />} title="Requirements">
          {plan.frameworks.map((framework) => <p key={framework.framework_uuid} className="text-sm text-muted-foreground">Steps count toward {plural(framework.node_count, 'requirement')} in <b className="text-foreground">{framework.name}</b>.</p>)}
        </Card> : null}
        {plan.collections.map((item) => <Card key={item.collection_uuid} icon={<FolderOpen size={16} />} title="Collection">
          <p className="text-sm text-muted-foreground">Part of <b className="text-foreground">{item.name}</b>, {plural(item.plan_count, 'plan')}.</p>
          <Link href={discoverCollectionHref(orgslug, item.collection_uuid)} className="mt-3 inline-flex h-8 items-center rounded-full border border-border px-3 text-xs font-bold hover:bg-muted">View collection</Link>
        </Card>)}
      </aside>
    </div>
  </div></div>
}

function note(plan: DiscoverPlanDetail) {
  const by = plan.creator_org?.name || 'Its creator'
  if (plan.access === 'request') return `${by} approves who can use this plan. It shows in your Plans as requested until then.`
  return plan.mode === 'open' ? 'Adding it makes a copy that’s yours to change. You can assign it right away.' : `It runs as ${by} publishes it. You can assign it right away.`
}

function StepLine({ step }: { step: TemplateStep }) {
  const definition = stepDefinition(step.type)
  const Icon = definition.icon
  return <li className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><Icon size={16} aria-hidden="true" /></span>
    <span className="min-w-0"><b className="block truncate text-sm">{step.title}</b><span className="block text-[11px] text-muted-foreground">{definition.label}</span></span>
  </li>
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-border bg-card p-5">
    <h2 className="mb-2 flex items-center gap-2 text-base font-black"><span className="text-muted-foreground">{icon}</span>{title}</h2>
    {children}
  </section>
}
