'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { ArrowSquareOut, CheckCircle, Circle, EyeSlash, Eye, PushPin } from '@phosphor-icons/react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Switch } from '@components/ui/switch'
import { Textarea } from '@components/ui/textarea'
import { OrganizationCard } from '@components/Discover/OrganizationShelf'
import { pageGaps } from '@components/Organizations/publicPage'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { planJoiningApi, type PlanOfferCard } from '@services/goals/planJoining'
import { getDiscoverOrganizationBySlug, PUBLIC_PAGE_LIMITS, updatePublicPage, type DiscoverOrganization, type PublicPageGap } from '@services/organizations/orgs'
import { revalidateTags } from '@services/utils/ts/requests'
import { cn } from '@/lib/utils'
import { tr } from '@/lib/tr'

const SOCIALS = [
  { key: 'instagram', label: 'Instagram' }, { key: 'facebook', label: 'Facebook' }, { key: 'linkedin', label: 'LinkedIn' },
  { key: 'youtube', label: 'YouTube' }, { key: 'twitter', label: 'X' },
] as const

type Draft = { description: string; about: string; city: string; website: string; highlights: string[]; socials: Record<string, string>; pinned_plans: string[]; hidden_plans: string[] }

const draftOf = (org: DiscoverOrganization): Draft => ({
  description: org.description || '', about: org.about || '', city: org.page.city, website: org.page.website,
  highlights: [0, 1, 2].map((index) => org.page.highlights[index] || ''),
  socials: Object.fromEntries(SOCIALS.map(({ key }) => [key, String(org.socials?.[key] || '')])),
  pinned_plans: org.page.pinned_plans, hidden_plans: org.page.hidden_plans,
})

const GAP_TEXT: Record<PublicPageGap, () => string> = {
  cover: () => tr('organizations.public_page.gap_cover', 'A cover photo (set it in Branding)'),
  tagline: () => tr('organizations.public_page.gap_tagline', 'A one-line tagline'),
  plan: () => tr('organizations.public_page.gap_plan', 'At least one plan anyone can join or ask to join'),
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return <section className="flex flex-col gap-4 rounded-xl bg-card p-5 nice-shadow">
    <div><h2 className="m-0 text-base font-semibold">{title}</h2>{hint ? <p className="m-0 mt-1 text-sm text-muted-foreground">{hint}</p> : null}</div>
    {children}
  </section>
}

/** One plan the organization offers, with pin (show first) and hide (keep off the page). */
function PlanRow({ card, pinned, hidden, canPin, onPin, onHide }: { card: PlanOfferCard; pinned: boolean; hidden: boolean; canPin: boolean; onPin: () => void; onHide: () => void }) {
  return <li className={cn('flex items-center gap-3 rounded-lg border border-border px-3 py-2', hidden && 'opacity-60')}>
    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{card.title}{card.badge ? <span className="ml-2 text-xs font-normal text-muted-foreground">{tr('organizations.public_page.earns_a_badge', 'earns a badge')}</span> : null}</span>
    <button type="button" onClick={onPin} disabled={hidden || (!pinned && !canPin)} aria-pressed={pinned} aria-label={tr('organizations.public_page.pin_title', 'Show {{title}} first', { title: card.title })}
      className={cn('flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted disabled:opacity-40', pinned ? 'text-foreground' : 'text-muted-foreground')}><PushPin size={18} weight={pinned ? 'fill' : 'regular'} /></button>
    <button type="button" onClick={onHide} aria-pressed={hidden} aria-label={hidden ? tr('organizations.public_page.show_title', 'Show {{title}} on the page', { title: card.title }) : tr('organizations.public_page.hide_title', 'Hide {{title}} from the page', { title: card.title })}
      className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">{hidden ? <EyeSlash size={18} /> : <Eye size={18} />}</button>
  </li>
}

/**
 * Organization › Public page: everything on the organization's page (tagline, story, highlights,
 * where to find it, which plans show) and the opt-in "List us in Discover" switch with what's missing.
 */
export default function OrgEditPublicPage() {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const { data: saved, mutate, error } = useSWR(org?.slug && token ? ['public-page', org.slug, token] : null, () => getDiscoverOrganizationBySlug(org.slug, null, token), { revalidateOnFocus: false })
  const { data: feed } = useSWR(org?.id ? ['public-page-plans', org.id, token || 'public'] : null, () => planJoiningApi.discover(token, org.id), { revalidateOnFocus: false })
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => { if (saved && !draft) setDraft(draftOf(saved)) }, [saved, draft])

  const plans = React.useMemo(() => {
    const cards = feed ? [...feed.keep_going, ...feed.plans] : []
    return cards.filter((card, index) => cards.findIndex((other) => other.template_uuid === card.template_uuid) === index)
  }, [feed])
  if (error) return <p role="alert" className="mx-auto max-w-4xl p-6 text-sm text-muted-foreground">{tr('organizations.public_page.could_not_load', 'Your public page couldn’t load. Refresh to try again.')}</p>
  if (!saved || !draft) return <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6" aria-busy="true">{[0, 1, 2].map((index) => <div key={index} className="h-40 animate-pulse rounded-xl bg-muted" />)}</div>

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch })
  const shownPlans = plans.filter((card) => !draft.hidden_plans.includes(card.template_uuid))
  const gaps = pageGaps({ thumbnail_image: saved.thumbnail_image, description: draft.description }, feed ? shownPlans.length : saved.plan_count)
  const pageHref = getUriWithOrg(org.slug, routePaths.org.organization(org.slug))
  const preview: DiscoverOrganization = { ...saved, description: draft.description, plan_count: shownPlans.length, badge_count: shownPlans.filter((card) => card.badge).length }

  const save = async (patch: { listed?: boolean } = {}) => {
    setBusy(true)
    try {
      const result = await updatePublicPage(org.id, {
        description: draft.description, about: draft.about, city: draft.city, website: draft.website,
        highlights: draft.highlights.map((item) => item.trim()).filter(Boolean), socials: draft.socials,
        pinned_plans: draft.pinned_plans, hidden_plans: draft.hidden_plans, ...patch,
      }, token)
      await mutate(result, { revalidate: false })
      setDraft(draftOf(result))
      await revalidateTags(['organizations'], org.slug)
      toast.success(patch.listed === true ? tr('organizations.public_page.listed', 'You’re listed in Discover.') : patch.listed === false ? tr('organizations.public_page.unlisted', 'Your page is members-only now.') : tr('organizations.public_page.saved', 'Public page saved.'))
    } catch (failure: any) {
      toast.error(failure?.message || tr('organizations.public_page.could_not_save', 'Couldn’t save your public page.'))
    } finally {
      setBusy(false)
    }
  }
  const togglePin = (uuid: string) => set({ pinned_plans: draft.pinned_plans.includes(uuid) ? draft.pinned_plans.filter((item) => item !== uuid) : [...draft.pinned_plans, uuid] })
  const toggleHide = (uuid: string) => draft.hidden_plans.includes(uuid)
    ? set({ hidden_plans: draft.hidden_plans.filter((item) => item !== uuid) })
    : set({ hidden_plans: [...draft.hidden_plans, uuid], pinned_plans: draft.pinned_plans.filter((item) => item !== uuid) })

  return <div className="min-h-full bg-background text-foreground">
    <div className="mx-auto grid max-w-6xl gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_260px]">
      <form className="flex min-w-0 flex-col gap-5" onSubmit={(event) => { event.preventDefault(); void save() }}>
        <div>
          <h1 className="m-0 text-2xl font-semibold">{tr('organizations.public_page.title', 'Public page')}</h1>
          <p className="m-0 mt-1 text-sm text-muted-foreground">{tr('organizations.public_page.subtitle', 'What people see about you: the plans you offer, the badges they earn, and your story. It never shows your members.')}</p>
        </div>

        <Section title={tr('organizations.public_page.list_in_discover', 'List us in Discover')} hint={saved.explore
          ? tr('organizations.public_page.listed_hint', 'Your page is public: anyone with the link can open it, signed in or not.')
          : tr('organizations.public_page.unlisted_hint', 'Off: your page is for your members only. Turn it on to be found in Discover and share your page with anyone.')}>
          <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label={tr('organizations.public_page.checklist', 'Before you can list your page')}>
            {(['cover', 'tagline', 'plan'] as PublicPageGap[]).map((gap) => {
              const done = !gaps.includes(gap)
              return <li key={gap} className="flex items-center gap-2 text-sm">
                {done ? <CheckCircle size={18} weight="fill" className="text-emerald-600" aria-hidden="true" /> : <Circle size={18} className="text-muted-foreground" aria-hidden="true" />}
                <span className={done ? 'text-muted-foreground line-through' : ''}>{GAP_TEXT[gap]()}</span>
                <span className="sr-only">{done ? tr('organizations.public_page.done', 'done') : tr('organizations.public_page.to_do', 'to do')}</span>
              </li>
            })}
          </ul>
          <div className="flex items-center justify-between gap-4 rounded-lg bg-muted px-4 py-3">
            <Label htmlFor="list-in-discover" className="font-medium">{tr('organizations.public_page.list_in_discover', 'List us in Discover')}</Label>
            <Switch id="list-in-discover" checked={Boolean(saved.explore)} disabled={busy || (!saved.explore && gaps.length > 0)} onCheckedChange={(listed) => void save({ listed })} />
          </div>
          {saved.explore && !saved.listed ? <p className="m-0 text-sm text-amber-700">{tr('organizations.public_page.not_on_shelf', 'Your page is public, but it won’t show on Discover’s shelf until the list above is done.')}</p> : null}
        </Section>

        <Section title={tr('organizations.public_page.about_you', 'About you')} hint={tr('organizations.public_page.about_hint', 'Your cover and logo live in Branding.')}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="page-tagline">{tr('organizations.public_page.tagline', 'Tagline')} <span className="text-xs font-normal text-muted-foreground">({PUBLIC_PAGE_LIMITS.tagline - draft.description.length} left)</span></Label>
            <Input id="page-tagline" value={draft.description} maxLength={PUBLIC_PAGE_LIMITS.tagline} placeholder={tr('organizations.public_page.tagline_placeholder', 'Paid summer crews building trails across the valley')} onChange={(event) => set({ description: event.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="page-story">{tr('organizations.public_page.story', 'Your story')} <span className="text-xs font-normal text-muted-foreground">({PUBLIC_PAGE_LIMITS.story - draft.about.length} left)</span></Label>
            <Textarea id="page-story" value={draft.about} maxLength={PUBLIC_PAGE_LIMITS.story} rows={7} placeholder={tr('organizations.public_page.story_placeholder', 'Who you are, who you work with, and what someone gets from joining.')} onChange={(event) => set({ about: event.target.value })} />
          </div>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 text-sm font-medium">{tr('organizations.public_page.highlights', 'Highlights')} <span className="text-xs font-normal text-muted-foreground">{tr('organizations.public_page.highlights_hint', 'up to three short facts, like “Free to join”')}</span></legend>
            {draft.highlights.map((item, index) => <Input key={index} value={item} maxLength={PUBLIC_PAGE_LIMITS.highlight} aria-label={tr('organizations.public_page.highlight_n', 'Highlight {{n}}', { n: index + 1 })} onChange={(event) => set({ highlights: draft.highlights.map((value, position) => position === index ? event.target.value : value) })} />)}
          </fieldset>
        </Section>

        <Section title={tr('organizations.public_page.find_us', 'Find us')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5"><Label htmlFor="page-city">{tr('organizations.public_page.city', 'City')}</Label><Input id="page-city" value={draft.city} maxLength={80} placeholder="Medford, OR" onChange={(event) => set({ city: event.target.value })} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="page-website">{tr('organizations.public_page.website', 'Website')}</Label><Input id="page-website" type="url" value={draft.website} placeholder="https://" onChange={(event) => set({ website: event.target.value })} /></div>
            {SOCIALS.map(({ key, label }) => <div key={key} className="flex flex-col gap-1.5"><Label htmlFor={`page-${key}`}>{label}</Label><Input id={`page-${key}`} type="url" value={draft.socials[key] || ''} placeholder="https://" onChange={(event) => set({ socials: { ...draft.socials, [key]: event.target.value } })} /></div>)}
          </div>
        </Section>

        <Section title={tr('organizations.public_page.plans', 'Plans on your page')} hint={tr('organizations.public_page.plans_hint', 'Every plan you offer open or by request shows, with its badge. Pin up to three to show first, or hide any.')}>
          {!feed ? <div className="h-20 animate-pulse rounded-lg bg-muted" /> : plans.length ? <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {plans.map((card) => <PlanRow key={card.template_uuid} card={card} pinned={draft.pinned_plans.includes(card.template_uuid)} hidden={draft.hidden_plans.includes(card.template_uuid)}
              canPin={draft.pinned_plans.length < PUBLIC_PAGE_LIMITS.pinned} onPin={() => togglePin(card.template_uuid)} onHide={() => toggleHide(card.template_uuid)} />)}
          </ul> : <p className="m-0 text-sm text-muted-foreground">{tr('organizations.public_page.no_plans', 'You don’t offer any plans yet. In Plans, open a plan’s Discover settings and offer it open or by request.')}</p>}
        </Section>

        <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-border bg-background/95 px-4 py-3 sm:mx-0 sm:rounded-xl sm:border sm:px-4">
          <Button type="submit" disabled={busy}>{busy ? tr('organizations.public_page.saving', 'Saving…') : tr('organizations.public_page.save', 'Save')}</Button>
        </div>
      </form>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start" aria-label={tr('organizations.public_page.preview', 'Preview')}>
        <p className="m-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">{tr('organizations.public_page.in_discover', 'In Discover')}</p>
        <div className="pointer-events-none"><OrganizationCard org={preview} orgslug={org.slug} width={220} /></div>
        <Link href={pageHref} target="_blank" className="inline-flex items-center gap-1.5 text-sm font-bold">{tr('organizations.public_page.open_page', 'Open your page')}<ArrowSquareOut size={16} aria-hidden="true" /></Link>
      </aside>
    </div>
  </div>
}
