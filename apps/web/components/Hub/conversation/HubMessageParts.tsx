'use client'

import { useState } from 'react'
import { ArrowRight, ChevronDown, Link2, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import type { HubSuggestedAction } from '@services/hub/advisor'

export function AssistantResponse({ content }: { content: string }) {
  return (
    <article className="max-w-none text-[15px] leading-7 text-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
          h1: ({ children }) => <h1 className="mb-3 mt-7 text-2xl font-semibold tracking-tight first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-6 text-xl font-semibold tracking-tight first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 mt-5 text-base font-semibold first:mt-0">{children}</h3>,
          p: ({ children }) => <p className="my-3 first:mt-0 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6">{children}</ol>,
          blockquote: ({ children }) => <blockquote className="my-4 border-l-2 border-border pl-4 text-muted-foreground">{children}</blockquote>,
          a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="font-medium underline decoration-border underline-offset-4 hover:decoration-foreground">{children}</a>,
          code: ({ children, className }) => className
            ? <code className={`${className} block overflow-x-auto rounded-xl bg-muted p-4 text-[13px] leading-6`}>{children}</code>
            : <code className="rounded bg-muted px-1.5 py-0.5 text-[0.9em]">{children}</code>,
          table: ({ children }) => <div className="my-4 overflow-x-auto"><table className="w-full border-collapse text-sm">{children}</table></div>,
          th: ({ children }) => <th className="border-b border-border px-3 py-2 text-left font-semibold">{children}</th>,
          td: ({ children }) => <td className="border-b border-border px-3 py-2 align-top">{children}</td>,
        }}>
        {content}
      </ReactMarkdown>
    </article>
  )
}

// eslint-disable-next-line no-unused-vars
export function HubSuggestedActions({ actions, disabled = false, onActivate }: { actions: HubSuggestedAction[]; disabled?: boolean; onActivate: (action: HubSuggestedAction, mode: 'navigate' | 'edit') => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null)
  if (!actions.length) return null
  return <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label="Suggested next actions" data-testid="hub-suggested-actions">
    {actions.map((action) => action.primary_behavior === 'begin_edit' ? <div key={action.action_id} className="inline-flex overflow-hidden rounded-lg border border-border bg-background shadow-xs">
      <Button type="button" variant="ghost" size="sm" className="h-8 rounded-none border-0 px-3 text-xs font-semibold" disabled={disabled || busy !== null} onClick={async () => { setBusy(action.action_id); try { await onActivate(action, 'edit') } finally { setBusy(null) } }}>
        {busy === action.action_id ? <Loader2 size={13} className="animate-spin" /> : null}
        {action.primary_label || action.label}
        {busy !== action.action_id ? <ArrowRight size={13} aria-hidden="true" /> : null}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-none border-0 border-l border-border" disabled={disabled || busy !== null} aria-label={`More options for ${action.primary_label || action.label}`}><ChevronDown size={13} /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => void onActivate(action, 'navigate')}>{action.alternate_label || 'Open without editing'}</DropdownMenuItem></DropdownMenuContent>
      </DropdownMenu>
    </div> : <Button
      key={action.action_id}
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 rounded-full bg-muted/60 px-2.5 text-xs font-medium text-muted-foreground shadow-none hover:text-foreground"
      disabled={disabled || busy !== null}
      onClick={async () => {
        setBusy(action.action_id)
        try { await onActivate(action, 'navigate') } finally { setBusy(null) }
      }}
    >
      {busy === action.action_id ? <Loader2 size={13} className="animate-spin" /> : null}
      {busy !== action.action_id ? <Link2 size={12} aria-hidden="true" /> : null}
      {action.destination === 'plans' ? 'Plans page' : action.label.replace(/^View\s+/i, '')}
    </Button>)}
  </div>
}
