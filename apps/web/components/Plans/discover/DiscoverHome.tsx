'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { Award, ListChecks, Loader2, Search, Star } from 'lucide-react'
import { Input } from '@components/ui/input'
import { Button } from '@components/ui/button'
import { BadgeMarketplaceActions } from '@components/Plans/requests/BadgeIssuing'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { discoverApi, discoverKeys, type DiscoverPlan } from '@services/goals/discover'
import { requirementsApi } from '@services/goals/requirements'
import { browseMarketplaceBadges, isMarketplaceKey, MARKETPLACE_KEY } from '@services/learning/marketplace'
import { PlanCover } from '@components/Plans/shared/PlanCover'
import { plural } from '@components/Plans/plan/planVersions'
import { CollectionAction, DiscoverCollectionCard, DiscoverPlanCard, Row, discoverCollectionHref, useDiscoverContext } from './parts'

const OTHER = 'More plans'

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

  return <div className="space-y-10 pb-10">
    <label className="relative block">
      <span className="sr-only">Search Discover</span>
      <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search plans, collections and partners" className="h-12 rounded-full pl-11 text-base" />
    </label>
    {!page ? <div className="flex min-h-[240px] items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
      : debounced ? <Results orgslug={orgslug} plans={page.plans} collections={page.collections} query={debounced} />
        : <Browse orgslug={orgslug} page={page} />}
  </div>
}

function Section({ title, children, count }: { title: string; children: React.ReactNode; count?: number }) {
  return <section aria-label={title}>
    <h2 className="mb-3 text-xl font-black">{title}{count != null ? <span className="ml-2 text-sm font-bold text-muted-foreground">{count}</span> : null}</h2>
    {children}
  </section>
}

function Results({ orgslug, plans, collections, query }: { orgslug: string; plans: DiscoverPlan[]; collections: Awaited<ReturnType<typeof discoverApi.page>>['collections']; query: string }) {
  return <>
    {collections.length ? <Section title="Collections" count={collections.length}><Row>{collections.map((item) => <DiscoverCollectionCard key={item.collection_uuid} orgslug={orgslug} collection={item} />)}</Row></Section> : null}
    <Section title="Plans" count={plans.length}>
      {plans.length ? <PlanGrid orgslug={orgslug} plans={plans} />
        : <p className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">Nothing matches “{query}”.</p>}
    </Section>
  </>
}

function PlanGrid({ orgslug, plans }: { orgslug: string; plans: DiscoverPlan[] }) {
  return <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{plans.map((plan) => <li key={plan.template_uuid}><DiscoverPlanCard orgslug={orgslug} plan={plan} /></li>)}</ul>
}

function Browse({ orgslug, page }: { orgslug: string; page: Awaited<ReturnType<typeof discoverApi.page>> }) {
  const others = page.plans.filter((plan) => plan.status !== 'own')
  const groups = [...page.categories, OTHER].map((category) => ({
    category, plans: others.filter((plan) => category === OTHER ? !plan.categories.length : plan.categories.includes(category)),
  })).filter((group) => group.plans.length)
  const collections = page.collections.filter((item) => item.collection_uuid !== page.featured?.collection_uuid)
  const empty = !page.featured && !page.collections.length && !page.plans.length
  return <>
    {page.featured ? <Featured orgslug={orgslug} collection={page.featured} /> : null}
    {collections.length ? <Section title="Featured collections"><Row>{collections.map((item) => <DiscoverCollectionCard key={item.collection_uuid} orgslug={orgslug} collection={item} />)}</Row></Section> : null}
    <Frameworks orgslug={orgslug} />
    {groups.map((group) => <Section key={group.category} title={group.category}>
      <Row>{group.plans.map((plan) => <DiscoverPlanCard key={plan.template_uuid} orgslug={orgslug} plan={plan} className="w-44 shrink-0 snap-start sm:w-52" />)}</Row>
    </Section>)}
    {empty ? <div className="rounded-2xl border border-dashed border-border px-5 py-12 text-center">
      <p className="font-bold">Nothing shared yet</p>
      <p className="mt-1 text-sm text-muted-foreground">When organizations share plans and collections, they show up here.</p>
    </div> : null}
    <Badges />
  </>
}

/** The partner banner: one collection, its plans' images, and add or request. */
function Featured({ orgslug, collection }: { orgslug: string; collection: NonNullable<Awaited<ReturnType<typeof discoverApi.page>>['featured']> }) {
  const router = useRouter()
  const cells = [0, 1, 2, 3].map((index) => collection.thumbs[index])
  return <section aria-label="Partner collection" className="grid gap-6 overflow-hidden rounded-3xl bg-gradient-to-br from-violet-700 to-indigo-600 p-6 text-white sm:grid-cols-[1fr_16rem] sm:p-8">
    <div className="min-w-0">
      <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-white/80"><Star size={13} aria-hidden="true" />Partner collection · {collection.creator_org?.name}</p>
      <h2 className="mt-2 text-3xl font-black tracking-tight">{collection.name}</h2>
      {collection.description ? <p className="mt-2 max-w-xl text-base text-white/85">{collection.description}</p> : null}
      <p className="mt-2 text-sm text-white/75">{plural(collection.plan_count, 'plan')}{collection.badge_count ? ` · ${plural(collection.badge_count, 'badge')}` : ''}</p>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button variant="outline" className="rounded-full border-white bg-white text-violet-800 hover:bg-white/90" onClick={() => router.push(discoverCollectionHref(orgslug, collection.collection_uuid))}>View the collection</Button>
        <div className="[&_button]:border-white/40 [&_button]:bg-white/15 [&_button]:text-white [&_button:hover]:bg-white/25"><CollectionAction orgslug={orgslug} collection={collection} /></div>
      </div>
    </div>
    <div className="grid aspect-square grid-cols-2 gap-1.5 rounded-2xl bg-white/15 p-1.5">
      {cells.map((thumb, index) => thumb ? <PlanCover key={thumb.template_uuid} plan={thumb} className="rounded-xl" /> : <span key={index} className="rounded-xl bg-white/10" />)}
    </div>
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
      toast.success('Framework added to your requirements.')
      if (created?.framework_uuid) router.push(getUriWithOrg(orgslug, routePaths.org.admin.requirementFrameworkPlans(created.framework_uuid, 'details')))
    } catch (error: any) { toast.error(error?.message || 'Could not add the framework.') } finally { setBusy(null) }
  }
  return <Section title="Requirement frameworks">
    <Row>{frameworks.map((framework: any) => <div key={framework.framework_uuid} className="flex w-72 shrink-0 snap-start items-center gap-3 rounded-2xl border border-border bg-card p-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><ListChecks size={18} aria-hidden="true" /></span>
      <span className="min-w-0 flex-1"><b className="block truncate text-sm">{framework.name}</b><span className="block truncate text-xs text-muted-foreground">{framework.owner_org_name || 'Life2Launch'} · {plural(framework.node_count || 0, 'requirement')}</span></span>
      {canAdd ? <Button size="sm" variant="outline" className="rounded-full" disabled={busy === framework.framework_uuid} onClick={() => void copy(framework.framework_uuid)}>Add</Button> : null}
    </div>)}</Row>
  </Section>
}

/** Badges other organizations list: issue one by running one of its plans, once its creator approves. */
function Badges() {
  const { orgId, token, ready, canAdd } = useDiscoverContext()
  const { data: badges = [] } = useSWR(ready ? [MARKETPLACE_KEY, 'badges', orgId, token] : null, async () => {
    const response: any = await browseMarketplaceBadges(orgId, undefined, token)
    const list = response?.success !== undefined ? response.data : response
    return (Array.isArray(list) ? list : []).filter((item: any) => !item.is_own_badge)
  })
  if (!badges.length) return null
  return <Section title="Badges">
    <Row>{badges.map((item: any) => <div key={item.badge.badge_uuid} className="flex w-72 shrink-0 snap-start flex-col gap-2 rounded-2xl border border-border bg-card p-4">
      <span className="flex items-center gap-2"><Award size={18} className="shrink-0 text-amber-600" aria-hidden="true" /><b className="truncate text-sm">{item.badge.name}</b></span>
      <span className="truncate text-xs text-muted-foreground">{item.creator_org?.name}</span>
      <div className="mt-auto pt-1"><BadgeMarketplaceActions item={item} orgId={orgId} admin={canAdd} onChange={() => void mutate(isMarketplaceKey)} /></div>
    </div>)}</Row>
  </Section>
}
