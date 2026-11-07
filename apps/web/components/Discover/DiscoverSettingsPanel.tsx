'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Textarea } from '@components/ui/textarea'
import { Switch } from '@components/ui/switch'
import { planJoiningApi, type DiscoverSettings, type DiscoverSettingsResponse, type DiscoverSlideConfig, type DiscoverSlideKind } from '@services/goals/planJoining'

import { tr } from '@/lib/tr'
const kinds: { value: DiscoverSlideKind; label: string }[] = [
  { value: 'plan', get label() { return tr('discover.discover_settings_panel.featured_plan', 'Featured plan') } }, { value: 'collection', get label() { return tr('discover.discover_settings_panel.collection', 'Collection') } },
  { value: 'link', get label() { return tr('discover.discover_settings_panel.custom_story', 'Custom story') } },
  { value: 'challenges', get label() { return tr('discover.discover_settings_panel.challenges_coming_soon', 'Challenges coming soon') } },
]
const blank = (): DiscoverSlideConfig => ({ kind: 'challenges', target: 'challenges', title: '', description: '', eyebrow: '', action_label: '', image_url: '/jungle_landscape.jpg', thumbnail_url: '', theme: 'dark' })
const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm'

/** Organization › Learner Discover: the carousel at the top of learners' Discover page. */
export default function DiscoverSettingsPanel({ orgId }: { orgId: number }) {
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
    try { const result = await planJoiningApi.settings(orgId, token); setData(result); setDraft(result.settings); loadedOrg.current = orgId }
    catch (failure: any) { setError(failure?.message || tr('lit.discover_settings_panel.could_not_load_discover_settings', 'Could not load Discover settings')) }
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
    try { const result = await planJoiningApi.saveSettings(orgId, draft, token); setData(result); setDraft(result.settings); toast.success(tr('discover.discover_settings_panel.discover_carousel_saved', 'Discover carousel saved')) }
    catch (failure: any) { setError(failure?.message || tr('lit.discover_settings_panel.could_not_save_discover_settings', 'Could not save Discover settings')) }
    finally { setSaving(false) }
  }
  return <div className="min-h-full bg-background text-foreground">
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div><h1 className="text-2xl font-semibold">{tr('discover.discover_settings_panel.discover_carousel', 'Discover carousel')}</h1><p className="mt-2 text-sm text-muted-foreground">{tr('discover.discover_settings_panel.feature_plans_collections_and_announcements', 'Feature plans, collections and announcements at the top of Discover.')}</p></div>
      {error ? <div role="alert" className="rounded-lg border border-destructive p-4 text-sm">{error}{!draft ? <Button onClick={() => void load(true)} variant="ghost">{tr('discover.discover_settings_panel.retry', 'Retry')}</Button> : null}</div> : null}
      {!draft ? !error && <p role="status">{tr('discover.discover_settings_panel.loading_settings', 'Loading settings…')}</p> : <form className="space-y-6" onSubmit={event => { event.preventDefault(); void save() }}>
        <fieldset disabled={saving} className="space-y-6">
          <div className="flex items-center justify-between rounded-xl bg-card p-4"><label htmlFor="discover-enabled" className="font-medium">{tr('discover.discover_settings_panel.show_carousel', 'Show carousel')}</label><Switch id="discover-enabled" checked={draft.enabled} onCheckedChange={enabled => setDraft({ ...draft, enabled })} /></div>
          <label className="grid gap-2 text-sm font-medium">{tr('discover.discover_settings_panel.content_selection', 'Content selection')}<select aria-label={tr('discover.discover_settings_panel.content_selection', 'Content selection')} className={selectClass} value={draft.mode} onChange={event => setDraft({ ...draft, mode: event.target.value as DiscoverSettings['mode'] })}><option value="automatic">{tr('discover.discover_settings_panel.automatic', 'Automatic')}</option><option value="curated">{tr('discover.discover_settings_panel.curated', 'Curated')}</option></select><span className="font-normal text-muted-foreground">{tr('discover.discover_settings_panel.automatic_includes_featured_plans_a', 'Automatic includes featured plans, a collection and the challenges announcement. Curated uses your slides in the order below.')}</span></label>
          {draft.mode === 'curated' ? <div className="space-y-4">
            {draft.slides.map((slide, index) => {
              const sources = slide.kind === 'plan' ? data?.options.plans : slide.kind === 'collection' ? data?.options.collections : undefined
              return <section key={index} className="space-y-4 rounded-xl border border-border bg-card p-4" aria-label={`Slide ${index + 1}`}>
                <div className="flex items-center justify-between"><h2 className="font-semibold">{tr('discover.discover_settings_panel.slide', 'Slide')}{' '}{index + 1}</h2><div className="flex gap-1"><Button type="button" size="icon" variant="ghost" disabled={index === 0} aria-label={`Move slide ${index + 1} up`} onClick={() => move(index, -1)}><ArrowUp size={16} /></Button><Button type="button" size="icon" variant="ghost" disabled={index === draft.slides.length - 1} aria-label={`Move slide ${index + 1} down`} onClick={() => move(index, 1)}><ArrowDown size={16} /></Button><Button type="button" size="icon" variant="ghost" aria-label={`Remove slide ${index + 1}`} onClick={() => setDraft({ ...draft, slides: draft.slides.filter((_, position) => position !== index) })}><Trash2 size={16} /></Button></div></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium">{tr('discover.discover_settings_panel.story_type', 'Story type')}<select aria-label={tr('discover.discover_settings_panel.story_type', 'Story type')} className={selectClass} value={slide.kind} onChange={event => { const kind = event.target.value as DiscoverSlideKind; update(index, { kind, target: kind === 'challenges' ? 'challenges' : '', theme: kind === 'plan' ? 'blue' : 'dark' }) }}>{kinds.map(kind => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select></label>
                  {slide.kind === 'link' ? <label className="grid gap-2 text-sm font-medium">{tr('discover.discover_settings_panel.destination', 'Destination')}<Input required value={slide.target} placeholder="/plans or https://…" onChange={event => update(index, { target: event.target.value })} /></label> : slide.kind !== 'challenges' ? <label className="grid gap-2 text-sm font-medium">{tr('discover.discover_settings_panel.published_source', 'Published source')}<select aria-label={tr('discover.discover_settings_panel.published_source', 'Published source')} required className={selectClass} value={slide.target} onChange={event => update(index, { target: event.target.value })}><option value="">{tr('discover.discover_settings_panel.choose_a_source', 'Choose a source')}</option>{slide.target && !sources?.some(source => source.id === slide.target) ? <option value={slide.target}>{tr('discover.discover_settings_panel.unavailable_source_choose_another', 'Unavailable source — choose another')}</option> : null}{sources?.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label> : null}
                  <label className="grid gap-2 text-sm font-medium">{tr('discover.discover_settings_panel.title', 'Title')}{slide.kind !== 'link' ? tr('discover.discover_settings_panel.optional', ' (optional)') : ''}<Input required={slide.kind === 'link'} value={slide.title} placeholder={tr('discover.discover_settings_panel.use_source_title', 'Use source title')} onChange={event => update(index, { title: event.target.value })} maxLength={160} /></label>
                  <label className="grid gap-2 text-sm font-medium">{tr('discover.discover_settings_panel.eyebrow_optional', 'Eyebrow (optional)')}<Input value={slide.eyebrow} onChange={event => update(index, { eyebrow: event.target.value })} maxLength={80} /></label>
                  <label className="grid gap-2 text-sm font-medium sm:col-span-2">{tr('discover.discover_settings_panel.description_optional', 'Description (optional)')}<Textarea value={slide.description} placeholder={tr('discover.discover_settings_panel.use_source_description', 'Use source description')} onChange={event => update(index, { description: event.target.value })} maxLength={500} /></label>
                  <label className="grid gap-2 text-sm font-medium">{tr('discover.discover_settings_panel.hero_image_url_optional', 'Hero image URL (optional)')}<Input value={slide.image_url} placeholder="/image.jpg or https://…" onChange={event => update(index, { image_url: event.target.value })} /></label>
                  <label className="grid gap-2 text-sm font-medium">{tr('discover.discover_settings_panel.thumbnail_url_optional', 'Thumbnail URL (optional)')}<Input value={slide.thumbnail_url} onChange={event => update(index, { thumbnail_url: event.target.value })} /></label>
                  {slide.kind !== 'challenges' ? <label className="grid gap-2 text-sm font-medium">{tr('discover.discover_settings_panel.button_label_optional', 'Button label (optional)')}<Input value={slide.action_label} onChange={event => update(index, { action_label: event.target.value })} maxLength={60} /></label> : null}
                  <label className="grid gap-2 text-sm font-medium">{tr('discover.discover_settings_panel.artwork_background', 'Artwork background')}<select aria-label={tr('discover.discover_settings_panel.artwork_background', 'Artwork background')} className={selectClass} value={slide.theme} onChange={event => update(index, { theme: event.target.value as DiscoverSlideConfig['theme'] })}><option value="dark">{tr('discover.discover_settings_panel.dark', 'Dark')}</option><option value="blue">{tr('discover.discover_settings_panel.blue', 'Blue')}</option><option value="light">{tr('discover.discover_settings_panel.light', 'Light')}</option></select></label>
                </div>
              </section>
            })}
            {!draft.slides.length ? <p className="text-sm text-muted-foreground">{tr('discover.discover_settings_panel.no_curated_slides_yet_add', 'No curated slides yet. Add a story to show the hero.')}</p> : null}
            <Button type="button" variant="outline" disabled={draft.slides.length >= 6} onClick={() => setDraft({ ...draft, slides: [...draft.slides, blank()] })}>{tr('discover.discover_settings_panel.add_slide', 'Add slide')}</Button>
          </div> : null}
        </fieldset>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={saving} onClick={() => { if (data) setDraft(data.settings); setError('') }}>{tr('discover.discover_settings_panel.reset_changes', 'Reset changes')}</Button><Button type="submit" disabled={saving}>{saving ? tr('discover.discover_settings_panel.saving', 'Saving…') : tr('discover.discover_settings_panel.save_carousel', 'Save carousel')}</Button></div>
      </form>}
    </div>
  </div>
}
