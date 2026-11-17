'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import useSWR from 'swr'
import { toast } from 'react-hot-toast'
import { ArrowUpRight, Bookmark, EyeOff, Loader2, MoreVertical, Plus, Share2, Sparkles } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import NewUserResourceChannelModal from '@components/Resources/NewUserResourceChannelModal'
import ResourceShareModal from '@components/Resources/ResourceShareModal'
import { getChannelIcon } from '@components/Resources/ResourceChannelStyle'
import { Button } from '@components/ui/button'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import { getResourceChannels, saveResource, unsaveResource, type Resource, type UserResourceChannel } from '@services/resources/resources'
import { cn } from '@/lib/utils'
import { tr } from '@/lib/tr'

/** Where the sheet was opened from, when that place has its own list: a plan phase's "Save to this phase". */
export interface SheetContext {
  /** The place's name, like the phase's title. */
  label: string
  /** Why it was suggested here, when it was. */
  reason?: string
  inList: boolean
  /** The Library list behind the place, once it exists; it shows as the place, not as one of the learner's lists. */
  listUuid?: string
  onSave: () => Promise<void>
  onRemove: () => Promise<void>
  /** "Not for this phase": hides it here and closes the sheet. */
  onHide?: () => void
  /** Reload the place after the Library changed under it. */
  refresh?: () => void
}

// Menus open over the resource sheet, which sits at the modal layer.
const OVER_SHEET = { zIndex: 'var(--z-modal-content)' } as const
const ICON_BUTTON = 'size-12 shrink-0 p-0 [&_svg]:size-5'

/**
 * A resource's actions on one line: Open, Save (one question: which list), Ask Coach and ⋮ for the rest.
 * Save holds every list choice, the place it was opened from first; ⋮ never repeats them.
 */
export default function ResourceActions({ resource, label, token, context, onAskCoach, share, onClose, onOpen, onChanged, openRef }: {
  resource: Resource
  /** The Open button, which takes focus when the sheet shows a resource. */
  openRef?: React.Ref<HTMLButtonElement>
  /** The Open button's words, like "Watch on YouTube". */
  label: string
  token?: string
  context?: SheetContext
  onAskCoach?: () => void
  share: { title: string; description?: string | null; url: string }
  onClose: () => void
  onOpen: () => void
  /** After any save change; `saved` is true when it went into the Library just now. */
  onChanged: React.Dispatch<boolean>
}) {
  const org = useOrg() as any
  const signedIn = Boolean(token)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [sharing, setSharing] = React.useState(false)
  const { data: channels, mutate: reloadChannels } = useSWR(signedIn && org?.id ? ['resource-channels', org.id, token] : null, () => getResourceChannels(org.id, token!))
  const lists: UserResourceChannel[] = (channels?.user_channels ?? []).filter((c: UserResourceChannel) => !c.is_default && c.user_channel_uuid !== context?.listUuid)
  const inLists = new Set(resource.user_channel_uuids || [])
  const saved = resource.is_saved || Boolean(context?.inList)

  const run = async (key: string, action: () => Promise<boolean>, failed: string) => {
    if (busy) return
    setBusy(key)
    const wasSaved = resource.is_saved
    try {
      const nowSaved = await action()
      onChanged(!wasSaved && nowSaved)
    } catch {
      toast.error(failed)
    } finally {
      setBusy(null)
    }
  }
  const ok = (result: any) => { if (!result?.success) throw new Error() }
  // The save endpoint replaces the whole set of lists, so every change sends all of them.
  const setLists = async (next: Set<string>) => ok(await saveResource(resource.resource_uuid, { add_to_default_channel: false, user_channel_uuids: [...next] }, token!))
  const couldnt = tr('discover.resource_sheet.couldn_t_save_it_try', 'Couldn’t save it. Try again.')

  const toggleLibrary = () => run('library', async () => {
    if (resource.is_saved) {
      ok(await unsaveResource(resource.resource_uuid, token!))
      context?.refresh?.()
      toast.success(tr('discover.resource_actions.removed', 'Removed from your library'))
      return false
    }
    ok(await saveResource(resource.resource_uuid, { add_to_default_channel: false }, token!))
    toast.success(tr('discover.resource_sheet.saved_to_my_library', 'Saved to My library'))
    return true
  }, resource.is_saved ? tr('discover.resource_sheet.couldn_t_remove_it_try', 'Couldn’t remove it. Try again.') : couldnt)

  const togglePlace = () => context && run('place', async () => {
    if (context.inList) { await context.onRemove(); return resource.is_saved }
    await context.onSave()
    return true
  }, couldnt)

  const toggleList = (uuid: string) => run(uuid, async () => {
    const next = new Set(inLists)
    if (next.has(uuid)) next.delete(uuid); else next.add(uuid)
    await setLists(next)
    return true
  }, couldnt)

  const created = async (channel: UserResourceChannel) => {
    await run(channel.user_channel_uuid, async () => { await setLists(new Set([...inLists, channel.user_channel_uuid])); return true }, couldnt)
    void reloadChannels()
  }

  const keepOpen = (event: Event) => event.preventDefault()
  const row = 'min-h-10 gap-2.5 rounded-lg py-2 pl-9 pr-2 text-sm font-semibold'
  const spinner = (key: string) => busy === key ? <Loader2 size={14} className="ml-auto animate-spin text-muted-foreground" aria-hidden="true" /> : null
  const hide = context?.onHide && !context.inList ? context.onHide : undefined

  return <div className="flex flex-col gap-2">
    <div className="flex items-center gap-2">
      <Button ref={openRef} type="button" variant="brand" size="tall" className="h-auto min-h-12 min-w-0 flex-1 whitespace-normal px-4 py-2 text-center leading-tight" onClick={onOpen}>
        <span>{label}</span><ArrowUpRight size={18} aria-hidden="true" />
      </Button>
      {signedIn ? <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant={saved ? 'default' : 'surface'} size="tall" className={ICON_BUTTON}
            aria-label={saved ? tr('discover.resource_actions.saved_change', 'Saved. Change where it’s saved') : tr('discover.resource_actions.save', 'Save')}
            title={saved ? tr('discover.resource_sheet.saved', 'Saved') : tr('discover.resource_sheet.save', 'Save')}>
            <Bookmark className={cn(saved && 'fill-current')} aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} style={OVER_SHEET} className="w-64 rounded-2xl border-border bg-card p-1.5 shadow-lg">
          <DropdownMenuLabel className="px-2 pb-1 pt-1.5 text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{tr('discover.resource_actions.save_to', 'Save to')}</DropdownMenuLabel>
          {context ? <DropdownMenuCheckboxItem checked={context.inList} onSelect={(e) => { keepOpen(e); void togglePlace() }} className={row}>
            <span className="grid min-w-0"><span className="truncate">{context.label}</span><span className="text-xs font-medium text-muted-foreground">{tr('discover.resource_actions.this_phase', 'This phase')}</span></span>{spinner('place')}
          </DropdownMenuCheckboxItem> : null}
          <DropdownMenuCheckboxItem checked={resource.is_saved} onSelect={(e) => { keepOpen(e); void toggleLibrary() }} className={row}>
            <span className="grid min-w-0"><span className="truncate">{tr('discover.resource_actions.my_library', 'My library')}</span>
              {resource.is_saved ? <span className="text-xs font-medium text-muted-foreground">{tr('discover.resource_actions.uncheck_removes', 'Untick to remove it from every list')}</span> : null}</span>{spinner('library')}
          </DropdownMenuCheckboxItem>
          {lists.map((list) => {
            const Icon = getChannelIcon(list.icon)
            return <DropdownMenuCheckboxItem key={list.user_channel_uuid} checked={inLists.has(list.user_channel_uuid)} onSelect={(e) => { keepOpen(e); void toggleList(list.user_channel_uuid) }} className={row}>
              <Icon size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" /><span className="truncate">{list.name}</span>{spinner(list.user_channel_uuid)}
            </DropdownMenuCheckboxItem>
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreating(true)} className="min-h-10 gap-2.5 rounded-lg px-2 text-sm font-semibold">
            <Plus size={16} aria-hidden="true" />{tr('resources.new_user_resource_channel_modal.new_list', 'New list')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu> : null}
      {onAskCoach ? <Button type="button" variant="surface" size="tall" className={ICON_BUTTON} onClick={onAskCoach}
        aria-label={tr('discover.resource_sheet.ask_coach_about_this', 'Ask Coach about this')} title={tr('discover.resource_sheet.ask_coach_about_this', 'Ask Coach about this')}>
        <Sparkles aria-hidden="true" />
      </Button> : null}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="tall" className={cn(ICON_BUTTON, 'w-10')} aria-label={tr('discover.resource_actions.more', 'More')} title={tr('discover.resource_actions.more', 'More')}>
            <MoreVertical aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} style={OVER_SHEET} className="w-56 rounded-2xl border-border bg-card p-1.5 shadow-lg">
          <DropdownMenuItem onSelect={() => setSharing(true)} className="min-h-10 gap-2.5 rounded-lg px-2 text-sm font-semibold">
            <Share2 aria-hidden="true" />{tr('resources.resource_share_modal.share', 'Share')}
          </DropdownMenuItem>
          {hide ? <DropdownMenuItem onSelect={() => { hide(); onClose() }} className="min-h-10 gap-2.5 rounded-lg px-2 text-sm font-semibold">
            <EyeOff aria-hidden="true" />{tr('discover.resource_sheet.not_for_this_phase', 'Not for this phase')}
          </DropdownMenuItem> : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    {context?.reason && !context.inList ? <span className="px-1 text-[12.5px] font-semibold text-muted-foreground">
      {tr('discover.resource_sheet.for_label_reason', 'For {{label}}: {{reason}}', { label: context.label, reason: context.reason })}
    </span> : null}
    {/* On the body: the sheet's panel is transformed, which would trap a fixed overlay inside it. */}
    {createPortal(<>
      <NewUserResourceChannelModal open={creating} onClose={() => setCreating(false)} onCreated={created} />
      <ResourceShareModal open={sharing} onClose={() => setSharing(false)} title={share.title} description={share.description} url={share.url} eyebrow={tr('lit.resources.resource', 'Resource')} />
    </>, document.body)}
  </div>
}
