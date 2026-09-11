'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { Archive, ArrowLeft, Check, ChevronDown, CircleHelp, LibraryBig, Loader2, Maximize2, MoreHorizontal, PanelLeft, Pencil, Plus, Radio } from 'lucide-react'
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

type Panel = 'history' | 'resources' | 'session' | null

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
  onUpdateEditGoal,
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
  onUpdateEditGoal?: (goal: string) => Promise<void>
  onCompanionCollapse?: () => void
  onCompanionExpand?: () => void
}) {
  const hasConversation = conversationStarted || Boolean(conversationUuid)
  const sessionModeLabel = editRun?.scope.kind === 'new_plan' || /\b(create|start|build)\b.*\bplan\b/i.test(editRun?.goal || '') ? 'Creating a plan' : 'Editing a plan'
  const [panel, setPanel] = useState<Panel>(initialPanel)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(title)
  const [goalEditing, setGoalEditing] = useState(false)
  const [goalValue, setGoalValue] = useState(editRun?.goal || '')
  const [goalSaving, setGoalSaving] = useState(false)
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

  useEffect(() => {
    setGoalValue(editRun?.goal || '')
    setGoalEditing(false)
  }, [editRun?.goal, editRun?.run_uuid])

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
        {companion && editRun?.status === 'active' ? <div className="flex h-8 items-center gap-2 border-l-2 border-violet-400 pl-2 text-xs">
          <Radio className="h-3 w-3 shrink-0 text-violet-500" aria-hidden="true" />
          <button type="button" onClick={() => setPanel((current) => current === 'session' ? null : 'session')} className="group/session flex min-w-0 flex-1 items-center gap-1 text-left" aria-expanded={panel === 'session'}>
            <span className="min-w-0 flex-1 truncate"><span className="mr-1.5 font-semibold text-violet-700 dark:text-violet-300">{sessionModeLabel}:</span><span className="text-muted-foreground">{editRun.goal}</span></span>
            <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${panel === 'session' ? 'rotate-180' : ''}`} />
          </button>
          <button type="button" onClick={onStopEditing} className="shrink-0 rounded-full border border-border px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" aria-label={`End focused session for ${editRun.scope.label}`}>End</button>
        </div> : companion && contextUnavailable ? <div className="flex h-7 items-start gap-1.5 pl-1 text-xs text-muted-foreground">
          <span>I can&apos;t read this page yet.</span>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild><button type="button" aria-label="About Hub page awareness" className="rounded-full focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"><CircleHelp className="h-3.5 w-3.5" /></button></TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-72 text-xs leading-5">Hub can use saved details from supported learner pages when you send a message. It cannot see unsaved text or the visual screen.</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div> : null}

        {panel === 'session' && editRun?.status === 'active' ? <div className="absolute inset-x-4 top-[4.75rem] z-[var(--z-popover)] rounded-xl border border-border bg-popover p-3 shadow-lg sm:inset-x-5">
          <div><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Scope</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{editRun.scope.kind === 'new_plan' ? 'Create and populate a new personal plan' : `Edit plan: ${editRun.scope.label}`}</p></div>
          <form className="mt-3" onSubmit={async (event) => { event.preventDefault(); if (!goalValue.trim() || !onUpdateEditGoal) return; setGoalSaving(true); try { await onUpdateEditGoal(goalValue.trim()); setGoalEditing(false) } finally { setGoalSaving(false) } }}>
            <label htmlFor="hub-session-goal" className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Goal</label>
            <textarea id="hub-session-goal" value={goalValue} onFocus={() => setGoalEditing(true)} onChange={(event) => setGoalValue(event.target.value)} maxLength={500} className="mt-1 min-h-16 w-full resize-y rounded-lg border border-border bg-background px-2.5 py-2 text-xs leading-5 outline-none transition focus:ring-2 focus:ring-ring" />
            {goalEditing || goalValue !== editRun.goal ? <div className="mt-2 flex justify-end gap-1"><Button type="button" variant="ghost" size="sm" className="h-7 text-xs" disabled={goalSaving} onClick={() => { setGoalValue(editRun.goal); setGoalEditing(false) }}>Cancel</Button><Button type="submit" size="sm" className="h-7 gap-1 text-xs" disabled={goalSaving || !goalValue.trim() || goalValue.trim() === editRun.goal}>{goalSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}Save</Button></div> : null}
          </form>
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
