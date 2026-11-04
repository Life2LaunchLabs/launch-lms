'use client'

import type { ReactNode } from 'react'
import { BriefcaseBusiness, Globe, Instagram, Linkedin, MapPin, Pencil, Sparkles, X as XLogo, Youtube } from 'lucide-react'
import type { LookId } from '@services/portfolio/records'
import { SPOT_RING, SpotTip, initials } from './parts'

// The portfolio's header, which each look builds its own way: Playful's banner with the photo over its edge,
// Professional's profile column, Gallery's masthead with the name set huge, Volt's profile row with stats
// and no cover, and Arcade's angled splash. The pieces are the same; only how they're put together changes.

export type HeaderProps = {
  look: LookId
  name: string
  /** False until the learner has given a name: the owner then sees "Add your name". */
  hasName: boolean
  avatarUrl: string
  headline?: string
  /** What they're doing now ("Barista at Bean There") and where they are. */
  now: string
  place: string
  socials: Array<{ type: string; url: string }>
  /** Counts Volt shows beside the name, like its concept: projects, badges, experience. */
  stats: Array<[number, string]>
  banner: { image: string; css?: string; fallback: string }
  /** The mastery badge and the owner's public/private chip. */
  marks: ReactNode
  actions: ReactNode
  /** The owner's Look, Edit page and Settings, drawn for a banner (light on a picture) or for the page. */
  corner?: (onBanner: boolean) => ReactNode // eslint-disable-line no-unused-vars
  spots: Partial<Record<string, string>>
  editing: boolean
  centered: boolean
  onProfile: () => void
}

const SOCIAL_ICONS: Record<string, typeof Globe> = { website: Globe, instagram: Instagram, linkedin: Linkedin, youtube: Youtube, x: XLogo }
const hrefOf = (url: string) => /^https?:\/\//i.test(url) ? url : `https://${url}`

function Socials({ socials, className = '' }: { socials: HeaderProps['socials']; className?: string }) {
  const shown = socials.filter((social) => SOCIAL_ICONS[social.type]).slice(0, 5)
  if (!shown.length) return null
  return <div className={`flex flex-wrap gap-1.5 ${className}`} data-pf-socials>{shown.map((social) => {
    const Icon = SOCIAL_ICONS[social.type]
    return <a key={social.type} href={hrefOf(social.url)} target="_blank" rel="noreferrer" aria-label={social.type} className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground transition hover:border-foreground hover:text-foreground"><Icon className="h-3.5 w-3.5" /></a>
  })}</div>
}

/** The photo, and for the owner the button that edits who they are. Each look gives it its own size and shape. */
function Photo({ p, className }: { p: HeaderProps; className: string }) {
  const face = <span data-pf-avatar className={`grid shrink-0 place-items-center overflow-hidden bg-[linear-gradient(140deg,#FFC56B,#EC4F9A_60%,#8B5CF6)] font-extrabold text-white ${className}`}>
    {p.avatarUrl ? <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(p.name)}
  </span>
  if (!p.editing) return face
  return <button type="button" onClick={p.onProfile} aria-label="Edit your profile" className={`group/photo relative inline-block shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-foreground ${p.spots.avatar ? `border-2 ${SPOT_RING}` : ''}`}>
    {face}
    <span className="absolute bottom-1 right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-background bg-foreground text-background opacity-0 transition group-hover/photo:opacity-100 group-focus-visible/photo:opacity-100"><Pencil className="h-3.5 w-3.5" /></span>
  </button>
}

function Name({ p, className, children }: { p: HeaderProps; className: string; children?: ReactNode }) {
  return <h1 data-pf-name className={className}>{p.editing && !p.hasName ? <button type="button" onClick={p.onProfile} className="italic text-muted-foreground hover:text-foreground">Add your name</button> : children || p.name}</h1>
}

function Intro({ p, className = '' }: { p: HeaderProps; className?: string }) {
  if (p.headline) return <p data-pf-intro className={`line-clamp-2 max-w-[60ch] ${className}`}>{p.headline}</p>
  return p.editing ? <button type="button" onClick={p.onProfile} className={`text-left italic text-muted-foreground hover:text-foreground ${className}`}>Add a one-line intro (optional)</button> : null
}

const NameSpot = ({ p, className = 'relative order-last' }: { p: HeaderProps; className?: string }) => p.spots.name ? <SpotTip label={p.spots.name} className={className} /> : null
const AvatarSpot = ({ p, className }: { p: HeaderProps; className: string }) => p.spots.avatar ? <SpotTip label={p.spots.avatar} className={className} /> : null

/** The banner across the top, in the learner's banner (a pattern, the look's colors or their own photo). */
function Banner({ p, className, children }: { p: HeaderProps; className: string; children?: ReactNode }) {
  const { image, css, fallback } = p.banner
  return <div data-pf-banner className={`relative overflow-hidden ${image || css ? '' : fallback} ${className}`} style={css && !image ? { background: css } : undefined}>
    {image ? <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 bg-[url('/texture_overlay.png')] bg-cover opacity-25 mix-blend-overlay" aria-hidden="true" />}
    {children}
  </div>
}

const Corner = ({ p, onBanner, className = 'absolute right-3 top-3 z-[2]' }: { p: HeaderProps; onBanner: boolean; className?: string }) => p.corner ? <div className={`flex items-center gap-1.5 ${className}`}>{p.corner(onBanner)}</div> : null

function PlayfulHeader({ p }: { p: HeaderProps }) {
  const meta = [p.now, p.place].filter(Boolean).join(' · ')
  return <header data-pf-header="banner" className="relative">
    <Banner p={p} className="h-[110px] rounded-3xl sm:h-[150px]"><Corner p={p} onBanner /></Banner>
    {p.spots.settings ? <SpotTip label={p.spots.settings} className="absolute right-3 top-[52px]" /> : null}
    <div className={`relative -mt-[46px] px-1 sm:-mt-14 sm:px-[22px] ${p.centered ? 'text-center' : ''}`}>
      <AvatarSpot p={p} className="absolute left-[118px] top-[50px] sm:left-[150px] sm:top-[62px]" />
      <Photo p={p} className="h-[92px] w-[92px] rounded-full border-[5px] border-background text-[32px]" />
      <div className="min-w-0 pt-2.5">
        <div className={`relative flex flex-wrap items-center gap-x-3 gap-y-1 ${p.centered ? 'justify-center' : ''}`}>
          <NameSpot p={p} />
          <Name p={p} className="break-words text-[clamp(26px,3vw,34px)] font-extrabold leading-[1.1] tracking-[-0.02em]" />
          {p.marks}
        </div>
        <Intro p={p} className={`mt-1 text-base ${p.centered ? 'mx-auto' : ''}`} />
        {meta ? <p className="mt-1 truncate text-[13.5px] font-semibold text-muted-foreground">{meta}</p> : null}
        <div className={`mt-3.5 flex flex-wrap gap-2 ${p.centered ? 'justify-center' : ''}`}>{p.actions}</div>
      </div>
    </div>
  </header>
}

/** Professional: a profile column beside the stack, like LinkedIn or Read.cv. */
function ProfessionalHeader({ p }: { p: HeaderProps }) {
  return <header data-pf-header="side" className="relative overflow-hidden rounded-lg border border-border bg-card">
    <Banner p={p} className="h-[84px]" />
    <div className="relative grid gap-3 px-5 pb-5">
      <AvatarSpot p={p} className="absolute left-[112px] top-0" />
      <div className="-mt-11"><Photo p={p} className="h-[88px] w-[88px] rounded-full border-4 border-card text-[28px]" /></div>
      <div className="grid gap-1">
        <div className="relative flex flex-wrap items-center gap-2"><NameSpot p={p} /><Name p={p} className="text-[22px] font-semibold leading-tight tracking-[-0.01em]" /></div>
        <Intro p={p} className="text-[14.5px] leading-snug" />
      </div>
      {p.now || p.place ? <ul className="grid gap-1 text-[13px] text-muted-foreground">
        {p.now ? <li className="flex items-start gap-2"><BriefcaseBusiness className="mt-0.5 h-3.5 w-3.5 shrink-0" />{p.now}</li> : null}
        {p.place ? <li className="flex items-start gap-2"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{p.place}</li> : null}
      </ul> : null}
      <div className="flex flex-wrap items-center gap-1.5">{p.marks}</div>
      <div className="flex flex-wrap gap-2 md:grid md:[&>*]:w-full md:[&>*]:flex-none" data-pf-actions>{p.actions}</div>
      <Socials socials={p.socials} />
    </div>
  </header>
}

/** Gallery: a masthead. The name set huge in the serif, the last word in the accent; mono captions under a rule. */
function GalleryHeader({ p }: { p: HeaderProps }) {
  const words = p.name.trim().split(/\s+/)
  const last = words.length > 1 ? words.pop() : ''
  return <header data-pf-header="masthead" className="relative pt-1">
    <div className="flex min-h-[38px] flex-wrap items-center justify-between gap-3 border-b border-[var(--look-line)] pb-2 font-mono text-[11px] uppercase tracking-[0.14em]">
      <span className="truncate">Portfolio{p.place ? ` — ${p.place}` : ''}</span>
      <Corner p={p} onBanner={false} className="relative" />
    </div>
    {p.spots.settings ? <SpotTip label={p.spots.settings} className="absolute right-0 top-[44px]" /> : null}
    <div className="relative mt-8 flex flex-wrap items-end gap-x-4">
      <NameSpot p={p} className="absolute right-0 top-0" />
      <Name p={p} className="min-w-0 break-words font-['Instrument_Serif',Georgia,serif] text-[clamp(60px,12vw,150px)] font-normal leading-[0.86] tracking-[-0.04em]">{last ? <>{words.join(' ')}<br /><em className="text-[var(--org-primary-color)]">{last}</em></> : <>{p.name}<span className="text-[var(--org-primary-color)]">.</span></>}</Name>
    </div>
    <div className="relative mt-10 grid items-start gap-6 border-t border-[var(--look-line)] pt-4 font-mono text-[13px] leading-relaxed sm:grid-cols-[64px_minmax(0,1.3fr)_minmax(0,1fr)]">
      <AvatarSpot p={p} className="absolute left-[70px] top-2" />
      <Photo p={p} className="h-16 w-16 rounded-none text-[20px]" />
      <div className="grid gap-2"><Intro p={p} className="font-['Instrument_Serif',Georgia,serif] text-[24px] leading-[1.15] tracking-[-0.01em]" /><div className="flex flex-wrap items-center gap-2">{p.marks}</div></div>
      <dl className="grid gap-1 text-muted-foreground">
        {p.now ? <div><dt className="sr-only">Now</dt><dd>{p.now}</dd></div> : null}
        {p.place ? <div><dt className="sr-only">Based in</dt><dd>{p.place}</dd></div> : null}
        {p.socials.length ? <div><dt className="sr-only">Links</dt><dd className="flex flex-wrap gap-x-3">{p.socials.map((social) => <a key={social.type} href={hrefOf(social.url)} target="_blank" rel="noreferrer" className="underline decoration-1 underline-offset-4 hover:text-foreground">{social.type}</a>)}</dd></div> : null}
      </dl>
    </div>
    <div className="mt-6 flex flex-wrap gap-2">{p.actions}</div>
  </header>
}

/** Volt: the concept board's profile row. No cover: the photo in an accent ring, the name, your links, and counts on the right. */
function VoltHeader({ p }: { p: HeaderProps }) {
  return <header data-pf-header="profile" className="relative">
    <Corner p={p} onBanner={false} className="mb-3 justify-end" />
    {p.spots.settings ? <SpotTip label={p.spots.settings} className="absolute right-0 top-[40px]" /> : null}
    <div className="relative flex flex-wrap items-center gap-x-7 gap-y-5">
      <AvatarSpot p={p} className="absolute left-[112px] top-0" />
      <div className="relative shrink-0 p-[6px]">
        <Photo p={p} className="h-[104px] w-[104px] rounded-full text-[34px] sm:h-[120px] sm:w-[120px]" />
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full border-2 border-[var(--org-primary-color)]" />
        <Sparkles aria-hidden="true" className="pointer-events-none absolute -right-2 top-0 h-5 w-5 text-[var(--org-primary-color)]" />
        <Sparkles aria-hidden="true" className="pointer-events-none absolute -left-3 bottom-3 h-3.5 w-3.5 text-[var(--org-primary-color)]" />
      </div>
      <div className="grid min-w-[220px] flex-1 gap-1.5">
        <div className="relative flex flex-wrap items-center gap-2"><NameSpot p={p} /><Name p={p} className="text-[clamp(28px,3.4vw,40px)] font-extrabold leading-[1.05] tracking-[-0.035em]" />{p.marks}</div>
        <Intro p={p} className="text-[15px] text-muted-foreground" />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-semibold text-muted-foreground">
          {p.place ? <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{p.place}</span> : null}
          {p.now ? <span className="inline-flex items-center gap-1"><BriefcaseBusiness className="h-3.5 w-3.5" />{p.now}</span> : null}
        </div>
        <Socials socials={p.socials} className="mt-1" />
      </div>
      {p.stats.length ? <dl className="flex gap-7 max-sm:w-full max-sm:justify-between" data-pf-stats>{p.stats.map(([value, label]) => <div key={label} className="grid justify-items-center">
        <dt className="order-2 text-xs font-semibold text-muted-foreground">{label}</dt><dd className="text-[28px] font-extrabold tabular-nums tracking-[-0.03em]">{value}</dd>
      </div>)}</dl> : null}
    </div>
    <div className="mt-5 flex flex-wrap gap-2">{p.actions}</div>
  </header>
}

/** Arcade: a game HUD. An angled splash, the photo in a cut-corner frame, readouts for what you're doing and where. */
function ArcadeHeader({ p }: { p: HeaderProps }) {
  return <header data-pf-header="splash" className="relative">
    <Banner p={p} className="h-[150px] [clip-path:polygon(0_0,100%_0,100%_calc(100%-34px),calc(100%-34px)_100%,0_100%)] sm:h-[200px]">
      <span aria-hidden="true" className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(0,0,0,.16)_0_1px,transparent_1px_4px)]" />
      <span aria-hidden="true" className="absolute bottom-3 left-4 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80">{'// Portfolio'}</span>
      <Corner p={p} onBanner />
    </Banner>
    {p.spots.settings ? <SpotTip label={p.spots.settings} className="absolute right-3 top-[52px]" /> : null}
    <div className="relative -mt-10 flex flex-wrap items-end gap-x-5 gap-y-3 px-1 sm:-mt-12 sm:px-5">
      <AvatarSpot p={p} className="absolute left-[132px] top-[60px]" />
      <div data-arcade-frame className="shrink-0 bg-[var(--org-primary-color)] p-[2px] [clip-path:polygon(0_0,calc(100%-18px)_0,100%_18px,100%_100%,18px_100%,0_calc(100%-18px))]">
        <Photo p={p} className="h-[96px] w-[96px] text-[34px] [clip-path:polygon(0_0,calc(100%-17px)_0,100%_17px,100%_100%,17px_100%,0_calc(100%-17px))] sm:h-[112px] sm:w-[112px]" />
      </div>
      <div className="grid min-w-0 flex-1 gap-1 pb-1">
        <div className="relative flex flex-wrap items-center gap-2"><NameSpot p={p} /><Name p={p} className="break-words font-['Chakra_Petch',system-ui,sans-serif] text-[clamp(26px,3.6vw,38px)] font-bold uppercase leading-none tracking-[0.03em]" />{p.marks}</div>
        <Intro p={p} className="text-[15px]" />
      </div>
    </div>
    {p.now || p.place ? <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 px-1 sm:px-5" data-arcade-readout>
      {p.now ? <div><dt>Now</dt><dd>{p.now}</dd></div> : null}
      {p.place ? <div><dt>Location</dt><dd>{p.place}</dd></div> : null}
    </dl> : null}
    <div className="mt-4 flex flex-wrap items-center gap-2 px-1 sm:px-5">{p.actions}<Socials socials={p.socials} className="ml-auto max-sm:ml-0" /></div>
    <div aria-hidden="true" data-arcade-rule className="mt-5" />
  </header>
}

export function PortfolioHeader(props: HeaderProps) {
  switch (props.look) {
    case 'professional': return <ProfessionalHeader p={props} />
    case 'gallery': return <GalleryHeader p={props} />
    case 'volt': return <VoltHeader p={props} />
    case 'arcade': return <ArcadeHeader p={props} />
    default: return <PlayfulHeader p={props} />
  }
}

/** The owner's Look, Edit page and Settings buttons: light glass on a banner, plain pills on the page. */
export const cornerClass = (onBanner: boolean) => onBanner
  ? 'inline-flex h-[34px] items-center gap-1.5 rounded-full bg-black/50 px-3 text-[12.5px] font-bold text-white backdrop-blur transition hover:bg-black/60'
  : 'inline-flex h-[34px] items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[12.5px] font-bold text-foreground transition hover:bg-raised'
