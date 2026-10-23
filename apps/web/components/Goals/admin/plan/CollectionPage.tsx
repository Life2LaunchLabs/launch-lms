'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { Check, Globe, Loader2, MoreVertical, Plus, Trash2, X } from 'lucide-react'
import { CaretRight } from '@phosphor-icons/react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { Button } from '@components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { useCanEditPlans } from '@components/Admin/Plans/useCanEditPlans'
import { EmptyState } from '@components/Goals/admin/live/ui'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { collectionKeys, collectionsApi, isCollectionsKey } from '@services/goals/collections'
import { isTemplatesKey, templateKeys, templatesApi } from '@services/goals/templates'
import { cn } from '@/lib/utils'
import { PlanCard, PlanThumb } from './PlanCards'
import { plural } from './planVersions'

const MAX_CATEGORIES = 3

/** One collection: its name and description (edited in place), up to three categories, and its plans. */
export default function CollectionPage({ orgslug, collectionUuid }: { orgslug: string; collectionUuid: string }) {
  const router = useRouter()
  const org = useOrg() as { id?: number } | null
  const session = useLHSession() as { data?: { tokens?: { access_token?: string } } }
  const token = session?.data?.tokens?.access_token
  const orgId = Number(org?.id)
  const canEdit = useCanEditPlans() === true
  const ready = Boolean(orgId && token)
  const { data: collection, error } = useSWR(ready ? collectionKeys.one(orgId, collectionUuid) : null, () => collectionsApi.get(orgId, collectionUuid, token))
  const { data: list } = useSWR(ready ? collectionKeys.list(orgId) : null, () => collectionsApi.list(orgId, token))
  const { data: plans } = useSWR(ready ? templateKeys.list(orgId) : null, () => templatesApi.list(orgId, token))
  const [addOpen, setAddOpen] = React.useState(false)
  // Opening a collection moves it to the front of the Plans carousel.
  React.useEffect(() => { if (ready) void collectionsApi.opened(orgId, collectionUuid, token).then(() => mutate(collectionKeys.list(orgId))).catch(() => undefined) }, [ready, orgId, collectionUuid, token])

  if (error && !collection) return <div className="p-10"><EmptyState title="Collection not found" detail="It may have been removed." /></div>
  if (!collection || !plans) return <div className="flex min-h-[320px] items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>

  const inside = collection.template_uuids.map((uuid) => plans.find((plan) => plan.template_uuid === uuid)).filter((plan): plan is NonNullable<typeof plan> => !!plan)
  const save = async (data: { name?: string; description?: string; categories?: string[] }) => {
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
      router.push(getUriWithOrg(orgslug, routePaths.org.admin.plans('templates')))
    } catch (failure: any) { toast.error(failure?.message || 'Could not remove the collection.') }
  }
  const take = async (templateUuid: string) => {
    try {
      await mutate(collectionKeys.one(orgId, collectionUuid), await collectionsApi.removePlan(orgId, collectionUuid, templateUuid, token), false)
      await Promise.all([mutate(isCollectionsKey), mutate(isTemplatesKey)])
    } catch (failure: any) { toast.error(failure?.message || 'Could not remove the plan.') }
  }

  return <div className="min-h-full w-full bg-[#f8f8f8]"><div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:px-10">
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
      <Link href={getUriWithOrg(orgslug, routePaths.org.admin.plans('templates'))} className="hover:text-foreground">Plans</Link>
      <CaretRight size={12} aria-hidden="true" />
      <span aria-current="page" className="min-w-0 truncate text-foreground">{collection.name}</span>
    </nav>
    <header className="flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <InlineText value={collection.name} editable={canEdit} label="Collection name" className="text-3xl font-black tracking-tight sm:text-4xl" onSave={(name) => name ? save({ name }) : undefined} />
        <InlineText value={collection.description} editable={canEdit} label="Collection description" placeholder="Add a description" className="mt-1 text-base text-muted-foreground" onSave={(description) => save({ description })} />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold">{plural(collection.plan_count, 'plan')}</span>
          <span className={cn('inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-bold', collection.published_count ? 'bg-emerald-50 text-emerald-800' : 'bg-muted text-muted-foreground')}
            title={collection.published_count >= 2 ? 'Listed on Discover with its shared plans' : 'Share 2 or more of its plans to list it on Discover'}>
            <Globe size={14} aria-hidden="true" />{collection.published_count ? `${collection.published_count} published` : 'Not published'}
          </span>
          <Categories value={collection.categories} options={list?.categories || []} editable={canEdit} onChange={(categories) => save({ categories })} />
        </div>
      </div>
      {canEdit ? <DropdownMenu>
        <DropdownMenuTrigger asChild><button type="button" aria-label="Collection settings" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card hover:bg-muted"><MoreVertical size={17} /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setAddOpen(true)}><Plus />Add plans</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void remove()} className="text-red-700"><Trash2 />Remove collection</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu> : null}
    </header>
    <section className="mt-8">
      {inside.length ? <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {inside.map((plan) => <li key={plan.template_uuid} className="group/item relative">
          <PlanCard orgslug={orgslug} plan={plan} collections={list?.collections || []} canEdit={false} orgId={orgId} token={token} />
          {canEdit ? <button type="button" onClick={() => void take(plan.template_uuid)} aria-label={`Remove ${plan.title} from ${collection.name}`}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 opacity-0 shadow-sm transition-opacity focus:opacity-100 group-hover/item:opacity-100"><X size={15} /></button> : null}
        </li>)}
        {canEdit ? <li><button type="button" onClick={() => setAddOpen(true)} className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-sm font-bold text-muted-foreground hover:bg-card">
          <Plus size={22} />Add plans</button></li> : null}
      </ul> : <EmptyState title="No plans in this collection yet" detail={canEdit ? <button type="button" onClick={() => setAddOpen(true)} className="font-bold text-foreground underline">Add plans</button> : undefined} />}
    </section>
    <AddPlansModal open={addOpen} setOpen={setAddOpen} orgId={orgId} token={token} collectionUuid={collectionUuid}
      candidates={plans.filter((plan) => !plan.system_type && !collection.template_uuids.includes(plan.template_uuid))} />
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
    className={cn('-mx-1 block w-full resize-none rounded-lg border border-dashed border-transparent bg-transparent px-1 outline-none [field-sizing:content] hover:border-border focus:border-border focus:bg-card', className)} />
}

/** Up to three categories from the fixed set; they describe every plan inside, for Discover. */
function Categories({ value, options, editable, onChange }: { value: string[]; options: string[]; editable: boolean; onChange: React.Dispatch<string[]> }) {
  const full = value.length >= MAX_CATEGORIES
  return <>
    {value.map((category) => <span key={category} className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-card px-3 text-sm font-semibold">
      {category}{editable ? <button type="button" aria-label={`Remove ${category}`} onClick={() => onChange(value.filter((item) => item !== category))} className="-mr-1 rounded-full p-0.5 hover:bg-muted"><X size={12} /></button> : null}
    </span>)}
    {editable && !full ? <DropdownMenu>
      <DropdownMenuTrigger asChild><button type="button" className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-border px-3 text-sm font-semibold text-muted-foreground hover:bg-card"><Plus size={13} />Category</button></DropdownMenuTrigger>
      <DropdownMenuContent align="start">{options.filter((option) => !value.includes(option)).map((option) => <DropdownMenuItem key={option} onSelect={() => onChange([...value, option])}>{option}</DropdownMenuItem>)}</DropdownMenuContent>
    </DropdownMenu> : null}
  </>
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
          <PlanThumb title={plan.title} image={plan.thumbnail_image} className="h-10 w-10 shrink-0 rounded-lg" />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{plan.title}</span><span className="text-xs text-muted-foreground">{plural(plan.step_count || 0, 'step')}</span></span>
          {on ? <Check size={16} /> : null}
        </button></li>
      })}</ul> : <p className="text-sm text-muted-foreground">Every plan is already in this collection.</p>}
      <Button className="ml-auto flex" onClick={() => void add()} disabled={busy || !picked.length}>{busy ? <Loader2 className="animate-spin" /> : <Plus />}Add {picked.length ? plural(picked.length, 'plan') : 'plans'}</Button>
    </div>} />
}
