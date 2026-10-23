'use client'

import React from 'react'
import Link from 'next/link'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { Award, Check, Clock, Folder, FolderPlus, Layers3, Loader2, MoreVertical, Plus } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { SafeImage } from '@components/Objects/SafeImage'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Textarea } from '@components/ui/textarea'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { collectionsApi, isCollectionsKey, type PlanCollection } from '@services/goals/collections'
import { isTemplatesKey, type TemplateListItem } from '@services/goals/templates'
import { cn } from '@/lib/utils'
import { plural } from './planVersions'

export const planHref = (orgslug: string, uuid: string) => getUriWithOrg(orgslug, routePaths.org.admin.template(uuid))
export const collectionHref = (orgslug: string, uuid: string) => getUriWithOrg(orgslug, routePaths.org.admin.planCollection(uuid))

const refresh = () => Promise.all([mutate(isCollectionsKey), mutate(isTemplatesKey)])

/** A square image, or the layers icon on a soft color picked from the title. */
export function PlanThumb({ title, image, className }: { title: string; image?: string | null; className?: string }) {
  const hue = [...title].reduce((total, char) => total + char.charCodeAt(0), 0) % 360
  return <span className={cn('flex items-center justify-center overflow-hidden', className)} style={image ? undefined : { background: `hsl(${hue} 70% 92%)`, color: `hsl(${hue} 55% 38%)` }}>
    {image ? <SafeImage src={image} alt="" className="h-full w-full object-cover" /> : <Layers3 size={28} aria-hidden="true" />}
  </span>
}

/** A plan card: square image, one-line title, then steps, a collection and the badge it earns; ⋮ on hover. */
export function PlanCard({ orgslug, plan, collections, canEdit, orgId, token }: {
  orgslug: string; plan: TemplateListItem; collections: PlanCollection[]; canEdit: boolean; orgId: number; token?: string
}) {
  const live = !plan.requested && (!!plan.live_version || !!plan.published_version)
  // A plan asked for from Discover opens there until its creator approves.
  const href = plan.requested ? getUriWithOrg(orgslug, routePaths.org.admin.discoverPlan(plan.template_uuid)) : planHref(orgslug, plan.template_uuid)
  const tag = plan.collections?.[0]?.name
  const badge = plan.badges?.[0]
  return <div className="group relative">
    <Link href={href} className="block rounded-2xl border border-border bg-card p-2 transition hover:shadow-md" data-testid="plan-card">
      <span className="relative block">
        <PlanThumb title={plan.title} image={plan.thumbnail_image} className="aspect-square w-full rounded-xl" />
        {live ? <span title="Live" className="absolute left-2 top-2 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" /> : null}
        {plan.requested ? <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-bold text-amber-700"><Clock size={11} aria-hidden="true" />Requested</span> : null}
      </span>
      <span className="mt-2 block truncate px-1 text-sm font-black">{plan.title}</span>
      <span className="flex items-center gap-1.5 px-1 pb-1 text-xs text-muted-foreground">
        <span className="shrink-0">{plural(plan.step_count || 0, 'step')}</span>
        {tag ? <span className="min-w-0 truncate">· {tag}</span> : null}
        {badge ? <Award size={13} className="ml-auto shrink-0 text-amber-600" aria-label={`Earns ${badge.name}`} /> : null}
      </span>
    </Link>
    {canEdit ? <PlanMenu plan={plan} collections={collections} orgId={orgId} token={token} /> : null}
  </div>
}

/** ⋮ on a plan card: Add to › a collection (or a new one). Collections group plans; nothing is moved. */
function PlanMenu({ plan, collections, orgId, token }: { plan: TemplateListItem; collections: PlanCollection[]; orgId: number; token?: string }) {
  const [newOpen, setNewOpen] = React.useState(false)
  const inside = new Set((plan.collections || []).map((item) => item.collection_uuid))
  const toggle = async (collection: PlanCollection) => {
    try {
      if (inside.has(collection.collection_uuid)) {
        await collectionsApi.removePlan(orgId, collection.collection_uuid, plan.template_uuid, token)
        toast.success(`Removed from ${collection.name}.`)
      } else {
        await collectionsApi.addPlans(orgId, collection.collection_uuid, [plan.template_uuid], token)
        toast.success(`Added to ${collection.name}.`)
      }
      await refresh()
    } catch (error: any) { toast.error(error?.message || 'Could not change the collection.') }
  }
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`More for ${plan.title}`} className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-foreground opacity-0 shadow-sm transition-opacity focus:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100">
          <MoreVertical size={15} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><Folder />Add to</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
            {collections.map((collection) => <DropdownMenuItem key={collection.collection_uuid} onSelect={(event) => { event.preventDefault(); void toggle(collection) }}>
              <span className="flex w-4 justify-center">{inside.has(collection.collection_uuid) ? <Check size={14} /> : null}</span>{collection.name}
            </DropdownMenuItem>)}
            {collections.length ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem onSelect={() => setNewOpen(true)}><FolderPlus />New collection</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
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
    dialogDescription="Collections group plans. A plan can be in as many as you like."
    dialogContent={<form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (name.trim() && !busy) void create() }}>
      <Input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Career exploration" aria-label="Collection name" maxLength={120} />
      <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What ties these plans together (optional)" aria-label="Collection description" rows={2} maxLength={1000} />
      <Button type="submit" className="ml-auto flex" disabled={busy || !name.trim()}>{busy ? <Loader2 className="animate-spin" /> : <Plus />}Create collection</Button>
    </form>} />
}

/** A collection card: a 2×2 grid of its first plans' images (blank cells stay blank), then "N plans" and the name. */
export function CollectionCard({ orgslug, collection }: { orgslug: string; collection: PlanCollection }) {
  const cells = [0, 1, 2, 3].map((index) => collection.thumbs[index])
  return <Link href={collectionHref(orgslug, collection.collection_uuid)} className="block w-52 shrink-0 snap-start rounded-2xl border border-border bg-card p-2 transition hover:shadow-md sm:w-60" data-testid="collection-card">
    <span className="grid aspect-square grid-cols-2 gap-1 overflow-hidden rounded-xl bg-muted/50 p-1">
      {cells.map((thumb, index) => thumb ? <PlanThumb key={thumb.template_uuid} title={thumb.title} image={thumb.thumbnail_image} className="rounded-lg" />
        : <span key={index} className="rounded-lg bg-muted/60" />)}
    </span>
    <span className="mt-2 block px-1 text-xs text-muted-foreground">{plural(collection.plan_count, 'plan')}</span>
    <span className="block truncate px-1 pb-1 text-sm font-black">{collection.name}</span>
  </Link>
}
