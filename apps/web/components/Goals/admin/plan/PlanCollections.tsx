'use client'

import React from 'react'
import Link from 'next/link'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { Check, Folder, FolderPlus, Plus } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { collectionKeys, collectionsApi, isCollectionsKey } from '@services/goals/collections'
import { isTemplatesKey, type TemplateDetail } from '@services/goals/templates'
import { NewCollectionModal, collectionHref } from './PlanCards'

/** The plan's collections on their own line under the header, with + to add it to one (or a new one). */
export default function PlanCollections({ orgslug, orgId, token, template, canEdit }: { orgslug: string; orgId: number; token?: string; template: TemplateDetail; canEdit: boolean }) {
  const { data: list } = useSWR(canEdit && orgId && token ? collectionKeys.list(orgId) : null, () => collectionsApi.list(orgId, token))
  const [newOpen, setNewOpen] = React.useState(false)
  const current = template.collections || []
  const inside = new Set(current.map((item) => item.collection_uuid))
  if (!current.length && !canEdit) return null
  const toggle = async (uuid: string, name: string) => {
    try {
      if (inside.has(uuid)) await collectionsApi.removePlan(orgId, uuid, template.template_uuid, token)
      else await collectionsApi.addPlans(orgId, uuid, [template.template_uuid], token)
      await Promise.all([mutate(isCollectionsKey), mutate(isTemplatesKey)])
      toast.success(inside.has(uuid) ? `Removed from ${name}.` : `Added to ${name}.`)
    } catch (error: any) { toast.error(error?.message || 'Could not change the collection.') }
  }
  return <>
    {current.map((item) => <Link key={item.collection_uuid} href={collectionHref(orgslug, item.collection_uuid)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm font-semibold hover:bg-muted">
      <Folder size={14} aria-hidden="true" />{item.name}
    </Link>)}
    {canEdit ? <DropdownMenu>
      <DropdownMenuTrigger asChild><button type="button" aria-label="Add to a collection" className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground hover:bg-card"><Plus size={14} /></button></DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        {(list?.collections || []).map((collection) => <DropdownMenuItem key={collection.collection_uuid} onSelect={(event) => { event.preventDefault(); void toggle(collection.collection_uuid, collection.name) }}>
          <span className="flex w-4 justify-center">{inside.has(collection.collection_uuid) ? <Check size={14} /> : null}</span>{collection.name}
        </DropdownMenuItem>)}
        {list?.collections.length ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem onSelect={() => setNewOpen(true)}><FolderPlus />New collection</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu> : null}
    <NewCollectionModal open={newOpen} setOpen={setNewOpen} orgId={orgId} token={token} templateUuids={[template.template_uuid]} />
  </>
}
