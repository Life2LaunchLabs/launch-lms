'use client'

import React from 'react'
import Link from 'next/link'
import useSWR, { useSWRConfig } from 'swr'
import toast from 'react-hot-toast'
import { GitFork, Lock, LockOpen, Storefront } from '@phosphor-icons/react'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { TemplateDetail } from '@services/goals/templates'
import {
  isMarketplaceKey,
  MARKETPLACE_KEY,
  templateMarketplaceApi,
  type MarketplaceOrg,
  type TemplateListingAccess,
  type TemplateListingMode,
} from '@services/learning/marketplace'
import { cn } from '@/lib/utils'

/** Where a copied template came from, as the API adds it to an owned template. */
export type TemplateProvenanceInfo = { template_uuid: string; title: string; version: number | null; org: MarketplaceOrg | null }

/** "Based on <plan> by <org>" on a template copied from another organization's open template. */
export function TemplateProvenance({ template }: { template: TemplateDetail }) {
  const basedOn = (template as TemplateDetail & { based_on?: TemplateProvenanceInfo | null }).based_on
  if (!basedOn) return null
  return <p className="mx-4 mt-4 flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700 sm:mx-10" data-testid="template-provenance">
    <GitFork size={16} className="shrink-0 text-gray-500" aria-hidden="true" />
    <span>Based on <b>{basedOn.title}</b>{basedOn.version ? ` v${basedOn.version}` : ''} by <b>{basedOn.org?.name || 'another organization'}</b>. This copy is yours to change.</span>
  </p>
}

const MODES: { value: TemplateListingMode; label: string; detail: string; icon: typeof Lock }[] = [
  { value: 'locked', label: 'Locked', detail: 'Others run it as you publish it. They can’t change it; your new versions reach them when they choose to move up.', icon: Lock },
  { value: 'open', label: 'Open', detail: 'Others copy it into a template of their own and change it to suit them. Copies say they’re based on yours.', icon: LockOpen },
]
const ACCESS: { value: TemplateListingAccess; label: string; detail: string }[] = [
  { value: 'request', label: 'Ask first', detail: 'Organizations request it and you approve each one.' },
  { value: 'open', label: 'Open to any org', detail: 'Any organization can add it right away.' },
]

/**
 * Template › Publish › Marketplace listing: publish this template to the marketplace, locked (run
 * as-is) or open (copy and edit), and whether orgs ask first. Any template can be listed, with or
 * without a badge; which templates earn a badge is set on the badge's routes. "Publish" means only
 * this; saving a new version of the template is "Release".
 */
export default function TemplateMarketplaceListing({ orgId, token, template }: { orgId: number; token?: string; template: TemplateDetail }) {
  const org = useOrg() as { slug?: string } | null
  const { mutate } = useSWRConfig()
  const key = orgId && token ? [MARKETPLACE_KEY, 'listing', orgId, template.template_uuid, token] : null
  const { data: listing, mutate: reload } = useSWR(key, () => templateMarketplaceApi.listing(orgId, template.template_uuid, token))
  const [mode, setMode] = React.useState<TemplateListingMode>('locked')
  const [access, setAccess] = React.useState<TemplateListingAccess>('request')
  const [saving, setSaving] = React.useState(false)
  const [failure, setFailure] = React.useState<{ message: string; needsPublisher: boolean } | null>(null)
  React.useEffect(() => { if (listing) { setMode(listing.mode); setAccess(listing.access) } }, [listing])
  if (template.system_type) return null
  const published = Boolean(template.published_version)
  const save = async (listed: boolean) => {
    setSaving(true)
    setFailure(null)
    try {
      await reload(await templateMarketplaceApi.setListing(orgId, template.template_uuid, { listed, mode, access }, token), false)
      await mutate(isMarketplaceKey)
      toast.success(listed ? 'Listed in the marketplace.' : 'Taken out of the marketplace. Orgs already using it keep it.')
    } catch (error: any) {
      const message = error?.message || 'Could not update the marketplace listing.'
      // A 403 naming plan publishing: the organization isn't a plan publisher yet (Organization › Plan has the application).
      setFailure({ message, needsPublisher: error?.status === 403 && /plan publish/i.test(message) })
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }
  const changed = listing ? listing.mode !== mode || listing.access !== access : false
  return <section className="rounded-xl border border-border bg-card p-6 shadow-xs" aria-label="Marketplace listing" data-testid="template-marketplace-listing">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold"><Storefront size={18} />Marketplace listing</h2>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">Share this template with other organizations, with or without a badge. They run your latest released version.</p>
      </div>
      {listing?.listed ? <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">In the marketplace</span> : <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">Not listed</span>}
    </div>
    <fieldset className="mt-5 space-y-2">
      <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">How others use it</legend>
      {MODES.map(({ value, label, detail, icon: Icon }) => <label key={value} className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3', mode === value ? 'border-black' : 'border-border')}>
        <input type="radio" name={`listing-mode-${template.template_uuid}`} value={value} checked={mode === value} onChange={() => setMode(value)} className="mt-1" />
        <span><span className="flex items-center gap-1.5 text-sm font-bold"><Icon size={14} />{label}</span><span className="block text-xs text-muted-foreground">{detail}</span></span>
      </label>)}
    </fieldset>
    <fieldset className="mt-4 space-y-2">
      <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Who can add it</legend>
      {ACCESS.map(({ value, label, detail }) => <label key={value} className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3', access === value ? 'border-black' : 'border-border')}>
        <input type="radio" name={`listing-access-${template.template_uuid}`} value={value} checked={access === value} onChange={() => setAccess(value)} className="mt-1" />
        <span><span className="block text-sm font-bold">{label}</span><span className="block text-xs text-muted-foreground">{detail}</span></span>
      </label>)}
    </fieldset>
    {!published ? <p className="mt-4 text-sm text-amber-700">Release a version of the template before listing it.</p> : null}
    {listing?.listed ? <p className="mt-4 text-sm text-muted-foreground" data-testid="template-marketplace-listed">
      Other organizations see it in{' '}
      <Link className="font-semibold text-foreground underline" href={getUriWithOrg(org?.slug || '', routePaths.org.admin.marketplace())}>Plans › Discover</Link>
      {listing.mode === 'open' && listing.access === 'open' ? ', and in the global template library, which copies your published version' : ''}.
    </p> : null}
    {failure ? <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" data-testid="template-marketplace-error">
      <p className="font-semibold">{failure.needsPublisher ? 'Your organization needs publisher access to list templates.' : 'Couldn’t update the listing.'}</p>
      <p className="mt-1">{failure.message.replace(/\.$/, '')}.{failure.needsPublisher ? <> Apply for the plan publisher program in{' '}
        <Link className="font-semibold underline" href={getUriWithOrg(org?.slug || '', routePaths.org.admin.organization.plan())}>Organization settings › Plan</Link>; the platform team reviews it.</> : null}</p>
    </div> : null}
    <div className="mt-5 flex flex-wrap gap-2">
      {listing?.listed ? <>
        <button type="button" disabled={saving || !changed} onClick={() => void save(true)} className="inline-flex h-9 items-center rounded-lg bg-black px-4 text-xs font-bold text-white disabled:opacity-50">Save listing</button>
        <button type="button" disabled={saving} onClick={() => void save(false)} className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-xs font-bold disabled:opacity-50">Take out of the marketplace</button>
      </> : <button type="button" disabled={saving || !published} onClick={() => void save(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-black px-4 text-xs font-bold text-white disabled:opacity-50"><Storefront size={14} />Publish to marketplace</button>}
    </div>
  </section>
}
