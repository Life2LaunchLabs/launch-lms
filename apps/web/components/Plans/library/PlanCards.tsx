'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { ArrowRight, Check, Clock, Folder, FolderMinus, Globe, Loader2, Medal, MoreVertical, Pencil, Plus, X } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Textarea } from '@components/ui/textarea'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { collectionsApi, isCollectionsKey, type PlanCollection } from '@services/goals/collections'
import { discoverApi, isDiscoverKey } from '@services/goals/discover'
import { isTemplatesKey, type TemplateListItem } from '@services/goals/templates'
import { cn } from '@/lib/utils'
import { CoverGrid, PlanCover } from '@components/Plans/shared/PlanCover'
import { plural } from '@components/Plans/plan/planVersions'

export const planHref = (orgslug: string, uuid: string) => getUriWithOrg(orgslug, routePaths.org.admin.template(uuid))
export const collectionHref = (orgslug: string, uuid: string) => getUriWithOrg(orgslug, routePaths.org.admin.planCollection(uuid))

const refresh = () => Promise.all([mutate(isCollectionsKey), mutate(isTemplatesKey), mutate(isDiscoverKey)])

/** A section heading with its count, and any tools on the right. */
export function SectionHeader({ id, title, count, className, children }: { id?: string; title: string; count?: number; className?: string; children?: React.ReactNode }) {
  return <div className={cn('mb-3.5 mt-[30px] flex flex-wrap items-center justify-between gap-3', className)}>
    <h2 id={id} className="flex items-center gap-2 text-[17px] font-bold tracking-tight">{title}{count !== undefined ? <span className="text-[13px] font-semibold text-muted-foreground">{count}</span> : null}</h2>
    {children ? <div className="flex items-center gap-2">{children}</div> : null}
  </div>
}

/** The plan grid: square cards, as many columns as fit. */
export const planGridClass = 'grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-3 gap-y-5 sm:grid-cols-[repeat(auto-fill,minmax(176px,1fr))] sm:gap-x-4 sm:gap-y-6'

/**
 * A plan card: the square cover (globe when it's in Discover, Draft or Requested in the corner, ⋮ on
 * hover), the title, then steps, a collection it's in and a medal when it earns a badge.
 */
export function PlanCard({ orgslug, plan, collections, canEdit, orgId, token, inCollection }: {
  orgslug: string; plan: TemplateListItem; collections: PlanCollection[]; canEdit: boolean; orgId: number; token?: string
  /** Shown inside this collection: its tag is left off and ⋮ offers removing the plan from it. */
  inCollection?: PlanCollection
}) {
  // A plan asked for from Discover opens there until its creator approves.
  const href = plan.requested ? getUriWithOrg(orgslug, routePaths.org.admin.discoverPlan(plan.template_uuid)) : planHref(orgslug, plan.template_uuid)
  const tags = (plan.collections || []).filter((item) => item.collection_uuid !== inCollection?.collection_uuid)
  const draft = !plan.requested && !plan.live_version && !plan.published_version
  return <div className="group relative min-w-0" data-testid="plan-card">
    <Link href={href} className="block rounded-2xl outline-offset-4">
      <PlanCover plan={plan} iconSize={46} className={cn('aspect-square w-full rounded-2xl transition group-hover:-translate-y-0.5 group-hover:shadow-[0_1px_2px_hsl(200_30%_10%/.06),0_8px_28px_hsl(200_30%_10%/.08)]',
        plan.requested && 'after:absolute after:inset-0 after:bg-white/50')}>
        {plan.listed ? <span title="Published to Discover" className="absolute left-2 top-2 z-[2] grid h-[26px] w-[26px] place-items-center rounded-full bg-white/95 text-[#0B8077] shadow-[0_2px_6px_hsl(0_0%_0%/.15)]"><Globe size={15} aria-label="Published to Discover" /></span> : null}
        {plan.requested ? <CornerState icon={Clock} label="Requested" /> : draft ? <CornerState icon={Pencil} label="Draft" /> : null}
      </PlanCover>
      <span className="mt-2.5 block truncate text-[14.5px] font-bold">{plan.title || 'Untitled plan'}</span>
      <span className="mt-1 flex h-5 min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground">
        <span className="shrink-0 whitespace-nowrap">{plural(plan.step_count || 0, 'step')}</span>
        {tags.length ? <span className="min-w-0 truncate rounded-full bg-muted px-2 py-0.5 text-[11.5px] font-semibold">{tags[0].name}{tags.length > 1 ? ` +${tags.length - 1}` : ''}</span> : null}
        {plan.badge ? <Medal size={18} className="ml-auto shrink-0 text-[hsl(38_85%_42%)]" aria-label="Earns a badge" /> : null}
      </span>
    </Link>
    {canEdit ? <PlanMenu plan={plan} href={href} collections={collections} orgId={orgId} token={token} inCollection={inCollection} /> : null}
  </div>
}

function CornerState({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return <span className="absolute bottom-2 left-2 z-[2] inline-flex items-center gap-1.5 rounded-full bg-[hsl(200_30%_10%/.8)] py-1 pl-[7px] pr-[9px] text-[11.5px] font-bold text-white backdrop-blur-sm">
    <Icon size={13} aria-hidden="true" />{label}
  </span>
}

/** ⋮ on a plan card: Add to › a collection (or a new one), Remove from this collection, Open. Requested plans: View or Cancel the request. */
function PlanMenu({ plan, href, collections, orgId, token, inCollection }: {
  plan: TemplateListItem; href: string; collections: PlanCollection[]; orgId: number; token?: string; inCollection?: PlanCollection
}) {
  const router = useRouter()
  const [newOpen, setNewOpen] = React.useState(false)
  const inside = new Set((plan.collections || []).map((item) => item.collection_uuid))
  const run = async (action: () => Promise<unknown>, done: string, failed: string) => {
    try { await action(); await refresh(); toast.success(done) } catch (error: any) { toast.error(error?.message || failed) }
  }
  const toggle = (collection: PlanCollection) => inside.has(collection.collection_uuid)
    ? run(() => collectionsApi.removePlan(orgId, collection.collection_uuid, plan.template_uuid, token), `Removed from ${collection.name}.`, 'Could not change the collection.')
    : run(() => collectionsApi.addPlans(orgId, collection.collection_uuid, [plan.template_uuid], token), `Added to ${collection.name}.`, 'Could not change the collection.')
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`More for ${plan.title}`} className="absolute right-2 top-2 z-[3] grid h-8 w-8 place-items-center rounded-full bg-white/95 text-[hsl(200_30%_9%)] opacity-0 shadow-[0_2px_8px_hsl(0_0%_0%/.18)] transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100">
          <MoreVertical size={18} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-[14px] p-1.5">
        {plan.requested ? <>
          <DropdownMenuItem onSelect={() => router.push(href)}><ArrowRight />View request</DropdownMenuItem>
          <DropdownMenuItem className="text-red-700 focus:text-red-700" onSelect={() => void run(() => discoverApi.cancelRequest(orgId, plan.template_uuid, token), 'Request cancelled.', 'Could not cancel the request.')}><X />Cancel request</DropdownMenuItem>
        </> : <>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger><Folder size={16} />Add to</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto rounded-[14px] p-1.5">
              {collections.map((collection) => <DropdownMenuItem key={collection.collection_uuid} onSelect={(event) => { event.preventDefault(); void toggle(collection) }}>
                <span className={cn('grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border-[1.5px]', inside.has(collection.collection_uuid) ? 'border-brand bg-brand text-white' : 'border-border')}>
                  {inside.has(collection.collection_uuid) ? <Check size={11} /> : null}
                </span><span className="truncate">{collection.name}</span>
              </DropdownMenuItem>)}
              {collections.length ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem onSelect={() => setNewOpen(true)}><Plus />New collection</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {inCollection ? <DropdownMenuItem onSelect={() => void run(() => collectionsApi.removePlan(orgId, inCollection.collection_uuid, plan.template_uuid, token), `Removed from ${inCollection.name}.`, 'Could not remove the plan.')}>
            <FolderMinus /><span className="truncate">Remove from {inCollection.name}</span>
          </DropdownMenuItem> : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => router.push(href)}><ArrowRight />Open</DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
    <NewCollectionModal open={newOpen} setOpen={setNewOpen} orgId={orgId} token={token} templateUuids={[plan.template_uuid]} />
  </>
}

/** Name a new collection, optionally starting with some plans. */
export function NewCollectionModal({ open, setOpen, orgId, token, templateUuids = [], onCreated }: {
  open: boolean; setOpen: React.Dispatch<React.SetStateAction<boolean>>; orgId: number; token?: string; templateUuids?: string[]; onCreated?: React.Dispatch<PlanCollection>
}) {
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => { if (open) { setName(''); setDescription('') } }, [open])
  const create = async () => {
    setBusy(true)
    try {
      const created = await collectionsApi.create(orgId, { name: name.trim(), description: description.trim(), template_uuids: templateUuids }, token)
      await refresh()
      toast.success(`${created.name} created.`)
      setOpen(false)
      onCreated?.(created)
    } catch (error: any) { toast.error(error?.message || 'Could not create the collection.') } finally { setBusy(false) }
  }
  return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="sm" dialogTitle="New collection"
    dialogDescription="Collections group plans: a term, a program, a pathway. A plan can be in as many as you like."
    dialogContent={<form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (name.trim() && !busy) void create() }}>
      <Input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Career exploration" aria-label="Collection name" maxLength={120} />
      <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What ties these plans together (optional)" aria-label="Collection description" rows={2} maxLength={1000} />
      <Button type="submit" className="ml-auto flex" disabled={busy || !name.trim()}>{busy ? <Loader2 className="animate-spin" /> : <Plus />}Create collection</Button>
    </form>} />
}

const collectionCardClass = 'block w-[176px] shrink-0 snap-start rounded-[20px] border border-border bg-card px-2.5 pb-3.5 pt-2.5 text-left transition hover:-translate-y-0.5 hover:shadow-[0_1px_2px_hsl(200_30%_10%/.06),0_8px_28px_hsl(200_30%_10%/.08)] sm:w-[220px]'

/** A collection card: a 2×2 grid of its first plans' covers (blank cells stay blank), "N plans", then the name. */
export function CollectionCard({ orgslug, collection }: { orgslug: string; collection: PlanCollection }) {
  return <Link href={collectionHref(orgslug, collection.collection_uuid)} className={collectionCardClass} data-testid="collection-card">
    <CoverGrid plans={collection.thumbs} />
    <span className="mx-1 mb-0.5 mt-3 flex items-center gap-1 truncate text-[12.5px] font-medium text-muted-foreground">
      {plural(collection.plan_count, 'plan')}
      {collection.published_count >= 2 ? <Globe size={14} className="text-[#0B8077]" aria-label="In Discover" /> : null}
    </span>
    <b className="mx-1 block truncate text-base font-bold tracking-tight">{collection.name}</b>
  </Link>
}

/** The dashed card at the end of the collections row. */
export function NewCollectionCard({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className={cn(collectionCardClass, 'flex flex-col items-center justify-center gap-2.5 border-[1.5px] border-dashed bg-transparent text-sm font-bold text-muted-foreground hover:translate-y-0 hover:border-foreground/40 hover:text-foreground hover:shadow-none')}>
    <span className="grid h-[46px] w-[46px] place-items-center rounded-full bg-muted text-foreground"><Plus size={20} /></span>New collection
  </button>
}
