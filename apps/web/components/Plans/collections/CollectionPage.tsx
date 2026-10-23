'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { Check, Globe, Loader2, MoreVertical, Plus, Sparkles, Trash2, X } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { Button } from '@components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { useFeatures } from '@components/Hooks/useFeatures'
import { useCanEditPlans } from '@components/Plans/shared/useCanEditPlans'
import { EmptyState } from '@components/Goals/admin/live/ui'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { collectionKeys, collectionsApi, isCollectionsKey } from '@services/goals/collections'
import { addedAsListItems, discoverApi, discoverKeys } from '@services/goals/discover'
import { isTemplatesKey, templateKeys, templatesApi } from '@services/goals/templates'
import { cn } from '@/lib/utils'
import { PlanCard, SectionHeader, planGridClass } from '@components/Plans/library/PlanCards'
import { CoverGrid, PlanCover } from '@components/Plans/shared/PlanCover'
import { plural } from '@components/Plans/plan/planVersions'

const MAX_CATEGORIES = 3

/** One collection: its name and description (edited in place), up to three categories, and its plans. */
export default function CollectionPage({ orgslug, collectionUuid }: { orgslug: string; collectionUuid: string }) {
  const router = useRouter()
  const org = useOrg() as { id?: number } | null
  const session = useLHSession() as { data?: { tokens?: { access_token?: string } } }
  const token = session?.data?.tokens?.access_token
  const orgId = Number(org?.id)
  const canEdit = useCanEditPlans() === true
  const features = useFeatures()
  const ready = Boolean(orgId && token)
  const { data: collection, error } = useSWR(ready ? collectionKeys.one(orgId, collectionUuid) : null, () => collectionsApi.get(orgId, collectionUuid, token))
  const { data: list } = useSWR(ready ? collectionKeys.list(orgId) : null, () => collectionsApi.list(orgId, token))
  const { data: ownPlans } = useSWR(ready ? templateKeys.list(orgId) : null, () => templatesApi.list(orgId, token))
  const { data: added } = useSWR(ready ? discoverKeys.added(orgId) : null, () => discoverApi.added(orgId, token).catch(() => []))
  const plans = React.useMemo(() => ownPlans && [...ownPlans, ...addedAsListItems(added || [])], [ownPlans, added])
  const [addOpen, setAddOpen] = React.useState(false)
  // Opening a collection moves it to the front of the Plans carousel.
  React.useEffect(() => { if (ready) void collectionsApi.opened(orgId, collectionUuid, token).then(() => mutate(collectionKeys.list(orgId))).catch(() => undefined) }, [ready, orgId, collectionUuid, token])

  if (error && !collection) return <div className="p-10"><EmptyState title="Collection not found" detail="It may have been removed." /></div>
  if (!collection || !plans) return <div className="flex min-h-[320px] items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>

  const inside = collection.template_uuids.map((uuid) => plans.find((plan) => plan.template_uuid === uuid)).filter((plan): plan is NonNullable<typeof plan> => !!plan)
  const save = async (data: { name?: string; description?: string; categories?: string[]; starter?: boolean }) => {
    try {
      await mutate(collectionKeys.one(orgId, collectionUuid), await collectionsApi.update(orgId, collectionUuid, data, token), false)
      await mutate(isCollectionsKey)
    } catch (failure: any) { toast.error(failure?.message || 'Could not save the collection.') }
  }
  const remove = async () => {
    if (!window.confirm(`Remove the collection “${collection.name}”? Its ${plural(collection.plan_count, 'plan')} stay in Plans.`)) return
    try {
      await collectionsApi.remove(orgId, collectionUuid, token)
      await Promise.all([mutate(isCollectionsKey), mutate(isTemplatesKey)])
      router.push(getUriWithOrg(orgslug, routePaths.org.admin.plans()))
    } catch (failure: any) { toast.error(failure?.message || 'Could not remove the collection.') }
  }
  const publishes = features.has('plan_publishing') || features.has('badge_publishing')
  return <div className="min-h-full w-full bg-[#f8f8f8]"><div className="mx-auto max-w-[1180px] px-4 pb-16 pt-5 sm:px-8 sm:pt-7">
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
      <Link href={getUriWithOrg(orgslug, routePaths.org.admin.plans())} className="hover:text-foreground">Plans</Link>
      <span aria-hidden="true">/</span>
      <Link href={getUriWithOrg(orgslug, routePaths.org.admin.plans())} className="hover:text-foreground">Collections</Link>
    </nav>
    <header className="mt-4 flex flex-wrap items-start gap-3.5 sm:flex-nowrap sm:gap-[22px]">
      <CoverGrid plans={inside} className="w-[88px] shrink-0 sm:w-[136px]" cellClassName="rounded-lg sm:rounded-[11px]" />
      <div className="min-w-0 flex-[1_1_calc(100%-110px)] sm:flex-1">
        <InlineText value={collection.name} editable={canEdit} label="Collection name" placeholder="Name this collection"
          className="text-[clamp(26px,3vw,36px)] font-extrabold leading-[1.15] tracking-[-0.035em]" onSave={(name) => name ? save({ name }) : undefined} />
        <InlineText value={collection.description} editable={canEdit} label="Collection description" placeholder="Add a description (optional)"
          className="mt-1.5 min-h-[30px] py-1 text-base leading-normal text-muted-foreground focus:text-foreground" onSave={(description) => save({ description })} />
        <Categories value={collection.categories} options={list?.categories || []} editable={canEdit} onChange={(categories) => save({ categories })} />
      </div>
      <div className="flex w-full items-center gap-2 sm:w-auto">
        {publishes ? <span title={collection.published_count >= 2 ? 'In Discover with its published plans' : 'Publish 2 or more of its plans to show it in Discover'}
          className={cn('inline-flex h-10 min-w-10 items-center justify-center gap-[7px] whitespace-nowrap rounded-full text-[13.5px] font-bold', collection.published_count ? 'bg-[#0B8077] pl-3 pr-3.5 text-white' : 'border border-border bg-card px-2.5 text-muted-foreground')}>
          <Globe size={18} aria-label={collection.published_count ? undefined : 'No plans published yet'} />{collection.published_count ? `${collection.published_count} published` : null}
        </span> : null}
        {collection.starter ? <span className="inline-flex h-10 items-center gap-1.5 rounded-full bg-brand-soft px-3.5 text-[13.5px] font-bold text-brand-ink"><Sparkles size={16} aria-hidden="true" />Starter category</span> : null}
        {canEdit ? <DropdownMenu>
          <DropdownMenuTrigger asChild><button type="button" aria-label="Manage collection" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-card hover:bg-muted"><MoreVertical size={18} /></button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-[14px] p-1.5">
            <DropdownMenuItem onSelect={() => setAddOpen(true)}><Plus />Add plans</DropdownMenuItem>
            {features.access.owner ? <DropdownMenuItem onSelect={() => void save({ starter: !collection.starter })}>
              <Sparkles />{collection.starter ? 'Stop using as starters' : 'Use as starter category'}
            </DropdownMenuItem> : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void remove()} className="text-red-700 focus:text-red-700"><Trash2 />Remove collection</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu> : null}
      </div>
    </header>
    {collection.starter ? <p className="mt-[18px] rounded-[14px] bg-brand-soft/60 px-3.5 py-3 text-[13.5px] text-muted-foreground">Its live plans show in every organization’s New plan, under “{collection.name}”.</p> : null}
    <section aria-labelledby="collection-plans-title">
      <SectionHeader id="collection-plans-title" title="Plans" count={inside.length}>
        {canEdit ? <button type="button" onClick={() => setAddOpen(true)} className="inline-flex h-8 items-center gap-2 rounded-full border border-border bg-card px-3 text-[13px] font-semibold hover:bg-muted"><Plus size={15} aria-hidden="true" />Add plans</button> : null}
      </SectionHeader>
      {inside.length ? <ul className={planGridClass}>
        {inside.map((plan) => <li key={plan.template_uuid} className="min-w-0">
          <PlanCard orgslug={orgslug} plan={plan} collections={list?.collections || []} canEdit={canEdit && (!plan.read_only || plan.requested !== undefined)} orgId={orgId} token={token} inCollection={collection} />
        </li>)}
      </ul> : <div className="rounded-[22px] border-[1.5px] border-dashed border-border px-5 py-8 text-center">
        <h2 className="text-lg font-bold">No plans here yet</h2>
        <p className="mx-auto mt-1.5 max-w-[380px] leading-normal text-muted-foreground">Use Add plans, or the ⋮ menu on any plan card. A plan can sit in as many collections as you like.</p>
      </div>}
    </section>
    <AddPlansModal open={addOpen} setOpen={setAddOpen} orgId={orgId} token={token} collectionUuid={collectionUuid}
      candidates={plans.filter((plan) => !plan.system_type && !plan.requested && !collection.template_uuids.includes(plan.template_uuid))} />
  </div></div>
}

/** Text edited in place: click, type, and it saves when you leave the field (Enter for one-line fields). */
function InlineText({ value, editable, label, placeholder, className, onSave }: {
  value: string; editable: boolean; label: string; placeholder?: string; className?: string; onSave: React.Dispatch<string>
}) {
  const [text, setText] = React.useState(value)
  React.useEffect(() => setText(value), [value])
  if (!editable) return value ? <p className={className}>{value}</p> : null
  return <textarea aria-label={label} value={text} placeholder={placeholder} rows={1} onChange={(event) => setText(event.target.value)}
    onBlur={() => { if (text.trim() !== value) onSave(text.trim()) }}
    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } if (event.key === 'Escape') { setText(value); event.currentTarget.blur() } }}
    className={cn('block w-full resize-none border-0 border-b-2 border-transparent bg-transparent p-0 outline-none [field-sizing:content] hover:border-border focus:border-brand', className)} />
}

/** Up to three categories from the fixed set; they describe every plan inside, for Discover. */
function Categories({ value, options, editable, onChange }: { value: string[]; options: string[]; editable: boolean; onChange: React.Dispatch<string[]> }) {
  if (!editable && !value.length) return null
  return <div className="mt-3 flex flex-wrap items-center gap-1.5">
    {value.map((category) => <span key={category} className={cn('inline-flex items-center gap-1 rounded-full bg-brand-soft py-[5px] pl-[11px] text-[12.5px] font-semibold text-brand-ink', editable ? 'pr-[5px]' : 'pr-[11px]')}>
      {category}{editable ? <button type="button" aria-label={`Remove ${category}`} onClick={() => onChange(value.filter((item) => item !== category))} className="grid h-[18px] w-[18px] place-items-center rounded-full hover:bg-brand/15"><X size={11} /></button> : null}
    </span>)}
    {editable && value.length < MAX_CATEGORIES ? <DropdownMenu>
      <DropdownMenuTrigger asChild><button type="button" className="inline-flex items-center gap-[5px] rounded-full border border-dashed border-border px-[11px] py-[5px] text-[12.5px] font-semibold text-muted-foreground hover:bg-card"><Plus size={13} />Category</button></DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 rounded-[14px] p-1.5">
        <DropdownMenuLabel className="px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[.06em] text-muted-foreground">Category · {value.length} of {MAX_CATEGORIES}</DropdownMenuLabel>
        {options.filter((option) => !value.includes(option)).map((option) => <DropdownMenuItem key={option} onSelect={() => onChange([...value, option])}>{option}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu> : null}
    {editable ? <span className="text-xs text-muted-foreground">{value.length ? `${value.length} of ${MAX_CATEGORIES} · applies to every plan here` : `Up to ${MAX_CATEGORIES}. They apply to every plan here and help people find them when published.`}</span> : null}
  </div>
}

/** Pick plans to add; they stay wherever else they are. */
function AddPlansModal({ open, setOpen, orgId, token, collectionUuid, candidates }: {
  open: boolean; setOpen: React.Dispatch<React.SetStateAction<boolean>>; orgId: number; token?: string; collectionUuid: string; candidates: Array<{ template_uuid: string; title: string; thumbnail_image: string; step_count?: number }>
}) {
  const [picked, setPicked] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => { if (open) setPicked([]) }, [open])
  const add = async () => {
    setBusy(true)
    try {
      await collectionsApi.addPlans(orgId, collectionUuid, picked, token)
      await Promise.all([mutate(isCollectionsKey), mutate(isTemplatesKey)])
      setOpen(false)
    } catch (failure: any) { toast.error(failure?.message || 'Could not add the plans.') } finally { setBusy(false) }
  }
  return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="sm" dialogTitle="Add plans"
    dialogContent={<div className="space-y-4">
      {candidates.length ? <ul className="max-h-80 space-y-1 overflow-y-auto">{candidates.map((plan) => {
        const on = picked.includes(plan.template_uuid)
        return <li key={plan.template_uuid}><button type="button" aria-pressed={on} onClick={() => setPicked(on ? picked.filter((uuid) => uuid !== plan.template_uuid) : [...picked, plan.template_uuid])}
          className={cn('flex w-full items-center gap-3 rounded-xl border px-2 py-2 text-left', on ? 'border-foreground bg-muted/60' : 'border-transparent hover:bg-muted/40')}>
          <PlanCover plan={plan} className="h-10 w-10 shrink-0 rounded-lg" />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{plan.title}</span><span className="text-xs text-muted-foreground">{plural(plan.step_count || 0, 'step')}</span></span>
          {on ? <Check size={16} /> : null}
        </button></li>
      })}</ul> : <p className="text-sm text-muted-foreground">Every plan is already in this collection.</p>}
      <Button className="ml-auto flex" onClick={() => void add()} disabled={busy || !picked.length}>{busy ? <Loader2 className="animate-spin" /> : <Plus />}Add {picked.length ? plural(picked.length, 'plan') : 'plans'}</Button>
    </div>} />
}
