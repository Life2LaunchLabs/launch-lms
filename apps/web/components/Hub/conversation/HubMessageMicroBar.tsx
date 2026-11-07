'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Check, CircleHelp, Copy, Flag, Lightbulb } from 'lucide-react'
import { Button } from '@components/ui/button'
import { useHub } from '@components/Hub/HubContext'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import type { HubMemory, HubPageReceipt } from '@services/hub/advisor'
import { hubTimestampDate } from '@services/hub/timestamp'
import HubMemoryItems from './HubMemoryItems'
import HubReportDialog from './HubReportDialog'
import { SpeakButton } from '@components/Accessibility/ReadAloud'
import { plainForSpeech } from '@components/Accessibility/speech'

import { tr } from '@/lib/tr'
type Props = {
  role: 'user' | 'assistant'
  content: string
  createdAt?: string
  memories?: HubMemory[]
  pageContext?: HubPageReceipt | null
  orgId: number
  accessToken: string
  /** The server's id for one of Coach's replies, which the learner can report. */
  reportableId?: string
}

export default function HubMessageMicroBar({ role, content, createdAt, memories = [], pageContext, orgId, accessToken, reportableId }: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const workspace = useHub()
  const [items, setItems] = useState(memories)
  const [copied, setCopied] = useState(false)
  const [reporting, setReporting] = useState(false)
  const source = pageContext?.status === 'ready' ? pageContext.sources[0] : undefined
  const label = role === 'assistant' ? 'What informed this answer?' : 'Memory updated by this message'
  const currentQuery = searchParams.toString()
  const currentLocation = `${pathname}${currentQuery ? `?${currentQuery}` : ''}`
  const sourceTitle = pageContext?.page_title || source?.page_title || source?.title
  const receiptPath = pageContext?.page_path || source?.page_path
  const sourcePath = receiptPath?.startsWith('/') && !receiptPath.startsWith('//') ? receiptPath : undefined
  const sourceIsElsewhere = Boolean(sourcePath && sourcePath !== currentLocation)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      setCopied(false)
    }
  }

  return (
    // The speaker on Coach's replies always shows; the rest appear on hover or focus.
    <div className={`flex h-7 items-center gap-0.5 ${role === 'user' ? 'justify-end' : 'justify-start'}`}>
      {role === 'assistant' ? <SpeakButton text={plainForSpeech(content)} size="sm" label={tr('coach.hub_message_micro_bar.read_coach_s_answer_aloud', 'Read Coach’s answer aloud')} className="!size-7 bg-transparent text-muted-foreground" /> : null}
      <div className="flex min-w-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100">
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => void copy()} aria-label={tr('coach.hub_message_micro_bar.copy_message', 'Copy message')} title={tr('coach.hub_message_micro_bar.copy_message', 'Copy message')}>
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
      {(role === 'assistant' || items.length > 0) && (
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" aria-label={label} title={label}>
              {role === 'assistant' ? <CircleHelp className="h-3.5 w-3.5" /> : <Lightbulb className="h-3.5 w-3.5" />}
            </Button>
          </PopoverTrigger>
          <PopoverContent align={role === 'user' ? 'end' : 'start'} className="w-[min(24rem,calc(100vw-2rem))] border-border/90 bg-background p-3 shadow-xl shadow-black/20">
            <p className="mb-2 px-1 text-xs font-semibold text-muted-foreground">{label}</p>
            {role === 'assistant' && source ? <div className="mb-3 rounded-lg bg-muted/60 px-3 py-2 text-sm"><p className="font-medium">{tr('coach.hub_message_micro_bar.page_accessed', 'Page accessed')}</p><p className="mt-1 text-xs text-muted-foreground">{sourceTitle}{source.step_title || source.objective_title ? ` · ${source.step_title || source.objective_title}` : ''}</p></div> : null}
            {items.length > 0 ? <><p className="mb-2 px-1 text-xs font-semibold text-muted-foreground">{tr('coach.hub_message_micro_bar.saved_memories', 'Saved memories')}</p><HubMemoryItems memories={items} orgId={orgId} accessToken={accessToken} onChange={setItems} /></> : role === 'assistant' && !source ? <p className="px-1 py-2 text-sm text-muted-foreground">{tr('coach.hub_message_micro_bar.no_readable_page_details_or', 'No readable page details or saved memories informed this response.')}</p> : null}
          </PopoverContent>
        </Popover>
      )}
      {reportableId ? <>
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => setReporting(true)} aria-label={tr('coach.hub_report_dialog.report_this_reply', 'Report this reply')} title={tr('coach.hub_report_dialog.report_this_reply', 'Report this reply')}>
          <Flag className="h-3.5 w-3.5" />
        </Button>
        <HubReportDialog open={reporting} onOpenChange={setReporting} messageId={reportableId} orgId={orgId} accessToken={accessToken} />
      </> : null}
      {(sourceTitle || createdAt) && <span className="ml-1 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
        {sourceTitle ? <>{sourceIsElsewhere && sourcePath ? <Link href={sourcePath} onClick={() => workspace?.open()} className="max-w-48 truncate underline decoration-border underline-offset-2 hover:text-foreground">{tr('coach.hub_message_micro_bar.in_sourcetitle', 'in {{sourceTitle}}', { sourceTitle })}</Link> : <span className="max-w-48 truncate">{tr('coach.hub_message_micro_bar.in_sourcetitle', 'in {{sourceTitle}}', { sourceTitle })}</span>}</> : null}
        {sourceTitle && createdAt ? <span aria-hidden="true">·</span> : null}
        {createdAt ? <time dateTime={createdAt}>{hubTimestampDate(createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time> : null}
      </span>}
      </div>
    </div>
  )
}
