'use client'

import { Dispatch } from 'react'
import { Bookmark, Paperclip, Search } from 'lucide-react'
import { Button } from '@components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'

export type HubView = 'ask' | 'resources'

// Hub's two places: talking with Hub, and finding resources directly.
export function HubViewSwitch({ view, onChange }: { view: HubView; onChange: Dispatch<HubView> }) {
  return (
    <div className="absolute inset-x-0 top-0 z-[var(--z-sticky-header)] bg-background">
      <div role="tablist" aria-label="Hub sections" className="mx-auto mt-2 grid w-[calc(100%-2rem)] max-w-xs grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {(['ask', 'resources'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={view === value}
            onClick={() => onChange(value)}
            className={`h-9 rounded-lg text-sm font-semibold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ${view === value ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {value === 'ask' ? 'Ask' : 'Resources'}
          </button>
        ))}
      </div>
    </div>
  )
}

// The composer's paperclip only adds things to this chat; browsing lives in Resources.
export function HubAttachMenu({ disabled, onSaved, onBrowse }: { disabled: boolean; onSaved: () => void; onBrowse?: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" disabled={disabled} aria-label="Add a resource to this chat">
          <Paperclip className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        <DropdownMenuItem onSelect={onSaved}><Bookmark /> Saved resource</DropdownMenuItem>
        {onBrowse ? <DropdownMenuItem onSelect={onBrowse}><Search /> Find a resource</DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
