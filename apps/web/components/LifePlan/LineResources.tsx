'use client'

import React from 'react'
import useSWR from 'swr'
import { Bookmark, ChevronRight } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import ResourceCover from '@components/Discover/ResourceCover'
import ResourceSheet, { resourceMeta } from '@components/Discover/ResourceSheet'
import { lifeApi, type CatalogItem } from '@services/life/life'
import { useLife } from './LifeContext'

import { tr } from '@/lib/tr'

/** Under a line the learner can't guess, like a grant: the resources that help them find their number, best
 * fit for the phase's state first. Each opens in the resource sheet, where they can save it and keep notes. */
export default function LineResources({ item }: { item: CatalogItem }) {
  const { phase, token } = useLife()
  const org = useOrg() as any
  const [open, setOpen] = React.useState('')
  const { data, mutate } = useSWR(token && item.resources ? ['life-line-resources', item.key, org?.id || 0, phase.place || ''] : null,
    () => lifeApi.lineResources(item.key, org?.id, phase.place, token), { revalidateOnFocus: false })
  const resources = data?.resources || []
  if (!resources.length) return null
  return (
    <section className="grid gap-1.5" aria-label={tr('budget.line.resources_label', 'Resources for {{title}}', { title: item.title.toLowerCase() })}>
      <h4 className="m-0 text-[11px] font-semibold text-muted-foreground">
        {data?.state ? tr('budget.line.resources_state', 'Not sure how much? Start here (for {{state}})', { state: data.state }) : tr('budget.line.resources', 'Not sure how much? Start here')}
      </h4>
      <ul className="grid gap-1">
        {resources.map((resource) => (
          <li key={resource.resource_uuid}>
            <button type="button" onClick={() => setOpen(resource.resource_uuid)} className="flex w-full min-w-0 items-center gap-2.5 rounded-xl p-1 text-left hover:bg-muted">
              <ResourceCover resource={resource} chip={false} className="w-14 shrink-0 rounded-lg" />
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-sm font-semibold">{resource.title}</span>
                <span className="truncate text-xs text-muted-foreground">{resourceMeta(resource).line}</span>
              </span>
              {resource.is_saved && <Bookmark className="size-4 shrink-0 fill-current text-[var(--org-primary-color)]" aria-label={tr('discover.resource_shelves.saved', 'Saved')} />}
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {open && org?.slug ? <ResourceSheet resourceUuid={open} orgslug={org.slug} onClose={() => { setOpen(''); void mutate() }} onOpen={setOpen} /> : null}
    </section>
  )
}
