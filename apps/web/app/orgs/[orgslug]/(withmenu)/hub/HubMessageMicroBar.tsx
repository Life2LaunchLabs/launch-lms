'use client'

import { useState } from 'react'
import { BrainCircuit, Check, CircleHelp, Copy } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import type { HubMemory } from '@services/hub/advisor'
import HubMemoryItems from './HubMemoryItems'

type Props = {
  role: 'user' | 'assistant'
  content: string
  createdAt?: string
  memories?: HubMemory[]
  orgId: number
  accessToken: string
}

export default function HubMessageMicroBar({ role, content, createdAt, memories = [], orgId, accessToken }: Props) {
  const [items, setItems] = useState(memories)
  const [copied, setCopied] = useState(false)
  const label = role === 'assistant' ? 'Memories used for this response' : 'Memory updated by this message'

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
            {role === 'assistant' ? <CircleHelp className="h-3.5 w-3.5" /> : <BrainCircuit className="h-3.5 w-3.5" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent align={role === 'user' ? 'end' : 'start'} className="w-[min(24rem,calc(100vw-2rem))] p-3">
          <p className="mb-2 px-1 text-xs font-semibold text-muted-foreground">{label}</p>
          {items.length > 0
            ? <HubMemoryItems memories={items} orgId={orgId} accessToken={accessToken} onChange={setItems} />
            : <p className="px-1 py-2 text-sm text-muted-foreground">No saved memories informed this response.</p>}
        </PopoverContent>
      </Popover>
      {role === 'assistant' && createdAt && (
        <time dateTime={createdAt} className="ml-1 text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {new Date(createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </time>
      )}
    </div>
  )
}
