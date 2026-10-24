'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { ListChecks, Loader2, Search, Star } from 'lucide-react'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { discoverApi, discoverKeys, type DiscoverPlan } from '@services/goals/discover'
import { requirementsApi } from '@services/goals/requirements'
import { MARKETPLACE_KEY } from '@services/learning/marketplace'
import { CoverGrid } from '@components/Plans/shared/PlanCover'
import { primaryActionClass, smallActionClass } from '@components/Plans/shared/actions'
import { SectionHeader, planGridClass } from '@components/Plans/library/PlanCards'
import { cn } from '@/lib/utils'
import { plural } from '@components/Plans/plan/planVersions'
import { CollectionAction, DiscoverCollectionCard, DiscoverPlanCard, Row, discoverCollectionHref, useDiscoverContext } from './parts'

const OTHER = 'More plans'
const FRAMEWORK_TINTS = ['#2F66D6', '#6B3FE0', '#C9501E', '#0B8077']

/**
 * Discover: the one marketplace. A partner collection up top, shared collections (the main way in),
 * requirement frameworks, then plans by category. Searching shows matching collections and plans.
 */
export default function DiscoverHome({ orgslug }: { orgslug: string }) {
  const { orgId, token, ready } = useDiscoverContext()
  const [query, setQuery] = React.useState('')
  const [debounced, setDebounced] = React.useState('')
  React.useEffect(() => { const timer = window.setTimeout(() => setDebounced(query.trim()), 250); return () => window.clearTimeout(timer) }, [query])
  const { data: page } = useSWR(ready ? discoverKeys.page(orgId, debounced) : null, () => discoverApi.page(orgId, debounced, token), { keepPreviousData: true })

  return <div className="pb-10">
    <label className="flex h-[52px] items-center gap-2.5 rounded-full border border-border bg-card px-5 text-muted-foreground shadow-[0_1px_2px_hsl(200_30%_10%/.06),0_8px_28px_hsl(200_30%_10%/.08)] focus-within:border-foreground/30">
      <Search size={20} aria-hidden="true" />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search plans, collections and partners" aria-label="Search Discover" autoComplete="off"
        className="min-w-0 flex-1 border-0 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground" />
    </label>
    {!page ? <div className="flex min-h-[240px] items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
      : debounced ? <Results orgslug={orgslug} plans={page.plans} collections={page.collections} query={debounced} />
        : <Browse orgslug={orgslug} page={page} />}
  </div>
}

function Section({ title, children, count }: { title: string; children: React.ReactNode; count?: number }) {
  return <section aria-label={title}>
    <SectionHeader title={title} count={count} />
    {children}
  </section>
}

function Results({ orgslug, plans, collections, query }: { orgslug: string; plans: DiscoverPlan[]; collections: Awaited<ReturnType<typeof discoverApi.page>>['collections']; query: string }) {
  return <>
    {collections.length ? <Section title="Collections" count={collections.length}><Row>{collections.map((item) => <DiscoverCollectionCard key={item.collection_uuid} orgslug={orgslug} collection={item} />)}</Row></Section> : null}
    <Section title="Plans" count={plans.length}>
      {plans.length ? <PlanGrid orgslug={orgslug} plans={plans} />
        : <p className="rounded-[20px] border-[1.5px] border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">Nothing matches “{query}”.</p>}
    </Section>
  </>
}

function PlanGrid({ orgslug, plans }: { orgslug: string; plans: DiscoverPlan[] }) {
  return <ul className={planGridClass}>{plans.map((plan) => <li key={plan.template_uuid} className="min-w-0"><DiscoverPlanCard orgslug={orgslug} plan={plan} /></li>)}</ul>
}

function Browse({ orgslug, page }: { orgslug: string; page: Awaited<ReturnType<typeof discoverApi.page>> }) {
  const others = page.plans.filter((plan) => plan.status !== 'own')
  const groups = [...page.categories, OTHER].map((category) => ({
    category, plans: others.filter((plan) => category === OTHER ? !plan.categories.length : plan.categories.includes(category)),
  })).filter((group) => group.plans.length)
  const collections = page.collections.filter((item) => item.collection_uuid !== page.featured?.collection_uuid)
  const empty = !page.featured && !page.collections.length && !page.plans.length
  // A plan's tag is the shared collection it's in, preferring one that puts it in this row's category.
  const tag = (uuid: string, category: string) => {
    const inside = page.collections.filter((item) => item.template_uuids.includes(uuid))
    return (inside.find((item) => item.categories.includes(category)) || inside[0])?.name
  }
  return <>
    {page.featured ? <Featured orgslug={orgslug} collection={page.featured} /> : null}
    {collections.length ? <Section title="Featured collections"><Row>{collections.map((item) => <DiscoverCollectionCard key={item.collection_uuid} orgslug={orgslug} collection={item} />)}</Row></Section> : null}
    <Frameworks orgslug={orgslug} />
    {groups.map((group) => <Section key={group.category} title={group.category}>
      <Row>{group.plans.map((plan) => <DiscoverPlanCard key={plan.template_uuid} orgslug={orgslug} plan={plan} tag={tag(plan.template_uuid, group.category)} className="w-[150px] shrink-0 snap-start sm:w-[188px]" />)}</Row>
    </Section>)}
    {empty ? <div className="mt-6 rounded-[20px] border-[1.5px] border-dashed border-border px-5 py-12 text-center">
      <p className="font-bold">Nothing shared yet</p>
      <p className="mt-1 text-sm text-muted-foreground">When organizations share plans and collections, they show up here.</p>
    </div> : null}
  </>
}

/** The partner banner: one collection, its plans' covers tilted on the right, and add or request. */
function Featured({ orgslug, collection }: { orgslug: string; collection: NonNullable<Awaited<ReturnType<typeof discoverApi.page>>['featured']> }) {
  const router = useRouter()
  return <section aria-label="Partner collection" className="mt-5 grid items-center gap-7 overflow-hidden rounded-3xl p-6 text-white sm:grid-cols-[minmax(0,1fr)_210px] sm:px-8 sm:py-[30px]"
    style={{ background: 'radial-gradient(circle at 85% 30%, hsl(30 90% 55% / .55), transparent 55%), linear-gradient(120deg, hsl(14 72% 36%), hsl(338 55% 30%))' }}>
    <div className="min-w-0">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-white/85"><Star size={15} aria-hidden="true" />Partner collection</p>
      <h2 className="mt-2.5 text-[30px] font-extrabold leading-tight tracking-tight">{collection.name}</h2>
      <p className="mt-2 max-w-[500px] leading-normal opacity-90">{collection.description || `${plural(collection.plan_count, 'plan')} from ${collection.creator_org?.name || 'a partner'}${collection.badge_count ? `, ${plural(collection.badge_count, 'badge')} to earn` : ''}.`}</p>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button type="button" className={cn(primaryActionClass, 'bg-white text-[hsl(14_72%_30%)] hover:bg-white/90')} onClick={() => router.push(discoverCollectionHref(orgslug, collection.collection_uuid))}>View the collection</button>
        <div className="[&_button]:bg-white/15 [&_button]:text-white [&_button:hover]:bg-white/25 [&_span]:bg-white/15 [&_span]:text-white"><CollectionAction orgslug={orgslug} collection={collection} /></div>
      </div>
    </div>
    <CoverGrid plans={collection.thumbs} className="hidden rotate-[4deg] sm:grid" cellClassName="rounded-[11px] shadow-[0_10px_22px_hsl(0_0%_0%/.3)]" />
  </section>
}

/** Frameworks anyone may copy; copying opens it under Requirements. */
function Frameworks({ orgslug }: { orgslug: string }) {
  const router = useRouter()
  const { orgId, token, ready, canAdd } = useDiscoverContext()
  const { data: frameworks = [] } = useSWR(ready ? [MARKETPLACE_KEY, 'framework-library', orgId, token] : null, async () => {
    try { return await requirementsApi.library(orgId, '', token) } catch { return [] }
  })
  const [busy, setBusy] = React.useState<string | null>(null)
  if (!frameworks.length) return null
  const copy = async (uuid: string) => {
    setBusy(uuid)
    try {
      const created: any = await requirementsApi.copyFromLibrary(orgId, uuid, token)
      toast.success('Tracking it. It’s in your requirements now.')
      if (created?.framework_uuid) router.push(getUriWithOrg(orgslug, routePaths.org.admin.requirementFrameworkPlans(created.framework_uuid, 'details')))
    } catch (error: any) { toast.error(error?.message || 'Could not add the framework.') } finally { setBusy(null) }
  }
  return <Section title="Requirement frameworks">
    <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-3">{frameworks.map((framework: any, index: number) => <div key={framework.framework_uuid} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: FRAMEWORK_TINTS[index % FRAMEWORK_TINTS.length] }}><ListChecks size={22} aria-hidden="true" /></span>
      <span className="min-w-0 flex-1"><b className="block text-[14.5px] leading-snug">{framework.name}</b><span className="block text-[12.5px] text-muted-foreground">{framework.owner_org_name || 'Life2Launch'} · {plural(framework.node_count || 0, 'requirement')}</span></span>
      {canAdd ? <button type="button" className={smallActionClass} disabled={busy === framework.framework_uuid} onClick={() => void copy(framework.framework_uuid)}>Track</button> : null}
    </div>)}</div>
  </Section>
}
