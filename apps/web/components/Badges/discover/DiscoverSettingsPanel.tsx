'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import AdminFeatureHeader from '@components/Admin/AdminFeatureHeader'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Textarea } from '@components/ui/textarea'
import { Switch } from '@components/ui/switch'
import { getUriWithOrg } from '@services/config/config'
import { badgeDiscoverApi, type DiscoverSettings, type DiscoverSettingsResponse, type DiscoverSlideConfig, type DiscoverSlideKind } from '@services/learning/badgeDiscover'

const kinds: { value: DiscoverSlideKind; label: string }[] = [
  { value: 'badge', label: 'Featured badge' }, { value: 'collection', label: 'Badge series' },
  { value: 'news', label: 'News' }, { value: 'link', label: 'Custom story' },
  { value: 'challenges', label: 'Challenges coming soon' },
]
const blank = (): DiscoverSlideConfig => ({ kind: 'challenges', target: 'challenges', title: '', description: '', eyebrow: '', action_label: '', image_url: '/jungle_landscape.jpg', thumbnail_url: '', theme: 'dark' })
const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm'

export default function DiscoverSettingsPanel({ orgId, orgslug }: { orgId: number; orgslug: string }) {
  const session = useLHSession() as any
  const token = session.data?.tokens?.access_token
  const [data, setData] = useState<DiscoverSettingsResponse | null>(null)
  const [draft, setDraft] = useState<DiscoverSettings | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const loadedOrg = useRef<number | null>(null)
  const load = useCallback(async (force = false) => {
    if (!token || (!force && loadedOrg.current === orgId)) return
    setError('')
    try { const result = await badgeDiscoverApi.settings(orgId, token); setData(result); setDraft(result.settings); loadedOrg.current = orgId }
    catch (failure: any) { setError(failure?.message || 'Could not load Discover settings') }
  }, [orgId, token])
  useEffect(() => { void load() }, [load])
  const update = (index: number, values: Partial<DiscoverSlideConfig>) => setDraft(current => current && ({ ...current, slides: current.slides.map((slide, position) => position === index ? { ...slide, ...values } : slide) }))
  const move = (index: number, direction: number) => setDraft(current => {
    if (!current) return current
    const slides = [...current.slides]
    const next = index + direction
    if (next < 0 || next >= slides.length) return current
    ;[slides[index], slides[next]] = [slides[next], slides[index]]
    return { ...current, slides }
  })
  const save = async () => {
    if (!draft || !token || saving) return
    setSaving(true); setError('')
    try { const result = await badgeDiscoverApi.saveSettings(orgId, draft, token); setData(result); setDraft(result.settings); toast.success('Discover carousel saved') }
    catch (failure: any) { setError(failure?.message || 'Could not save Discover settings') }
    finally { setSaving(false) }
  }
  return <div className="min-h-full bg-background text-foreground">
    <AdminFeatureHeader feature="Discover" tabs={[]} activeTab="discover" actions={<Button asChild size="sm" variant="outline"><Link href={getUriWithOrg(orgslug, '/admin/badges')}>Back to badges</Link></Button>} />
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div><h1 className="text-2xl font-semibold">Discover carousel</h1><p className="mt-2 text-sm text-muted-foreground">Feature news, badges, series, and announcements at the top of Discover.</p></div>
      {error ? <div role="alert" className="rounded-lg border border-destructive p-4 text-sm">{error}{!draft ? <Button onClick={() => void load(true)} variant="ghost">Retry</Button> : null}</div> : null}
      {!draft ? !error && <p role="status">Loading settings…</p> : <form className="space-y-6" onSubmit={event => { event.preventDefault(); void save() }}>
        <fieldset disabled={saving} className="space-y-6">
          <div className="flex items-center justify-between rounded-xl bg-card p-4"><label htmlFor="discover-enabled" className="font-medium">Show carousel</label><Switch id="discover-enabled" checked={draft.enabled} onCheckedChange={enabled => setDraft({ ...draft, enabled })} /></div>
          <label className="grid gap-2 text-sm font-medium">Content selection<select aria-label="Content selection" className={selectClass} value={draft.mode} onChange={event => setDraft({ ...draft, mode: event.target.value as DiscoverSettings['mode'] })}><option value="automatic">Automatic</option><option value="curated">Curated</option></select><span className="font-normal text-muted-foreground">Automatic includes featured news, badges, a series, and the challenges announcement. Curated uses your slides in the order below.</span></label>
          {draft.mode === 'curated' ? <div className="space-y-4">
            {draft.slides.map((slide, index) => {
              const sources = slide.kind === 'badge' ? data?.options.badges : slide.kind === 'collection' ? data?.options.collections : data?.options.news
              return <section key={index} className="space-y-4 rounded-xl border border-border bg-card p-4" aria-label={`Slide ${index + 1}`}>
                <div className="flex items-center justify-between"><h2 className="font-semibold">Slide {index + 1}</h2><div className="flex gap-1"><Button type="button" size="icon" variant="ghost" disabled={index === 0} aria-label={`Move slide ${index + 1} up`} onClick={() => move(index, -1)}><ArrowUp size={16} /></Button><Button type="button" size="icon" variant="ghost" disabled={index === draft.slides.length - 1} aria-label={`Move slide ${index + 1} down`} onClick={() => move(index, 1)}><ArrowDown size={16} /></Button><Button type="button" size="icon" variant="ghost" aria-label={`Remove slide ${index + 1}`} onClick={() => setDraft({ ...draft, slides: draft.slides.filter((_, position) => position !== index) })}><Trash2 size={16} /></Button></div></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium">Story type<select aria-label="Story type" className={selectClass} value={slide.kind} onChange={event => { const kind = event.target.value as DiscoverSlideKind; update(index, { kind, target: kind === 'challenges' ? 'challenges' : '', theme: kind === 'badge' ? 'blue' : 'dark' }) }}>{kinds.map(kind => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select></label>
                  {slide.kind === 'link' ? <label className="grid gap-2 text-sm font-medium">Destination<Input required value={slide.target} placeholder="/plans or https://…" onChange={event => update(index, { target: event.target.value })} /></label> : slide.kind !== 'challenges' ? <label className="grid gap-2 text-sm font-medium">Published source<select aria-label="Published source" required className={selectClass} value={slide.target} onChange={event => update(index, { target: event.target.value })}><option value="">Choose a source</option>{slide.target && !sources?.some(source => source.id === slide.target) ? <option value={slide.target}>Unavailable source — choose another</option> : null}{sources?.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label> : null}
                  <label className="grid gap-2 text-sm font-medium">Title{slide.kind !== 'link' ? ' (optional)' : ''}<Input required={slide.kind === 'link'} value={slide.title} placeholder="Use source title" onChange={event => update(index, { title: event.target.value })} maxLength={160} /></label>
                  <label className="grid gap-2 text-sm font-medium">Eyebrow (optional)<Input value={slide.eyebrow} onChange={event => update(index, { eyebrow: event.target.value })} maxLength={80} /></label>
                  <label className="grid gap-2 text-sm font-medium sm:col-span-2">Description (optional)<Textarea value={slide.description} placeholder="Use source description" onChange={event => update(index, { description: event.target.value })} maxLength={500} /></label>
                  <label className="grid gap-2 text-sm font-medium">Hero image URL (optional)<Input value={slide.image_url} placeholder="/image.jpg or https://…" onChange={event => update(index, { image_url: event.target.value })} /></label>
                  <label className="grid gap-2 text-sm font-medium">Thumbnail URL (optional)<Input value={slide.thumbnail_url} onChange={event => update(index, { thumbnail_url: event.target.value })} /></label>
                  {slide.kind !== 'challenges' ? <label className="grid gap-2 text-sm font-medium">Button label (optional)<Input value={slide.action_label} onChange={event => update(index, { action_label: event.target.value })} maxLength={60} /></label> : null}
                  <label className="grid gap-2 text-sm font-medium">Artwork background<select aria-label="Artwork background" className={selectClass} value={slide.theme} onChange={event => update(index, { theme: event.target.value as DiscoverSlideConfig['theme'] })}><option value="dark">Dark</option><option value="blue">Blue</option><option value="light">Light</option></select></label>
                </div>
              </section>
            })}
            {!draft.slides.length ? <p className="text-sm text-muted-foreground">No curated slides yet. Add a story to show the hero.</p> : null}
            <Button type="button" variant="outline" disabled={draft.slides.length >= 6} onClick={() => setDraft({ ...draft, slides: [...draft.slides, blank()] })}>Add slide</Button>
          </div> : null}
        </fieldset>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={saving} onClick={() => { if (data) setDraft(data.settings); setError('') }}>Reset changes</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save carousel'}</Button></div>
      </form>}
    </div>
  </div>
}
