'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Lightbulb, X } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Switch } from '@components/ui/switch'
import { getUriWithOrg, routePaths } from '@services/config/config'

import { tr } from '@/lib/tr'
export default function HubMemoryNotice({
  orgslug,
  enabled,
  saving,
  onSave,
  onDismiss,
  onLearnMore,
}: {
  orgslug: string
  enabled: boolean
  saving: boolean
  // eslint-disable-next-line no-unused-vars
  onSave: (_enabled: boolean) => Promise<boolean>
  onDismiss: () => void
  // eslint-disable-next-line no-unused-vars
  onLearnMore: (_href: string) => void
}) {
  const [draft, setDraft] = useState(enabled)
  const [error, setError] = useState('')
  const save = async () => { setError(''); if (!await onSave(draft)) setError('Your choice could not be saved. Please try again.') }
  const learnMoreHref = getUriWithOrg(orgslug, routePaths.owner.account.memory())
  return (
    <aside className="relative mb-2 rounded-2xl border border-border/80 bg-background/95 px-4 py-3 pr-11 shadow-sm backdrop-blur-md" aria-label={tr('coach.hub_memory_notice.coach_memory_notice', 'Coach memory notice')}>
      <Button type="button" size="icon" variant="ghost" className="absolute right-2 top-2 h-7 w-7 text-muted-foreground" onClick={onDismiss} disabled={saving} aria-label={tr('coach.hub_memory_notice.dismiss_memory_notice', 'Dismiss memory notice')}>
        <X className="h-3.5 w-3.5" />
      </Button>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Lightbulb className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-5 text-foreground">{tr('coach.hub_memory_notice.the_chat_coach_can_remember', 'The chat coach can remember insights from your conversations to better help you on your journey.')}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{tr('coach.hub_memory_notice.your_memories_are_private_to', 'Your memories are private to your account. You control what it remembers and can turn memory off at any time.')}</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs font-medium text-foreground">
              <Switch checked={draft} onCheckedChange={setDraft} disabled={saving} aria-label={tr('coach.hub_memory_notice.use_coach_memory', 'Use Coach memory')} />
              <span>{tr('coach.hub_memory_notice.memory', 'Memory')}{' '}{draft ? 'on' : 'off'}</span>
            </label>
            <div className="ml-auto flex items-center gap-3">
              <Button asChild size="sm" variant="link" className="h-auto p-0 text-xs"><Link href={learnMoreHref} onClick={(event) => { event.preventDefault(); onLearnMore(learnMoreHref) }}>{tr('coach.hub_memory_notice.learn_more', 'Learn more')}</Link></Button>
              <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>{saving ? tr('coach.hub_memory_notice.saving', 'Saving…') : tr('coach.hub_memory_items.save', 'Save')}</Button>
            </div>
          </div>
          {error ? <p role="alert" className="mt-2 text-xs text-destructive">{error}</p> : null}
        </div>
      </div>
    </aside>
  )
}
