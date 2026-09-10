'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Check, CircleHelp, Copy, Lightbulb } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import type { HubMemory, HubPageReceipt } from '@services/hub/advisor'
import { hubTimestampDate } from '@services/hub/timestamp'
import HubMemoryItems from './HubMemoryItems'

type Props = {
  role: 'user' | 'assistant'
  content: string
  createdAt?: string
  memories?: HubMemory[]
  pageContext?: HubPageReceipt | null
  orgId: number
  accessToken: string
}

export default function HubMessageMicroBar({ role, content, createdAt, memories = [], pageContext, orgId, accessToken }: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [items, setItems] = useState(memories)
  const [copied, setCopied] = useState(false)
  const source = pageContext?.status === 'ready' ? pageContext.sources[0] : undefined
  const label = role === 'assistant' ? 'What informed this answer?' : 'Memory updated by this message'
  const currentQuery = searchParams.toString()
  const currentLocation = `${pathname}${currentQuery ? `?${currentQuery}` : ''}`
  const sourceTitle = source?.page_title || source?.title
  const sourcePath = source?.page_path?.startsWith('/') && !source.page_path.startsWith('//') ? source.page_path : undefined
  const sourceIsElsewhere = Boolean(sourcePath && sourcePath !== currentLocation)

  if (role === 'user' && items.length === 0) return null

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
    <div className={`group flex h-7 items-center gap-0.5 ${role === 'user' ? 'justify-end' : 'justify-start'}`}>
      {role === 'assistant' && (
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => void copy()} aria-label="Copy message" title="Copy message">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" aria-label={label} title={label}>
            {role === 'assistant' ? <CircleHelp className="h-3.5 w-3.5" /> : <Lightbulb className="h-3.5 w-3.5" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent align={role === 'user' ? 'end' : 'start'} className="w-[min(24rem,calc(100vw-2rem))] border-border/90 bg-background p-3 shadow-xl shadow-black/20">
          <p className="mb-2 px-1 text-xs font-semibold text-muted-foreground">{label}</p>
          {source ? <div className="mb-3 rounded-lg bg-muted/60 px-3 py-2 text-sm"><p className="font-medium">Page accessed</p><p className="mt-1 text-xs text-muted-foreground">{sourceTitle}{source.objective_title ? ` · ${source.objective_title}` : ''}</p></div> : null}
          {items.length > 0 ? <><p className="mb-2 px-1 text-xs font-semibold text-muted-foreground">Saved memories</p><HubMemoryItems memories={items} orgId={orgId} accessToken={accessToken} onChange={setItems} /></> : !source ? <p className="px-1 py-2 text-sm text-muted-foreground">No page details or saved memories informed this response.</p> : null}
        </PopoverContent>
      </Popover>
      {role === 'assistant' && (sourceTitle || createdAt) && <span className="ml-1 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {sourceTitle ? <>{sourceIsElsewhere && sourcePath ? <Link href={sourcePath} className="max-w-48 truncate underline decoration-border underline-offset-2 hover:text-foreground">in {sourceTitle}</Link> : <span className="max-w-48 truncate">in {sourceTitle}</span>}</> : null}
        {sourceTitle && createdAt ? <span aria-hidden="true">·</span> : null}
        {createdAt ? <time dateTime={createdAt}>{hubTimestampDate(createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time> : null}
      </span>}
    </div>
  )
}
