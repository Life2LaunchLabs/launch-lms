'use client'

import { Dispatch } from 'react'
import { ChevronLeft, ChevronRight, MinusCircle } from 'lucide-react'
import { Button } from '@components/ui/button'
import ResourceTypeVisual from '@components/Resources/ResourceTypeVisual'
import type { HubAdvisorResource } from '@services/hub/advisor'
import { ActiveResourceWorkspace, resourceImage } from './HubResourceContext'
import HubSheet from './HubSheet'

// Every resource Hub suggested or the learner added to this chat, with one open in detail.
export default function HubResourceTray({ resources, activeUuid, orgslug, onActiveChange, onRemove, onClose }: {
  resources: HubAdvisorResource[]
  activeUuid: string | null
  orgslug: string
  onActiveChange: Dispatch<string>
  onRemove: Dispatch<HubAdvisorResource>
  onClose: () => void
}) {
  const activeIndex = Math.max(0, resources.findIndex((resource) => resource.resource_uuid === activeUuid))
  const active = resources[activeIndex]
  if (!active) return null
  const step = (delta: number) => onActiveChange(resources[(activeIndex + delta + resources.length) % resources.length].resource_uuid)

  return (
    <HubSheet
      label="Resources in this chat"
      title={<>In this chat <span className="font-normal text-muted-foreground">· {resources.length}</span></>}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" className="h-10 w-10" onClick={() => step(-1)} disabled={resources.length < 2} aria-label="Previous resource">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-12 text-center text-xs tabular-nums text-muted-foreground">{activeIndex + 1} of {resources.length}</span>
            <Button type="button" variant="ghost" size="icon" className="h-10 w-10" onClick={() => step(1)} disabled={resources.length < 2} aria-label="Next resource">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button type="button" variant="ghost" className="h-10 gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => onRemove(active)}>
            <MinusCircle className="h-4 w-4" /> Remove from chat
          </Button>
        </div>
      }
    >
      <div role="tablist" aria-label="Resources in this chat" className="flex snap-x gap-2 overflow-x-auto border-b border-border/60 px-4 pb-3 pt-1">
        {resources.map((resource) => {
          const selected = resource.resource_uuid === active.resource_uuid
          return (
            <button
              key={resource.resource_uuid}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={resource.title}
              title={resource.title}
              onClick={() => onActiveChange(resource.resource_uuid)}
              className={`h-14 w-14 shrink-0 snap-start overflow-hidden rounded-xl transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'ring-2 ring-[var(--org-primary-color,currentColor)] ring-offset-2 ring-offset-background' : 'opacity-70 hover:opacity-100'}`}
            >
              <ResourceTypeVisual type={resource.resource_type} title={resource.title} imageSrc={resourceImage(resource)} iconClassName="h-5 w-5" />
            </button>
          )
        })}
      </div>
      <div role="tabpanel" aria-label={active.title} className="p-3 sm:p-4">
        <ActiveResourceWorkspace key={active.resource_uuid} resource={active} orgslug={orgslug} />
      </div>
    </HubSheet>
  )
}
