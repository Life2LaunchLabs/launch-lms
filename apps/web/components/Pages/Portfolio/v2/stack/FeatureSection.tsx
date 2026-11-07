'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpRight, ChevronLeft, ChevronRight, Plus, Search, X } from 'lucide-react'

import { BadgeMedal } from '@components/Badges/BadgeMedal'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { Switch } from '@components/ui/switch'
import { getUriWithOrg } from '@services/config/config'
import { normalizeMediaUrl } from '@services/media/media'
import type { FeatureItem, FeatureKind } from '@services/portfolio/records'
import { SOCIAL_OPTIONS, shellSocials, socialHandle } from '../../PortfolioHeaderParts'
import { timelineDateLabel } from '../../Timeline'
import type { Shell } from '../../portfolioTypes'
import { KindCover } from '../covers'
import { PersonDot } from '../parts'
import { CredentialFace } from '../PortfolioTiles'
import { useSection } from './SectionStack'

import { tr } from '@/lib/tr'
// The featured section: one or more things the learner wants seen first (a project, an experience, a quote,
// a badge or credential, a link). With more than one it's a carousel: dots or a counter under it, arrows on
// hover, and a timer if the learner wants one. With none it isn't on the page.

type Slide = { key: string; kind: FeatureKind; title: string; sub: string; body?: string; image?: string; cover?: React.ReactNode; href?: string; external?: boolean; person?: string }

export const FEATURE_KINDS: Array<{ kind: FeatureKind; label: string }> = [
  { kind: 'project', get label() { return tr('portfolio.covers.project', 'Project') } }, { kind: 'experience', get label() { return tr('portfolio.covers.experience', 'Experience') } }, { kind: 'quote', get label() { return tr('portfolio.feature_section.quote', 'Quote') } },
  { kind: 'badge', get label() { return tr('portfolio.feature_section.badge', 'Badge') } }, { kind: 'credential', get label() { return tr('portfolio.covers.credential', 'Credential') } }, { kind: 'link', get label() { return tr('portfolio.feature_section.link', 'Link') } },
]

const external = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`)

/** Everything the learner could feature, by kind, as slides. */
export function featureChoices(shell: Shell, orgslug: string, owner: boolean, username?: string): Record<FeatureKind, Slide[]> {
  const page = (own: string, visitor: string) => getUriWithOrg(orgslug, owner ? own : `/user/${username}${visitor}`)
  return {
    project: (shell.projects || []).map((project) => ({ key: project.project_uuid, kind: 'project', title: project.title, sub: project.subtitle || project.summary || tr('lit.feature_section.project', 'Project'), image: project.cover_url ? normalizeMediaUrl(project.cover_url) : '', cover: <KindCover kind="project" url={project.cover_url ? normalizeMediaUrl(project.cover_url) : ''} />, href: page(`/portfolio/projects/${project.project_uuid}`, `/projects/${project.slug}`) })),
    experience: (shell.timeline || []).map((entry) => ({ key: entry.timeline_uuid, kind: 'experience', title: entry.title, sub: [entry.organization, timelineDateLabel(entry)].filter(Boolean).join(' · '), image: entry.cover_url ? normalizeMediaUrl(entry.cover_url) : '', cover: <KindCover kind="experience" type={entry.entry_type} url={entry.cover_url ? normalizeMediaUrl(entry.cover_url) : ''} />, href: page(`/portfolio/timeline/${entry.timeline_uuid}`, `/timeline/${entry.slug}`) })),
    quote: (shell.quotes || []).filter((quote) => quote.body && quote.status !== 'requested').map((quote) => ({ key: quote.quote_uuid, kind: 'quote', title: quote.name, sub: quote.role_label, body: quote.body, person: quote.name })),
    badge: (shell.badges?.earned || []).map((badge) => ({ key: badge.award_uuid, kind: 'badge', title: badge.name, sub: badge.issuer?.name || tr('lit.feature_section.badge', 'Badge'), cover: <BadgeMedal badge={{ image_url: normalizeMediaUrl(badge.image_url || '') || '', icon: badge.icon, color: badge.color }} size={120} /> })),
    credential: (shell.credentials || []).map((credential) => ({ key: credential.credential_uuid, kind: 'credential', title: credential.name, sub: credential.issuer || tr('lit.feature_section.credential', 'Credential'), cover: <span className="block w-[min(260px,70%)]"><CredentialFace credential={credential} /></span> })),
    link: shellSocials(shell).map((social) => ({ key: social.type, kind: 'link', title: socialHandle(social.type, social.url) || social.url, sub: SOCIAL_OPTIONS.find((option) => option.type === social.type)?.label || social.type, href: external(social.url), external: true })),
  }
}

export function resolveFeatures(items: FeatureItem[], choices: Record<FeatureKind, Slide[]>): Slide[] {
  return items.map((item) => choices[item.kind]?.find((slide) => slide.key === item.ref)).filter((slide): slide is Slide => Boolean(slide))
}

function SlideBody({ slide, kicker }: { slide: Slide; kicker: string }) {
  const kick = <span data-feature-kick className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--org-primary-color)]">{kicker}</span>
  if (slide.kind === 'quote') return <div data-feature-slide="quote" className="grid h-full content-center gap-4 bg-[var(--org-primary-color)] p-6 text-[var(--org-on-primary-color)] @lg:p-9">
    <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] opacity-75">{kicker}</span>
    <blockquote data-feature-title className="line-clamp-6 text-[clamp(19px,4.2cqw,32px)] font-extrabold leading-[1.2]">“{slide.body}”</blockquote>
    <span className="flex items-center gap-2.5"><PersonDot name={slide.person || slide.title} className="h-9 w-9 border-2 border-white/40 text-xs" /><span><b className="block text-sm font-extrabold">{slide.title}</b><small className="block text-xs font-semibold opacity-80">{slide.sub}</small></span></span>
  </div>
  if (slide.kind === 'link') return <div data-feature-slide="link" className="grid h-full content-center gap-3 p-6 @lg:p-9">
    {kick}
    <b data-feature-title className="break-words text-[clamp(26px,6cqw,48px)] font-extrabold leading-[1.05]">{slide.title}</b>
    <span className="text-sm font-semibold text-muted-foreground">{tr('portfolio.feature_section.find_me_on_sub', 'Find me on {{sub}}', { sub: slide.sub })}</span>
  </div>
  const media = slide.kind === 'badge' || slide.kind === 'credential'
  return <div data-feature-slide={slide.kind} className="grid h-full grid-rows-[minmax(140px,1fr)_auto] @xl:grid-cols-[1.25fr_1fr] @xl:grid-rows-1">
    <div data-feature-media className={`relative min-h-0 overflow-hidden ${media ? 'grid place-items-center bg-[color-mix(in_srgb,var(--org-primary-color)_14%,hsl(var(--card)))] p-6' : ''}`}>{slide.cover}</div>
    <div data-feature-text className="grid min-w-0 content-center gap-2 p-5 @lg:p-7">
      {kick}
      <b data-feature-title className="line-clamp-3 text-[clamp(20px,4cqw,30px)] font-extrabold leading-[1.1]">{slide.title}</b>
      {slide.sub ? <span className="line-clamp-3 text-sm font-semibold text-muted-foreground">{slide.sub}</span> : null}
      {slide.href ? <span className="inline-flex items-center gap-1 text-sm font-extrabold text-foreground">{slide.external ? tr('portfolio.feature_section.open', 'Open') : tr('portfolio.feature_section.see_it', 'See it')}<ArrowUpRight className="h-4 w-4" /></span> : null}
    </div>
  </div>
}

export function FeatureSection({ slides, autoplay }: { slides: Slide[]; autoplay: boolean }) {
  const ctx = useSection('feature')
  const [at, setAt] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = slides.length
  const index = count ? at % count : 0
  useEffect(() => {
    if (!autoplay || count < 2 || paused || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => setAt((value) => value + 1), 6000)
    return () => window.clearInterval(timer)
  }, [autoplay, count, paused])
  if (!count) return null
  const go = (step: number) => setAt((value) => (((value + step) % count) + count) % count)
  const title = ctx?.title || tr('lit.feature_section.featured', 'Featured')
  return <section aria-label={tr('portfolio.feature_section.featured', 'Featured')} aria-roledescription={count > 1 ? 'carousel' : undefined} data-feature className="@container flex min-w-0 flex-col" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
    <div data-feature-frame className={`group/feat relative min-h-[240px] overflow-hidden rounded-3xl border-2 border-border bg-card shadow-[0_4px_0_hsl(var(--border))] ${ctx?.fixed ? 'min-h-0 flex-1' : ''}`}>
      <div className="flex h-full transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none" style={{ transform: `translateX(-${index * 100}%)` }}>
        {slides.map((slide, n) => {
          const body = <SlideBody slide={slide} kicker={title} />
          const hidden = n !== index
          return <div key={`${slide.kind}-${slide.key}`} className="h-full w-full shrink-0" aria-hidden={hidden || undefined} role={count > 1 ? 'group' : undefined} aria-roledescription={count > 1 ? 'slide' : undefined} aria-label={count > 1 ? `${n + 1} of ${count}` : undefined}>
            {slide.href ? slide.external
              ? <a href={slide.href} target="_blank" rel="noreferrer" tabIndex={hidden ? -1 : undefined} className="block h-full">{body}</a>
              : <Link href={slide.href} tabIndex={hidden ? -1 : undefined} className="block h-full">{body}</Link> : body}
          </div>
        })}
      </div>
      {count > 1 ? <>
        <button type="button" data-edit-control onClick={() => go(-1)} aria-label={tr('portfolio.feature_section.previous', 'Previous')} className="absolute left-3 top-1/2 z-[2] grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur transition group-hover/feat:opacity-100 focus-visible:opacity-100"><ChevronLeft className="h-5 w-5" /></button>
        <button type="button" data-edit-control onClick={() => go(1)} aria-label={tr('portfolio.feature_section.next', 'Next')} className="absolute right-3 top-1/2 z-[2] grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur transition group-hover/feat:opacity-100 focus-visible:opacity-100"><ChevronRight className="h-5 w-5" /></button>
      </> : null}
    </div>
    {count > 1 ? <div className="mt-2.5 flex items-center justify-center gap-1.5" data-feature-nav>
      <span data-feature-dots className="flex items-center gap-1.5">{slides.map((slide, n) => <button key={n} type="button" data-edit-control onClick={() => setAt(n)} aria-label={tr('portfolio.feature_section.show_value_of_count', 'Show {{value}} of {{count}}', { value: n + 1, count })} aria-current={n === index || undefined}
        className={`h-2 rounded-full transition-all duration-300 ${n === index ? 'w-6 bg-[var(--org-primary-color)]' : 'w-2 bg-border hover:bg-muted-foreground'}`} />)}</span>
      <span data-feature-count className="hidden font-mono text-xs tabular-nums text-muted-foreground">{String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}</span>
    </div> : null}
  </section>
}

/** Pick what's featured: add by kind and search, reorder, take out, and the timer. Every change saves. */
export function FeatureDialog({ open, onOpenChange, items, autoplay, choices, onChange, onAutoplay }: {
  open: boolean; onOpenChange: (open: boolean) => void; items: FeatureItem[]; autoplay: boolean; choices: Record<FeatureKind, Slide[]> // eslint-disable-line no-unused-vars
  onChange: (items: FeatureItem[]) => void; onAutoplay: (on: boolean) => void // eslint-disable-line no-unused-vars
}) {
  const [kind, setKind] = useState<FeatureKind>('project')
  const [query, setQuery] = useState('')
  const current = resolveFeatures(items, choices)
  const results = useMemo(() => {
    const words = query.trim().toLowerCase()
    return (choices[kind] || []).filter((slide) => !items.some((item) => item.kind === kind && item.ref === slide.key)).filter((slide) => !words || `${slide.title} ${slide.sub} ${slide.body || ''}`.toLowerCase().includes(words))
  }, [choices, kind, query, items])
  const move = (from: number, to: number) => { const next = [...items]; const [one] = next.splice(from, 1); next.splice(to, 0, one); onChange(next) }
  const label = FEATURE_KINDS.find((one) => one.kind === kind)?.label.toLowerCase() || ''
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90dvh] max-w-lg gap-5 overflow-y-auto">
      <DialogHeader><DialogTitle>{tr('portfolio.feature_section.featured', 'Featured')}</DialogTitle><DialogDescription>{tr('portfolio.feature_section.what_people_see_first_with', 'What people see first. With more than one, they take turns in a carousel. Take them all out and the section goes away.')}</DialogDescription></DialogHeader>
      {current.length ? <ol className="grid gap-1.5" aria-label={tr('portfolio.feature_section.featured_now', 'Featured now')}>{current.map((slide, n) => <li key={`${slide.kind}-${slide.key}`} className="flex min-w-0 items-center gap-2 rounded-xl bg-muted px-2.5 py-2">
        <span className="w-5 text-center text-xs font-extrabold tabular-nums text-muted-foreground">{n + 1}</span>
        <span className="min-w-0 flex-1"><b className="block truncate text-sm font-extrabold">{slide.kind === 'quote' ? `“${slide.body}”` : slide.title}</b><small className="block truncate text-xs font-semibold text-muted-foreground">{FEATURE_KINDS.find((one) => one.kind === slide.kind)?.label} · {slide.sub}</small></span>
        <button type="button" onClick={() => move(n, n - 1)} disabled={n === 0} aria-label={tr('portfolio.feature_section.move_up', 'Move up')} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-raised hover:text-foreground disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
        <button type="button" onClick={() => move(n, n + 1)} disabled={n === current.length - 1} aria-label={tr('portfolio.feature_section.move_down', 'Move down')} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-raised hover:text-foreground disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
        <button type="button" onClick={() => onChange(items.filter((item) => !(item.kind === slide.kind && item.ref === slide.key)))} aria-label={tr('portfolio.feature_section.take_out_title', 'Take out {{title}}', { title: slide.title })} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-raised hover:text-foreground"><X className="h-4 w-4" /></button>
      </li>)}</ol> : null}
      <div className="grid gap-2.5">
        <h3 className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{tr('portfolio.portfolio_header_parts.add', 'Add')}</h3>
        <div role="group" aria-label={tr('portfolio.feature_section.what_to_feature', 'What to feature')} className="flex flex-wrap gap-1.5">{FEATURE_KINDS.map((one) => <button key={one.kind} type="button" aria-pressed={kind === one.kind} onClick={() => { setKind(one.kind); setQuery('') }} className={`rounded-full px-3 py-1.5 text-[13px] font-bold transition ${kind === one.kind ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{one.label}</button>)}</div>
        <label className="flex items-center gap-2 rounded-xl border-2 border-border px-3 focus-within:border-[var(--org-primary-color)]"><Search className="h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr('portfolio.feature_section.search_your_value', 'Search your {{value}}', { value: label === 'quote' ? 'quotes' : `${label}s` })} aria-label={tr('portfolio.feature_section.search', 'Search')} className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
        <ul className="grid max-h-60 gap-1 overflow-y-auto" aria-label={tr('portfolio.feature_section.results', 'Results')}>
          {results.map((slide) => <li key={slide.key}><button type="button" onClick={() => onChange([...items, { kind, ref: slide.key }])} className="flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-muted">
            <Plus className="h-4 w-4 shrink-0 text-[var(--org-primary-color)]" />
            <span className="min-w-0"><b className="block truncate text-sm font-extrabold">{slide.kind === 'quote' ? `“${slide.body}”` : slide.title}</b><small className="block truncate text-xs font-semibold text-muted-foreground">{slide.sub}</small></span>
          </button></li>)}
          {!results.length ? <li className="px-2.5 py-3 text-sm font-semibold text-muted-foreground">{(choices[kind] || []).length ? tr('portfolio.feature_section.nothing_else_matches', 'Nothing else matches.') : tr('portfolio.feature_section.you_don_t_have_any', 'You don’t have any {{value}} yet.', { value: label === 'quote' ? 'quotes' : `${label}s` })}</li> : null}
        </ul>
      </div>
      <label className="flex items-center justify-between gap-3 border-t border-border pt-4"><span><b className="block text-sm">{tr('portfolio.feature_section.take_turns_on_a_timer', 'Take turns on a timer')}</b><small className="block text-xs font-semibold text-muted-foreground">{tr('portfolio.feature_section.every_6_seconds_when_there', 'Every 6 seconds, when there’s more than one')}</small></span><Switch checked={autoplay} onCheckedChange={onAutoplay} aria-label={tr('portfolio.feature_section.take_turns_on_a_timer', 'Take turns on a timer')} /></label>
    </DialogContent>
  </Dialog>
}
