'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { useSWRConfig } from 'swr'
import toast from 'react-hot-toast'
import { Check, Copy, ListBullets, Lock, LockOpen, Medal, Plus } from '@phosphor-icons/react'
import FilterBar from '@components/Admin/Filters/FilterBar'
import { useFilters } from '@components/Admin/Filters/useFilters'
import { useOrg } from '@components/Contexts/OrgContext'
import { useStaff } from '@components/Goals/admin/assignments/shared'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { templatesApi, type LibraryTemplate } from '@services/goals/templates'
import { requirementsApi } from '@services/goals/requirements'
import {
  browseMarketplaceBadges,
  isMarketplaceKey,
  MARKETPLACE_KEY,
  templateMarketplaceApi,
  type MarketplaceOrg,
  type MarketplaceTemplate,
} from '@services/learning/marketplace'
import { isOn, matchesSearch, type FilterSpec } from '@/lib/admin/filters'
import { cn } from '@/lib/utils'
import { BadgeMarketplaceActions, StatusPill } from './BadgeIssuing'

type Kind = 'templates' | 'badges' | 'frameworks'
const LIBRARY = 'library'

/** One card in Browse: a listed template, a global-library template, a badge or a framework. */
type Card =
  | { kind: 'templates'; key: string; creator: string; creatorName: string; title: string; description: string; frameworks: string[]; badge: boolean; open: boolean; listed: MarketplaceTemplate }
  | { kind: 'templates'; key: string; creator: string; creatorName: string; title: string; description: string; frameworks: string[]; badge: false; open: true; library: LibraryTemplate }
  | { kind: 'badges'; key: string; creator: string; creatorName: string; title: string; description: string; frameworks: string[]; badge: true; open: boolean; item: any }
  | { kind: 'frameworks'; key: string; creator: string; creatorName: string; title: string; description: string; frameworks: string[]; badge: false; open: true; framework: any }

const KIND_LABEL: Record<Kind, string> = { templates: 'Template', badges: 'Badge', frameworks: 'Framework' }
const SECTION_LABEL: Record<Kind, string> = { templates: 'Templates', badges: 'Badges', frameworks: 'Requirement frameworks' }

const listOf = <T,>(response: any): T[] => {
  const data = response?.success !== undefined ? response.data : response
  return Array.isArray(data) ? data : []
}

/** Fetches, but a 403 (staff on an admin-only list) reads as empty. */
async function orEmpty<T>(load: () => Promise<T[]>): Promise<T[]> {
  try { return await load() } catch { return [] }
}

function orgKey(org: MarketplaceOrg | null | undefined) {
  return org ? String(org.id) : ''
}

/**
 * Browse: templates (listed by other orgs and in the global library), badges and requirement
 * frameworks other organizations share, in one card grid with the shared filters. `?type=` comes
 * from "Add from marketplace" on the Templates, Badges and Requirements tabs. Admins add, ask and
 * copy; staff look.
 */
export default function MarketplaceBrowse() {
  const { orgId, token, admin } = useStaff()
  const ready = Boolean(orgId && token)
  const { data: listed = [], mutate: reloadListed } = useSWR(ready ? [MARKETPLACE_KEY, 'templates', orgId, token] : null, () => orEmpty(() => templateMarketplaceApi.browse(orgId, '', token)))
  const { data: library = [] } = useSWR(ready ? [MARKETPLACE_KEY, 'template-library', orgId, token] : null, () => orEmpty(() => templatesApi.library(orgId, '', token)))
  const { data: badges = [], mutate: reloadBadges } = useSWR(ready ? [MARKETPLACE_KEY, 'badges', orgId, token] : null, async () => listOf<any>(await browseMarketplaceBadges(orgId, undefined, token)))
  const { data: frameworks = [] } = useSWR(ready ? [MARKETPLACE_KEY, 'framework-library', orgId, token] : null, () => orEmpty(() => requirementsApi.library(orgId, '', token)))
  const { mutate } = useSWRConfig()
  const refresh = React.useCallback(() => { void reloadListed(); void reloadBadges(); void mutate(isMarketplaceKey) }, [reloadListed, reloadBadges, mutate])

  // Your own listings show too (marked "Yours"), so publishing from Template › Settings visibly lands here;
  // a library copy of a listed template is the same template, so it shows once.
  const listedUuids = React.useMemo(() => new Set(listed.map((item) => item.template_uuid)), [listed])
  const cards = React.useMemo<Card[]>(() => [
    ...listed.map((item): Card => ({
      kind: 'templates', key: item.template_uuid, creator: orgKey(item.creator_org), creatorName: item.creator_org?.name || 'Unknown organization',
      title: item.title, description: item.description, frameworks: item.frameworks.map((framework) => framework.name), badge: item.badges.length > 0,
      open: item.access === 'open', listed: item,
    })),
    ...library.filter((item) => !listedUuids.has(item.template_uuid)).map((item): Card => ({
      kind: 'templates', key: `library:${item.template_uuid}`, creator: LIBRARY, creatorName: item.owner_org_name || 'Global library',
      title: item.title, description: item.description, frameworks: [], badge: false, open: true, library: item,
    })),
    ...badges.filter((item) => !item.is_own_badge).map((item): Card => ({
      kind: 'badges', key: item.badge.badge_uuid, creator: orgKey(item.creator_org), creatorName: item.creator_org?.name || 'Unknown organization',
      title: item.badge.name, description: item.badge.description || '', frameworks: [], badge: true, open: false, item,
    })),
    ...frameworks.map((item: any): Card => ({
      kind: 'frameworks', key: item.framework_uuid, creator: LIBRARY, creatorName: item.owner_org_name || 'Global library',
      title: item.name, description: item.description || '', frameworks: [item.name], badge: false, open: true, framework: item,
    })),
  ], [listed, listedUuids, library, badges, frameworks])

  const specs = React.useMemo<FilterSpec[]>(() => {
    const creators = new Map<string, string>()
    cards.forEach((card) => creators.set(card.creator, card.creator === LIBRARY ? 'Global library' : card.creatorName))
    const frameworkNames = [...new Set(cards.flatMap((card) => card.frameworks))].sort()
    return [
      { key: 'type', label: 'Type', options: [{ value: '', label: 'Everything' }, { value: 'templates', label: 'Templates' }, { value: 'badges', label: 'Badges' }, { value: 'frameworks', label: 'Requirement frameworks' }] },
      { key: 'creator', label: 'Creator', options: [{ value: '', label: 'Anyone' }, ...[...creators].map(([value, label]) => ({ value, label }))] },
      { key: 'fw', label: 'Maps to', options: [{ value: '', label: 'Any framework' }, ...frameworkNames.map((name) => ({ value: name, label: name }))] },
      { key: 'badge', label: 'Earns a badge', bool: true },
      { key: 'open', label: 'Open to any org', bool: true },
    ]
  }, [cards])
  const filters = useFilters(specs)
  const { values } = filters
  const shown = cards.filter((card) => (!values.type || card.kind === values.type)
    && (!values.creator || card.creator === values.creator)
    && (!values.fw || card.frameworks.includes(values.fw))
    && (!isOn(values, 'badge') || card.badge)
    && (!isOn(values, 'open') || card.open)
    && matchesSearch(filters.query, card.title, card.description, card.creatorName, ...card.frameworks))
  const kinds = (['templates', 'badges', 'frameworks'] as Kind[]).filter((kind) => !values.type || values.type === kind)

  return <div className="space-y-6">
    <p className="max-w-[70ch] text-sm text-gray-600">
      Templates, badges and requirement frameworks other organizations share. A <b>locked</b> template runs as its creator publishes it; an <b>open</b> one you copy and make your own. Badges stay with their creator, who says which templates earn them.
      {admin ? null : <b> Only admins can add or request.</b>}
    </p>
    <FilterBar filters={filters} placeholder="Search templates, badges, frameworks or creators" summary={`${shown.length} of ${cards.length} shown`} />
    {kinds.map((kind) => {
      const items = shown.filter((card) => card.kind === kind)
      return <section key={kind} aria-label={SECTION_LABEL[kind]}>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-gray-500">{SECTION_LABEL[kind]} · {items.length}</h2>
        {items.length ? <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))]">
          {items.map((card) => <MarketCard key={card.key} card={card} orgId={orgId} token={token} admin={admin} onChange={refresh} />)}
        </div> : <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">Nothing matches.</div>}
      </section>
    })}
  </div>
}

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function Chip({ children, tone = 'line' }: { children: React.ReactNode; tone?: 'line' | 'badge' | 'ok' | 'wait' }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', {
    line: 'border border-gray-200 text-gray-700',
    badge: 'bg-amber-100 text-amber-800',
    ok: 'bg-green-100 text-green-800',
    wait: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
  }[tone])}>{children}</span>
}

function MarketCard({ card, orgId, token, admin, onChange }: { card: Card; orgId: number; token?: string; admin: boolean; onChange: () => void }) {
  return <article className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-xs sm:p-5" data-testid="marketplace-card" data-kind={card.kind}>
    <div className="flex items-center gap-2 text-sm text-gray-600">
      <span className="inline-grid h-7 w-7 shrink-0 place-items-center rounded-md bg-gray-100 text-[11px] font-bold text-gray-700">{initials(card.creatorName)}</span>
      <span className="min-w-0 flex-1 truncate">{card.creatorName}</span>
      <Chip>{KIND_LABEL[card.kind]}</Chip>
    </div>
    <h3 className="flex items-center gap-2 text-lg font-bold leading-snug text-gray-950">
      {card.kind === 'badges' ? <Medal size={20} className="shrink-0 text-amber-600" aria-hidden="true" /> : null}{card.title}
    </h3>
    {card.description ? <p className="line-clamp-3 text-sm text-gray-600">{card.description}</p> : null}
    {'listed' in card ? <ListedTemplateBody item={card.listed} /> : null}
    {'library' in card ? <div className="flex flex-wrap gap-1.5"><Chip><LockOpen size={13} />Open · copy and edit</Chip><Chip>No badge</Chip></div> : null}
    {'framework' in card ? <p className="flex items-center gap-1.5 text-sm text-gray-600"><ListBullets size={14} />{card.framework.node_count} requirements · version {card.framework.version}</p> : null}
    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
      <span className="text-xs text-gray-500">{footNote(card)}</span>
      <CardAction card={card} orgId={orgId} token={token} admin={admin} onChange={onChange} />
    </div>
  </article>
}

function footNote(card: Card) {
  if ('listed' in card) return `${card.listed.stage_count} stage${card.listed.stage_count === 1 ? '' : 's'} · ${card.listed.step_count} step${card.listed.step_count === 1 ? '' : 's'}${card.listed.published_version ? ` · v${card.listed.published_version}` : ''}`
  if ('library' in card) return `${card.library.stage_count} stage${card.library.stage_count === 1 ? '' : 's'} · ${card.library.step_count} steps`
  if ('framework' in card) return 'Free to use'
  return card.item.authorization?.status === 'approved' ? 'You issue this badge' : 'Ask to issue'
}

function ListedTemplateBody({ item }: { item: MarketplaceTemplate }) {
  return <>
    <div className="flex flex-wrap gap-1.5">
      {item.mode === 'locked' ? <Chip><Lock size={13} />Locked · run as-is</Chip> : <Chip><LockOpen size={13} />Open · copy and edit</Chip>}
      {item.badges.length ? item.badges.map((badge) => <Chip key={badge.route_uuid} tone="badge"><Medal size={13} />Earns {badge.name}</Chip>) : <Chip>No badge</Chip>}
    </div>
    {item.frameworks.length
      ? item.frameworks.map((framework) => <p key={framework.framework_uuid} className="flex items-center gap-1.5 text-sm text-gray-600"><ListBullets size={14} className="shrink-0" />Maps to {framework.node_count} {framework.name}</p>)
      : <p className="flex items-center gap-1.5 text-sm text-gray-500"><ListBullets size={14} />No requirement mapping</p>}
  </>
}

function CardAction({ card, orgId, token, admin, onChange }: { card: Card; orgId: number; token?: string; admin: boolean; onChange: () => void }) {
  const router = useRouter()
  const org = useOrgSlug()
  const [busy, setBusy] = React.useState(false)
  const run = async (action: () => Promise<any>, done: string, fail: string) => {
    setBusy(true)
    try { const result = await action(); toast.success(done); onChange(); return result } catch (error: any) { toast.error(error?.message || fail); return null } finally { setBusy(false) }
  }
  const openTemplate = (uuid: string) => router.push(getUriWithOrg(org, routePaths.org.admin.templatePage(uuid, 'overview')))
  const button = (label: React.ReactNode, onClick: () => void, primary = true) => <button type="button" disabled={busy} onClick={onClick}
    className={cn('inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold disabled:opacity-50', primary ? 'bg-black text-white hover:bg-black/85' : 'border border-gray-200 bg-white hover:bg-gray-50')}>{label}</button>

  if (card.kind === 'badges') return admin ? <BadgeMarketplaceActions item={card.item} orgId={orgId} onChange={onChange} /> : card.item.authorization ? <StatusPill status={card.item.authorization.status} /> : null
  if ('framework' in card) {
    if (!admin) return null
    return button(<><Copy size={15} />Copy to your frameworks</>, async () => {
      const created = await run(() => requirementsApi.copyFromLibrary(orgId, card.framework.framework_uuid, token), 'Requirement framework copied.', 'Could not copy the framework.')
      if (created?.framework_uuid) router.push(getUriWithOrg(org, routePaths.org.admin.requirementFrameworkPlans(created.framework_uuid, 'details')))
    })
  }
  if ('library' in card) {
    if (!admin) return null
    return button(<><Copy size={15} />Copy to your templates</>, async () => {
      const created = await run(() => templatesApi.copyFromLibrary(orgId, card.library.template_uuid, token), 'Template copied. It’s a draft of your own.', 'Could not copy the library template.')
      if (created?.template_uuid) openTemplate(created.template_uuid)
    })
  }
  const item = card.listed
  if (item.is_own) return <div className="flex items-center gap-2"><Chip tone="ok"><Check size={13} />Yours · listed</Chip>{button('Listing', () => router.push(getUriWithOrg(org, routePaths.org.admin.templatePage(item.template_uuid, 'settings'))), false)}</div>
  const status = item.authorization?.status
  const locked = item.mode === 'locked'
  if (status === 'approved' && locked) return <div className="flex items-center gap-2"><Chip tone="ok"><Check size={13} />Yours to run</Chip>{button('Open', () => openTemplate(item.template_uuid), false)}</div>
  if (status === 'requested') return <Chip tone="wait">Request sent</Chip>
  if (!admin) return <span className="text-xs text-gray-500">{item.access === 'open' ? 'Open to any org' : 'Ask to use'}</span>
  if (!locked && (status === 'approved' || item.access === 'open')) {
    return <div className="flex items-center gap-2">
      {item.authorization?.copied_template_uuid ? button('Your copy', () => openTemplate(item.authorization!.copied_template_uuid!), false) : null}
      {button(<><Copy size={15} />{item.authorization?.copied_template_uuid ? 'Copy again' : 'Copy to your templates'}</>, async () => {
        const created = await run(() => templateMarketplaceApi.copy(orgId, item.template_uuid, token), `Copied. Based on ${item.title} by ${item.creator_org?.name || 'its creator'}.`, 'Could not copy the template.')
        if (created?.template_uuid) openTemplate(created.template_uuid)
      })}
    </div>
  }
  const ask = item.access === 'open' ? 'Add to your templates' : locked ? 'Ask to run' : 'Ask to copy'
  return button(<><Plus size={15} />{status === 'rejected' || status === 'revoked' ? `${ask} again` : ask}</>, () => void run(
    () => templateMarketplaceApi.request({ template_uuid: item.template_uuid, issuer_org_id: orgId }, token),
    item.access === 'open' ? 'Added. You can assign it like your own templates.' : `Request sent to ${item.creator_org?.name || 'the creator'}.`,
    'Could not send the request.',
  ))
}

function useOrgSlug() {
  const org = useOrg() as { slug?: string } | null
  return org?.slug || ''
}
