'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { Check, Link2, Loader2 } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Textarea } from '@components/ui/textarea'
import { getResourceUrlPreview, type ResourceType } from '@services/resources/resources'
import { AUDIENCE_LABELS, RESOURCE_TYPES, isResourcesKey, resourcesApi, type ChannelAudience, type ChannelCard, type ResourceInput } from '@services/resources/workspace'
import { cn } from '@/lib/utils'
import { AudienceIcon, channelHref, resourceHref, useResourcesContext } from './pieces'

const fieldClass = 'space-y-1.5'
const normalizeUrl = (value: string) => {
  const trimmed = value.trim()
  return trimmed && !/^https?:\/\//i.test(trimmed) ? `https://${trimmed}` : trimmed
}

const guessType = (link: string, ogType?: string | null): ResourceType => {
  const text = `${link} ${ogType || ''}`.toLowerCase()
  if (/youtube|youtu\.be|vimeo|video/.test(text)) return 'video'
  if (/course|coursera|edx|udemy|khanacademy/.test(text)) return 'course'
  if (/quiz|assessment|test|profiler/.test(text)) return 'assessment'
  return 'article'
}

export type EditableResource = ResourceInput & { resource_uuid: string }

/**
 * Add a link (paste it and the title, description and picture fill in) to the org's resources and,
 * if you pick them, its channels. With `resource`, edits that resource instead.
 */
export function ResourceModal({ open, setOpen, ...props }: {
  open: boolean; setOpen: React.Dispatch<boolean>; channels: ChannelCard[]
  /** The channel the modal was opened from; it starts picked. */
  presetChannel?: string
  resource?: EditableResource
}) {
  return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="md" dialogTitle={props.resource ? 'Edit resource' : 'Add a resource'}
    dialogDescription={props.resource ? undefined : 'Paste a link. Anyone on your staff can add the resources your org uses.'}
    dialogContent={<ResourceForm {...props} close={() => setOpen(false)} />} />
}

/** The form inside ResourceModal; it mounts each time the modal opens, so it starts fresh. */
function ResourceForm({ channels, presetChannel, resource, close }: { channels: ChannelCard[]; presetChannel?: string; resource?: EditableResource; close: () => void }) {
  const router = useRouter()
  const { orgId, orgslug, token } = useResourcesContext()
  const [form, setForm] = React.useState<ResourceInput>(() => ({ title: '', external_url: '', resource_type: 'article', description: '', provider_name: '', cover_image_url: null, estimated_time: null, ...resource }))
  const [picked, setPicked] = React.useState<string[]>(presetChannel ? [presetChannel] : [])
  const [looking, setLooking] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const own = channels.filter((channel) => !channel.is_shared_from_other_org)
  const set = (patch: Partial<ResourceInput>) => setForm((current) => ({ ...current, ...patch }))

  const lookUp = async () => {
    const link = normalizeUrl(form.external_url)
    if (!link || resource) return
    set({ external_url: link })
    setLooking(true)
    try {
      const preview = await getResourceUrlPreview(link, token)
      setForm((current) => ({
        ...current,
        title: current.title || preview.title || '',
        description: current.description || preview.description || '',
        cover_image_url: current.cover_image_url || preview.og_image || null,
        provider_name: current.provider_name || new URL(link).hostname.replace(/^www\./, ''),
        resource_type: current.title ? current.resource_type : guessType(link, preview.og_type),
      }))
    } catch { /* The link may not allow previews; people fill it in themselves. */ } finally { setLooking(false) }
  }

  const submit = async () => {
    const payload = { ...form, external_url: normalizeUrl(form.external_url), title: form.title.trim(), estimated_time: form.estimated_time || null }
    if (!payload.title || !payload.external_url) return
    setBusy(true)
    try {
      if (resource) {
        await resourcesApi.updateResource(resource.resource_uuid, payload, token)
        toast.success('Saved')
      } else {
        const created = await resourcesApi.createResource(orgId, payload, token)
        await Promise.all(picked.map((uuid) => resourcesApi.link(uuid, created.resource_uuid, token)))
        toast.success('Added to your resources')
        if (!presetChannel) router.push(resourceHref(orgslug, created.resource_uuid))
      }
      await mutate(isResourcesKey)
      close()
    } catch (failure: any) { toast.error(failure?.message || 'Could not save the resource.') } finally { setBusy(false) }
  }

  return <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <div className={fieldClass}>
        <Label htmlFor="resource-link">Link</Label>
        <div className="relative">
          <Link2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input id="resource-link" value={form.external_url} placeholder="https://" className="pl-9" autoFocus={!resource}
            onChange={(event) => set({ external_url: event.target.value })} onBlur={() => void lookUp()} />
          {looking ? <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Looking up the link" /> : null}
        </div>
      </div>
      <div className={fieldClass}>
        <Label htmlFor="resource-title">Title</Label>
        <Input id="resource-title" value={form.title} onChange={(event) => set({ title: event.target.value })} required />
      </div>
      <div className={fieldClass}>
        <Label htmlFor="resource-description">Description</Label>
        <Textarea id="resource-description" rows={3} value={form.description || ''} placeholder="What it is, and when learners should use it" onChange={(event) => set({ description: event.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className={fieldClass}>
          <Label htmlFor="resource-type">Type</Label>
          <select id="resource-type" value={form.resource_type} onChange={(event) => set({ resource_type: event.target.value as ResourceType })}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
            {RESOURCE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </div>
        <div className={fieldClass}>
          <Label htmlFor="resource-time">Minutes (optional)</Label>
          <Input id="resource-time" type="number" min={1} value={form.estimated_time ?? ''} onChange={(event) => set({ estimated_time: event.target.value ? Number(event.target.value) : null })} />
        </div>
      </div>
      <div className={fieldClass}>
        <Label htmlFor="resource-provider">From</Label>
        <Input id="resource-provider" value={form.provider_name || ''} placeholder="Who made it" onChange={(event) => set({ provider_name: event.target.value })} />
      </div>
      {!resource && own.length ? <fieldset className={fieldClass}>
        <legend className="text-sm font-medium">Channels</legend>
        <div className="flex flex-wrap gap-1.5">
          {own.map((channel) => {
            const on = picked.includes(channel.channel_uuid)
            return <button key={channel.channel_uuid} type="button" aria-pressed={on} onClick={() => setPicked(on ? picked.filter((uuid) => uuid !== channel.channel_uuid) : [...picked, channel.channel_uuid])}
              className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[13px] font-semibold', on ? 'border-foreground bg-foreground text-background' : 'border-border bg-card hover:bg-muted')}>
              {on ? <Check size={13} aria-hidden="true" /> : null}{channel.name}
            </button>
          })}
        </div>
      </fieldset> : null}
      <Button type="submit" className="ml-auto flex" disabled={busy || !form.title.trim() || !form.external_url.trim()}>
        {busy ? <Loader2 className="animate-spin" /> : null}{resource ? 'Save' : 'Add resource'}
      </Button>
    </form>
}

const AUDIENCE_HINTS: Record<ChannelAudience, string> = {
  org: 'Every learner and staff member in your org',
  groups: 'Only the groups you pick',
  staff: 'Only your staff',
}

/** Who sees a channel, as three choices. */
export function AudienceChoices({ value, onChange, orgName }: { value: ChannelAudience; onChange: React.Dispatch<ChannelAudience>; orgName: string }) {
  return <div className="grid gap-2" role="radiogroup" aria-label="Who sees it">
    {(['org', 'groups', 'staff'] as ChannelAudience[]).map((audience) => <button key={audience} type="button" role="radio" aria-checked={value === audience} onClick={() => onChange(audience)}
      className={cn('flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left', value === audience ? 'border-foreground bg-muted/60' : 'border-border hover:bg-muted/40')}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-muted"><AudienceIcon audience={audience} size={16} /></span>
      <span className="min-w-0 flex-1"><b className="block text-sm">{audience === 'org' ? `Everyone at ${orgName}` : AUDIENCE_LABELS[audience]}</b><span className="text-xs text-muted-foreground">{AUDIENCE_HINTS[audience]}</span></span>
      {value === audience ? <Check size={16} aria-hidden="true" /> : null}
    </button>)}
  </div>
}

/** Start a channel: its name, a line about it, and who sees it. */
export function NewChannelModal({ open, setOpen }: { open: boolean; setOpen: React.Dispatch<boolean> }) {
  return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="sm" dialogTitle="New channel" dialogDescription="A channel groups resources for a topic or a group of learners."
    dialogContent={<NewChannelForm close={() => setOpen(false)} />} />
}

function NewChannelForm({ close }: { close: () => void }) {
  const router = useRouter()
  const { orgId, orgslug, orgName, token } = useResourcesContext()
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [audience, setAudience] = React.useState<ChannelAudience>('org')
  const [busy, setBusy] = React.useState(false)
  const create = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      const channel = await resourcesApi.createChannel(orgId, { name: name.trim(), description: description.trim() || null, audience }, token)
      await mutate(isResourcesKey)
      close()
      router.push(channelHref(orgslug, channel.channel_uuid))
    } catch (failure: any) { toast.error(failure?.message || 'Could not create the channel.') } finally { setBusy(false) }
  }
  return <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void create() }}>
    <div className={fieldClass}><Label htmlFor="channel-name">Name</Label><Input id="channel-name" value={name} autoFocus onChange={(event) => setName(event.target.value)} required /></div>
    <div className={fieldClass}><Label htmlFor="channel-description">Description</Label><Textarea id="channel-description" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} /></div>
    <div className={fieldClass}><Label>Who sees it</Label><AudienceChoices value={audience} onChange={setAudience} orgName={orgName} /></div>
    {audience === 'groups' ? <p className="text-xs text-muted-foreground">You’ll pick the groups on the channel’s page.</p> : null}
    <Button type="submit" className="ml-auto flex" disabled={busy || !name.trim()}>{busy ? <Loader2 className="animate-spin" /> : null}Create channel</Button>
  </form>
}
