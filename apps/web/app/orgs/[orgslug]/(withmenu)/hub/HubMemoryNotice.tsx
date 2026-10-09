'use client'

import Link from 'next/link'
import { Lightbulb, X } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Switch } from '@components/ui/switch'
import { getUriWithOrg, routePaths } from '@services/config/config'

export default function HubMemoryNotice({
  orgslug,
  enabled,
  saving,
  onEnabledChange,
  onDismiss,
  onLearnMore,
}: {
  orgslug: string
  enabled: boolean
  saving: boolean
  // eslint-disable-next-line no-unused-vars
  onEnabledChange: (_enabled: boolean) => void
  onDismiss: () => void
  // eslint-disable-next-line no-unused-vars
  onLearnMore: (_href: string) => void
}) {
  const learnMoreHref = getUriWithOrg(orgslug, routePaths.owner.account.memory())
  return (
    <aside className="relative mb-2 rounded-2xl border border-border/80 bg-background/95 px-4 py-3 pr-11 shadow-sm backdrop-blur-md" aria-label="Hub memory notice">
      <Button type="button" size="icon" variant="ghost" className="absolute right-2 top-2 h-7 w-7 text-muted-foreground" onClick={onDismiss} aria-label="Dismiss memory notice">
        <X className="h-3.5 w-3.5" />
      </Button>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Lightbulb className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-5 text-foreground">The chat coach can remember insights from your conversations to better help you on your journey.</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Your memories are private to your account. You control what it remembers and can turn memory off at any time.</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <Button asChild type="button" size="sm" variant="link" className="h-auto p-0 text-xs">
              <Link href={learnMoreHref} onClick={(event) => { event.preventDefault(); onLearnMore(learnMoreHref) }}>Learn more</Link>
            </Button>
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span>Memory {enabled ? 'on' : 'off'}</span>
              <Switch checked={enabled} onCheckedChange={onEnabledChange} disabled={saving} aria-label="Use Hub memory" />
            </label>
          </div>
        </div>
      </div>
    </aside>
  )
}
