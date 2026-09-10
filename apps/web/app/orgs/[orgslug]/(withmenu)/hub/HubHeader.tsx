'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { Archive, ArrowLeft, ChevronDown, CircleHelp, LibraryBig, Maximize2, MoreHorizontal, PanelLeft, Pencil, Plus, X } from 'lucide-react'
import { Button } from '@components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@components/ui/tooltip'
import { Input } from '@components/ui/input'
import type { HubAdvisorResource, HubConversationSummary, HubEditRun } from '@services/hub/advisor'
import HubConversationHistory from './HubConversationHistory'
import HubResourceTray from './HubResourceTray'
import type { HubResourceTrayEntry } from './hubInteraction'

type Panel = 'history' | 'resources' | null

export default function HubHeader({
  orgslug,
  conversationUuid,
  conversationStarted = false,
  title,
  conversations,
  entries,
  loading,
  disabled,
  onHistoryOpen,
  onBack,
  onNew,
  onSelect,
  onOpenResources,
  onRename,
  onArchive,
  onRemoveResource,
  onReturnToOrigin,
  initialPanel,
  companion = false,
  contextUnavailable = false,
  editRun,
  onStopEditing,
  onCompanionCollapse,
  onCompanionExpand,
}: {
  orgslug: string
  conversationUuid: string | null
  conversationStarted?: boolean
  title: string
  conversations: HubConversationSummary[]
  entries: HubResourceTrayEntry<HubAdvisorResource>[]
  loading: boolean
  disabled: boolean
  onHistoryOpen: () => void
  onBack: () => void
  onNew: () => void
  // ESLint's base rule treats TypeScript callback parameter names as runtime bindings.
  // eslint-disable-next-line no-unused-vars
  onSelect: (_conversationUuid: string) => void
  // eslint-disable-next-line no-unused-vars
  onOpenResources: (_conversationUuid: string) => void
  // eslint-disable-next-line no-unused-vars
  onRename: (_title: string) => Promise<void>
  onArchive: () => Promise<void>
  // eslint-disable-next-line no-unused-vars
  onRemoveResource: (_resourceUuid: string) => void
  // eslint-disable-next-line no-unused-vars
  onReturnToOrigin: (_entry: HubResourceTrayEntry<HubAdvisorResource>) => void
  initialPanel: Panel
  companion?: boolean
  contextUnavailable?: boolean
  editRun?: HubEditRun | null
  onStopEditing?: () => void
  onCompanionCollapse?: () => void
  onCompanionExpand?: () => void
}) {
  const hasConversation = conversationStarted || Boolean(conversationUuid)
  const [panel, setPanel] = useState<Panel>(initialPanel)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(title)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!panel) return
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setPanel(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanel(null)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [panel])

  const toggleHistory = () => {
    if (panel !== 'history') onHistoryOpen()
    setPanel((current) => current === 'history' ? null : 'history')
  }

  const submitRename = async (event: FormEvent) => {
    event.preventDefault()
    const normalized = renameValue.trim()
    if (!normalized) return
    try {
      await onRename(normalized)
      setRenaming(false)
    } catch {
      // The conversation surface owns and announces the request error.
    }
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[var(--z-sticky-header)]">
      <div ref={rootRef} className={`pointer-events-auto mx-auto w-full max-w-[50rem] px-4 sm:px-5 ${companion ? 'bg-transparent' : 'bg-background'}`}>
        <header className="flex h-11 items-center gap-0.5" aria-label="Hub conversation navigation">
          {companion ? (
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={onCompanionCollapse} aria-label="Collapse Hub companion">
              <PanelLeft className="h-4 w-4" />
            </Button>
          ) : hasConversation && (
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={onBack} disabled={disabled} aria-label="Back to Hub home">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          {renaming && conversationUuid ? (
            <form className="flex min-w-0 flex-1 items-center gap-1.5" onSubmit={submitRename}>
              <Input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} maxLength={120} autoFocus aria-label="Conversation title" className="h-8 min-w-0 border-0 bg-muted/70 shadow-none focus-visible:ring-1" />
              <Button type="submit" size="sm" className="h-8">Save</Button>
              <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => { setRenameValue(title); setRenaming(false) }}>Cancel</Button>
            </form>
          ) : (
            <button type="button" className="flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-left text-sm font-medium hover:bg-muted/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" onClick={toggleHistory} aria-expanded={panel === 'history'}>
              <span className="truncate">{hasConversation ? title : 'Hub'}</span>
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${panel === 'history' ? 'rotate-180' : ''}`} />
            </button>
          )}
          <div className="flex-1" />
          {hasConversation && entries.length > 0 && !renaming && (
            <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-muted-foreground" onClick={() => setPanel((current) => current === 'resources' ? null : 'resources')} aria-expanded={panel === 'resources'} aria-label={`Open conversation resources (${entries.length})`}>
              <LibraryBig className="h-3.5 w-3.5" />
              <span className="text-xs tabular-nums">{entries.length}</span>
            </Button>
          )}
          {companion && !renaming && (
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onCompanionExpand} aria-label="Open full Hub">
              <Maximize2 className="h-4 w-4" />
            </Button>
          )}
          {!renaming && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={disabled} aria-label="Conversation options">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onSelect={() => { setPanel(null); onNew() }}>
                  <Plus /> New chat
                </DropdownMenuItem>
                {conversationUuid ? <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => { setPanel(null); setRenameValue(title); setRenaming(true) }}>
                    <Pencil /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void onArchive()}>
                    <Archive /> Archive
                  </DropdownMenuItem>
                </> : null}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </header>
        {companion && editRun?.status === 'active' ? <div className="flex h-7 items-start gap-1.5 pl-1 text-xs text-muted-foreground">
          <span className="truncate"><span className="font-semibold text-foreground">Editing:</span> {editRun.scope.label}</span>
          <button type="button" onClick={onStopEditing} className="rounded-full p-0.5 hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Stop editing ${editRun.scope.label}`}><X className="h-3.5 w-3.5" /></button>
        </div> : companion && contextUnavailable ? <div className="flex h-7 items-start gap-1.5 pl-1 text-xs text-muted-foreground">
          <span>I can&apos;t read this page yet.</span>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild><button type="button" aria-label="About Hub page awareness" className="rounded-full focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"><CircleHelp className="h-3.5 w-3.5" /></button></TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-72 text-xs leading-5">Hub can use saved details from supported learner pages when you send a message. It cannot see unsaved text or the visual screen.</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div> : null}

        {panel === 'history' && (
          <HubConversationHistory
            conversations={conversations}
            activeConversationUuid={conversationUuid}
            loading={loading}
            disabled={disabled}
            onSelect={(uuid) => { setPanel(null); onSelect(uuid) }}
            onOpenResources={(uuid) => { setPanel(null); onOpenResources(uuid) }}
          />
        )}
        {panel === 'resources' && entries.length > 0 && (
          <HubResourceTray
            entries={entries}
            orgslug={orgslug}
            onRemove={onRemoveResource}
            onReturnToOrigin={onReturnToOrigin}
            onClose={() => setPanel(null)}
          />
        )}
      </div>
    </div>
  )
}
