'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Award, FolderOpen, Layers, ListChecks, Loader2, Lock, Medal } from 'lucide-react'
import { EmptyState } from '@components/Goals/admin/live/ui'
import { SafeImage } from '@components/Objects/SafeImage'
import { stepDefinition } from '@components/Goals/steps'
import { discoverApi, discoverKeys, type DiscoverPlanDetail } from '@services/goals/discover'
import type { TemplateStep } from '@services/goals/types'
import { PlanCover, coverPalette } from '@components/Plans/shared/PlanCover'
import { smallActionClass } from '@components/Plans/shared/actions'
import { AsideCard } from '@components/Plans/plan/AsideCard'
import { plural } from '@components/Plans/plan/planVersions'
import { ByLine, OwnerCard, PlanAction, discoverCollectionHref, discoverHref, useDiscoverContext } from './parts'

/** A plan another organization shares, as Discover shows it: its live steps, Add or Request, and who keeps it up to date. */
export default function DiscoverPlanPage({ orgslug, templateUuid }: { orgslug: string; templateUuid: string }) {
  const { orgId, token, ready } = useDiscoverContext()
  const { data: plan, error } = useSWR(ready ? discoverKeys.plan(orgId, templateUuid) : null, () => discoverApi.plan(orgId, templateUuid, token))
  if (error && !plan) return <div className="p-10"><EmptyState title="Not in Discover" detail="Its creator may have stopped sharing it." /></div>
  if (!plan) return <div className="flex min-h-full w-full items-center justify-center bg-[#f8f8f8]"><Loader2 className="animate-spin text-muted-foreground" /></div>
  const collection = plan.collections[0]
  const stages = plan.document.stages || []
  const steps = stages.reduce((total, stage) => total + stage.steps.length, 0)
  const locked = plan.mode === 'locked'
  const version = plan.live_version ? `v${plan.live_version.semver || plan.live_version.number} · Published` : 'Published'

  return <div className="min-h-full w-full bg-[#f8f8f8] dark:bg-background"><div className="mx-auto max-w-[1180px] px-4 pb-16 pt-6 sm:px-6 lg:px-10">
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
      <Link href={discoverHref(orgslug)} className="hover:text-foreground">Discover</Link>
      {collection ? <><span aria-hidden="true">/</span><Link href={discoverCollectionHref(orgslug, collection.collection_uuid)} className="min-w-0 truncate hover:text-foreground">{collection.name}</Link></> : null}
    </nav>
    <div className="mt-3.5 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <main className="min-w-0">
        <header className="flex items-start gap-3.5 sm:gap-[18px]">
          <PlanCover plan={plan} iconSize={34} className="h-[60px] w-[60px] shrink-0 rounded-2xl sm:h-[76px] sm:w-[76px] sm:rounded-[18px]" />
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-[clamp(26px,3vw,36px)] font-extrabold leading-[1.15] tracking-[-0.035em]">{plan.title}</h1>
            {plan.description ? <p className="mt-1.5 text-base leading-normal text-muted-foreground">{plan.description}</p> : null}
          </div>
        </header>
        <div className="mt-3 flex flex-wrap items-center gap-3.5 text-[13.5px] text-muted-foreground">
          <ByLine org={plan.creator_org} partner={plan.partner} />
          <span className="inline-flex items-center gap-1.5"><ListChecks size={16} aria-hidden="true" />{plural(steps, 'step')}</span>
          {stages.length > 1 ? <span className="inline-flex items-center gap-1.5"><Layers size={16} aria-hidden="true" />{plural(stages.length, 'stage')}</span> : null}
          {plan.badges.length ? <span className="inline-flex items-center gap-[5px] rounded-full bg-[hsl(45_95%_90%)] px-2 py-[3px] text-[11.5px] font-bold text-[hsl(35_80%_28%)]"><Medal size={13} aria-hidden="true" />Earns a badge</span> : null}
          {locked ? <span className="inline-flex items-center gap-[5px] rounded-full bg-muted px-2 py-[3px] text-[11.5px] font-bold"><Lock size={12} aria-hidden="true" />Locked</span> : null}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2"><PlanAction orgslug={orgslug} plan={plan} /></div>
        {plan.status === 'none' ? <p className="mt-2.5 max-w-xl text-[13px] text-muted-foreground">{note(plan)}</p> : null}
        <div className="mb-3 mt-[30px] flex items-center justify-between gap-3 border-b border-border pb-2.5">
          <h2 className="text-xl font-bold tracking-tight">Steps</h2>
          {plan.status === 'added' ? null : <span className="text-[13px] text-muted-foreground">Preview of what learners get</span>}
        </div>
        <div className="flex flex-col gap-2">
          {stages.map((stage, index) => <React.Fragment key={stage.key}>
            {stages.length > 1 ? <div className="mt-3 flex items-baseline gap-2.5 first:mt-0"><span className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Stage {index + 1}</span><b className="text-[17px]">{stage.title}</b></div> : null}
            {stage.steps.map((step) => <StepLine key={step.key} step={step} />)}
          </React.Fragment>)}
        </div>
      </main>
      <aside className="flex min-w-0 flex-col gap-3.5 lg:sticky lg:top-5">
        <OwnerCard org={plan.creator_org} locked={locked} open={plan.mode === 'open'} detail={version} />
        {plan.badges.length ? <AsideCard icon={<Medal size={16} />} title={plan.badges.length === 1 ? 'Badge' : 'Badges'}>
          {plan.badges.map((badge) => <div key={badge.route_uuid} className="mt-3 flex items-center gap-3.5">
            <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full text-white shadow-[inset_0_-4px_0_hsl(0_0%_0%/.18),0_6px_14px_hsl(0_0%_0%/.12)]" style={{ background: badge.thumbnail_image ? undefined : coverPalette(plan).deep }}>
              {badge.thumbnail_image ? <SafeImage src={badge.thumbnail_image} alt="" className="h-full w-full object-contain" /> : <Award size={30} aria-hidden="true" />}
            </span>
            <span className="min-w-0"><b className="block truncate text-sm">{badge.name}</b><span className="block text-[12.5px] leading-snug text-muted-foreground">Learners who finish every step earn it, with a certificate.</span></span>
          </div>)}
        </AsideCard> : null}
        {plan.frameworks.length ? <AsideCard icon={<ListChecks size={16} />} title="Requirements">
          {plan.frameworks.map((framework) => <p key={framework.framework_uuid} className="mt-2 text-[13.5px] leading-[1.45] text-muted-foreground">Steps count toward {plural(framework.node_count, 'requirement')} in <b className="text-foreground">{framework.name}</b>.</p>)}
        </AsideCard> : null}
        {plan.collections.map((item) => <AsideCard key={item.collection_uuid} icon={<FolderOpen size={16} />} title="Collection">
          <p className="mt-2 text-[13.5px] leading-[1.45] text-muted-foreground">Part of <b className="text-foreground">{item.name}</b>, {plural(item.plan_count, 'plan')}.</p>
          <Link href={discoverCollectionHref(orgslug, item.collection_uuid)} className={smallActionClass + ' mt-3'}>View collection</Link>
        </AsideCard>)}
      </aside>
    </div>
  </div></div>
}

function note(plan: DiscoverPlanDetail) {
  const by = plan.creator_org?.name || 'Its creator'
  if (plan.access === 'request') return `${by} approves who can use this plan. It’ll show in your Plans as requested in the meantime.`
  return plan.mode === 'open' ? 'Adding it makes a copy that’s yours to change. You can assign it right away.' : `It runs as ${by} publishes it. You can assign it right away.`
}

/** A step as learners get it: its type's colored tile, the title and the type. */
function StepLine({ step }: { step: TemplateStep }) {
  const definition = stepDefinition(step.type)
  const Icon = definition.icon
  return <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 motion-safe:animate-[plan-rise_.3s_both]">
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: definition.color }}><Icon size={20} aria-hidden="true" /></span>
    <span className="min-w-0"><b className="block truncate text-[14.5px]">{step.title}</b><span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">{definition.label}</span></span>
  </div>
}
