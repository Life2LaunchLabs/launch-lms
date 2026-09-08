'use client'

import { Dispatch, useEffect, useRef, useState } from 'react'
import { CornerUpLeft, LibraryBig } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@components/ui/dialog'
import type { HubAdvisorResource } from '@services/hub/advisor'
import { ActiveResourceWorkspace, HubResourceSwitchItem } from './HubResourceContext'
import type { HubResourceTrayEntry } from './hubInteraction'

export default function HubResourceTray({
  entries,
  orgslug,
  onRemove,
  onReturnToOrigin,
}: {
  entries: HubResourceTrayEntry<HubAdvisorResource>[]
  orgslug: string
  onRemove: Dispatch<string>
  onReturnToOrigin: Dispatch<HubResourceTrayEntry<HubAdvisorResource>>
}) {
  const [open, setOpen] = useState(false)
  const [activeResourceUuid, setActiveResourceUuid] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  if (entries.length === 0) return null

  const activeEntry = entries.find((entry) => entry.resource.resource_uuid === activeResourceUuid) || entries[entries.length - 1]

  const openTray = () => {
    setActiveResourceUuid(entries[entries.length - 1].resource.resource_uuid)
    setOpen(true)
  }

  const removeResource = (resourceUuid: string) => {
    const remaining = entries.filter((entry) => entry.resource.resource_uuid !== resourceUuid)
    if (activeEntry.resource.resource_uuid === resourceUuid) {
      setActiveResourceUuid(remaining.at(-1)?.resource.resource_uuid || null)
    }
    onRemove(resourceUuid)
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="pointer-events-auto absolute right-4 top-4 z-[var(--z-sticky)] h-10 gap-2 rounded-full border-border/70 bg-background/90 px-3 shadow-sm backdrop-blur-md sm:right-6 sm:top-6"
        onClick={openTray}
        aria-label={`Open all conversation resources (${entries.length})`}
      >
        <LibraryBig className="h-4 w-4" />
        <span className="text-xs font-semibold tabular-nums">{entries.length}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="grid h-[min(46rem,calc(100dvh-2rem))] w-[calc(100%-2rem)] max-w-4xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0">
          <DialogHeader className="px-5 py-4 pr-14 sm:px-6 sm:py-5">
            <DialogTitle>Conversation resources</DialogTitle>
            <DialogDescription>Everything added to this conversation, in the order it first appeared.</DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 grid-cols-[10rem_minmax(18rem,1fr)] gap-2 overflow-x-auto px-3 pb-4 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-3 sm:px-5 sm:pb-5">
            <div ref={listRef} className="min-h-0 space-y-2 overflow-y-auto" aria-label="Conversation resource list">
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
              <div className="mt-2 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-muted-foreground"
                  onClick={() => {
                    setOpen(false)
                    onReturnToOrigin(activeEntry)
                  }}
                >
                  <CornerUpLeft className="h-4 w-4" /> Return to where it was added
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
