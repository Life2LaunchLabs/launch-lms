'use client'

import { Dispatch, useEffect, useRef, useState } from 'react'
import { CornerUpLeft } from 'lucide-react'
import { Button } from '@components/ui/button'
import type { HubAdvisorResource } from '@services/hub/advisor'
import { ActiveResourceWorkspace, HubResourceSwitchItem } from './HubResourceContext'
import type { HubResourceTrayEntry } from './hubInteraction'

export default function HubResourceTray({ entries, orgslug, onRemove, onReturnToOrigin, onClose }: {
  entries: HubResourceTrayEntry<HubAdvisorResource>[]
  orgslug: string
  onRemove: Dispatch<string>
  onReturnToOrigin: Dispatch<HubResourceTrayEntry<HubAdvisorResource>>
  onClose: () => void
}) {
  const [activeResourceUuid, setActiveResourceUuid] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const activeEntry = entries.find((entry) => entry.resource.resource_uuid === activeResourceUuid) || entries.at(-1)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }))
    return () => window.cancelAnimationFrame(frame)
  }, [entries])

  if (!activeEntry) return null

  const removeResource = (resourceUuid: string) => {
    const remaining = entries.filter((entry) => entry.resource.resource_uuid !== resourceUuid)
    if (activeEntry.resource.resource_uuid === resourceUuid) setActiveResourceUuid(remaining.at(-1)?.resource.resource_uuid || null)
    onRemove(resourceUuid)
    if (remaining.length === 0) onClose()
  }

  return (
    <div className="h-[min(38rem,calc(100dvh-5rem))] overflow-hidden rounded-b-xl border border-t-0 border-border/70 bg-background shadow-xl shadow-black/10">
      <div className="grid h-full min-h-0 grid-cols-[9rem_minmax(18rem,1fr)] gap-2 overflow-x-auto p-2.5 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-3 sm:p-3">
        <div ref={listRef} className="min-h-0 space-y-1.5 overflow-y-auto" aria-label="Conversation resource list">
          {entries.map((entry) => (
            <HubResourceSwitchItem
              key={entry.resource.resource_uuid}
              resource={entry.resource}
              active={entry.resource.resource_uuid === activeEntry.resource.resource_uuid}
              onSelect={setActiveResourceUuid}
              onRemove={removeResource}
              orientation="vertical"
            />
          ))}
        </div>
        <div className="min-h-0 overflow-y-auto">
          <ActiveResourceWorkspace key={activeEntry.resource.resource_uuid} resource={activeEntry.resource} orgslug={orgslug} />
          <div className="mt-1 flex justify-end">
            <Button type="button" variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={() => {
              onClose()
              onReturnToOrigin(activeEntry)
            }}>
              <CornerUpLeft className="h-4 w-4" /> Return to where it was added
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
