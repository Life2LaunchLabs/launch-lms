'use client'

import { useState } from 'react'
import { Check, ChevronLeft, ChevronRight, ImagePlus, LayoutGrid, Monitor, Moon, Pipette, Sun } from 'lucide-react'
import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { ACCENTS, BANNERS, LOOKS, MODES, type LookMode } from '@components/Looks/looks'
import { normalizeMediaUrl } from '@services/media/media'
import type { LayoutChange } from '@services/portfolio/records'
import type { OpenChange } from './parts'
import type { PortfolioLayout } from '../portfolioTypes'

// eslint-disable-next-line no-unused-vars
type Change = (next: LayoutChange) => void

/** A tiny version of each look's own header and first sections, in its type and colors. */
function Mini({ look, dark }: { look: (typeof LOOKS)[number]; dark: boolean }) {
  const [background, a, b, c] = dark ? look.night : look.colors
  const ink = dark ? '#f4f4f5' : '#111111'
  const line = dark ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.12)'
  const font = { fontFamily: look.font }
  const cut = (n: number) => `polygon(0 0, calc(100% - ${n}px) 0, 100% ${n}px, 100% 100%, ${n}px 100%, 0 calc(100% - ${n}px))`
  const box = 'absolute block'
  return <div className="relative h-[150px] min-w-0 flex-1 overflow-hidden rounded-2xl border border-black/10" style={{ background }} aria-hidden="true">
    {look.id === 'playful' ? <>
      <i className={`${box} inset-x-3 top-3 h-[44px] rounded-[14px]`} style={{ background: `linear-gradient(120deg, ${a}, ${b})` }} />
      <i className={`${box} left-5 top-[38px] h-9 w-9 rounded-full border-[3px]`} style={{ background: c, borderColor: background }} />
      <b className={`${box} left-5 top-[80px] text-[20px] font-extrabold`} style={{ color: ink }}>Maya Torres</b>
      <i className={`${box} bottom-3 left-3 h-[26px] w-[44%] rounded-[12px]`} style={{ background: dark ? '#16212b' : '#fff', boxShadow: `0 3px 0 ${line}` }} />
      <i className={`${box} bottom-3 right-3 h-[26px] w-[calc(56%-30px)] rounded-[12px]`} style={{ background: c, boxShadow: `0 3px 0 ${line}` }} />
    </> : look.id === 'professional' ? <>
      <span className={`${box} bottom-3 left-3 top-3 w-[34%] overflow-hidden rounded-[6px] border`} style={{ background: c, borderColor: line }}>
        <i className="block h-6" style={{ background: a }} />
        <i className="ml-2 -mt-3 block h-7 w-7 rounded-full border-2" style={{ background: b, borderColor: c }} />
        <b className="mx-2 mt-1 block text-[12px] font-semibold" style={{ ...font, color: ink }}>Maya Torres</b>
        <i className="mx-2 mt-1 block h-1.5 w-3/4 rounded" style={{ background: line }} /><i className="mx-2 mt-1 block h-4 rounded-[4px]" style={{ background: a }} />
      </span>
      {[12, 58, 104].map((top) => <i key={top} className={`${box} left-[calc(34%+20px)] right-3 h-[38px] rounded-[6px] border`} style={{ top, background: c, borderColor: line }} />)}
    </> : look.id === 'gallery' ? <>
      <i className={`${box} inset-x-3 top-4 h-px`} style={{ background: ink }} />
      <b className={`${box} left-3 top-[22px] text-[40px] font-normal leading-[0.85] tracking-[-0.03em]`} style={{ ...font, color: ink }}>Maya<br /><em style={{ color: a }}>Torres</em></b>
      <i className={`${box} bottom-3 left-3 h-[30px] w-[30%]`} style={{ background: c }} /><i className={`${box} bottom-3 right-3 h-[30px] w-[calc(70%-36px)] border-t`} style={{ borderColor: ink }} />
    </> : look.id === 'volt' ? <>
      <i className={`${box} left-4 top-5 h-12 w-12 rounded-full`} style={{ background: line, boxShadow: `0 0 0 2px ${background}, 0 0 0 4px ${a}` }} />
      <b className={`${box} left-[84px] top-[24px] text-[19px] font-extrabold tracking-[-0.03em]`} style={{ ...font, color: ink }}>Maya Torres</b>
      <i className={`${box} left-[84px] top-[52px] h-1.5 w-20 rounded`} style={{ background: line }} />
      {[0, 1, 2].map((n) => <b key={n} className={`${box} top-[24px] text-[15px] font-extrabold`} style={{ ...font, color: ink, right: 14 + n * 30 }}>{[12, 8, 23][n]}</b>)}
      {[0, 1, 2].map((n) => <i key={n} className={`${box} bottom-3 h-[52px] w-[calc(33%-14px)] rounded-[10px]`} style={{ left: `calc(${n * 33}% + ${12 - n * 2}px)`, background: n === 0 ? a : line }} />)}
    </> : <>
      <i className={`${box} inset-x-0 top-0 h-[56px]`} style={{ background: `linear-gradient(120deg, ${b}, ${a})`, clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%)' }} />
      <i className={`${box} left-4 top-[34px] h-11 w-11`} style={{ background: a, clipPath: cut(9) }} />
      <b className={`${box} left-[70px] top-[60px] text-[17px] font-bold uppercase tracking-[0.04em]`} style={{ ...font, color: ink }}>Maya Torres</b>
      <i className={`${box} left-[70px] top-[84px] h-1 w-14`} style={{ background: b === '#12d6e0' ? b : '#12d6e0' }} />
      <i className={`${box} bottom-3 left-3 h-[30px] w-[44%] border`} style={{ borderColor: line, clipPath: cut(8) }} /><i className={`${box} bottom-3 right-3 h-[30px] w-[calc(56%-30px)]`} style={{ background: a, clipPath: cut(8) }} />
    </>}
  </div>
}

/** The look being worn, as one card: a little page in its type and colors. Arrows try on the next one. */
function LookCard({ look, dark, onStep, index, count }: { look: (typeof LOOKS)[number]; dark: boolean; onStep: (step: number) => void; index: number; count: number }) { // eslint-disable-line no-unused-vars
  const arrow = 'grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-border bg-card text-foreground transition hover:bg-raised'
  return <div className="grid gap-3">
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => onStep(-1)} aria-label="Previous look" className={arrow}><ChevronLeft className="h-5 w-5" /></button>
      <Mini look={look} dark={dark} />
      <button type="button" onClick={() => onStep(1)} aria-label="Next look" className={arrow}><ChevronRight className="h-5 w-5" /></button>
    </div>
    <div className="grid justify-items-center gap-1 text-center">
      <b className="text-base font-extrabold">{look.name}</b>
      <small className="max-w-[44ch] text-[13px] font-semibold leading-snug text-muted-foreground">{look.blurb}</small>
      <span className="mt-1 flex gap-1.5" aria-label={`Look ${index + 1} of ${count}`}>{LOOKS.map((one, n) => <i key={one.id} className={`h-1.5 rounded-full transition-all ${n === index ? 'w-5 bg-foreground' : 'w-1.5 bg-border'}`} />)}</span>
    </div>
  </div>
}

function Segments<T extends string>({ value, options, onPick, label }: { value: T; options: Array<[T, string, React.ReactNode?]>; onPick: (next: T) => void; label: string }) { // eslint-disable-line no-unused-vars
  return <div role="group" aria-label={label} className="inline-flex rounded-full bg-muted p-1">
    {options.map(([option, text, icon]) => <button key={option} type="button" aria-pressed={value === option} onClick={() => onPick(option)} className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-bold transition ${value === option ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{icon}{text}</button>)}
  </div>
}

/** Looks whose header has no banner. */
const NO_BANNER = ['gallery', 'volt']
const Heading = ({ children }: { children: React.ReactNode }) => <h3 className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{children}</h3>
const MODE_ICONS: Record<LookMode, React.ReactNode> = { light: <Sun className="h-3.5 w-3.5" />, dark: <Moon className="h-3.5 w-3.5" />, system: <Monitor className="h-3.5 w-3.5" /> }

/** The learner's look (their theme for the whole app): the look, light or dark, an accent, and the banner. */
export function LookDialog({ open, onOpenChange, layout, mode, dark, onChange, onSuggested, spot, userId, token }: { open: boolean; onOpenChange: OpenChange; layout: PortfolioLayout; mode: LookMode; dark: boolean; onChange: Change; onSuggested?: () => void; spot?: string; userId: number; token?: string }) {
  const [picking, setPicking] = useState(false)
  const accent = layout.accent || ''
  const banner = layout.banner || 'look'
  const custom = accent && !ACCENTS.includes(accent)
  const index = Math.max(0, LOOKS.findIndex((look) => look.id === layout.look))
  const ring = (on: boolean) => on ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : ''
  // Stepping puts the next look on right away, so you can try them on.
  const step = (by: number) => onChange({ look: LOOKS[(((index + by) % LOOKS.length) + LOOKS.length) % LOOKS.length].id })
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90dvh] max-w-xl gap-6 overflow-y-auto">
      <DialogHeader><DialogTitle>Your look</DialogTitle><DialogDescription>Your theme for all of Launchpad. Visitors see your portfolio in it too. Nothing moves when you change it.</DialogDescription></DialogHeader>
      <section aria-label="Look" className={`rounded-2xl ${spot ? 'p-1 ring-4 ring-[#2F66D6]/25' : ''}`}>
        <LookCard look={LOOKS[index]} dark={dark} index={index} count={LOOKS.length} onStep={step} />
        {!layout.look ? <p className="mt-2 text-center text-xs font-bold text-muted-foreground">You haven’t picked one yet. <button type="button" className="underline" onClick={() => onChange({ look: LOOKS[index].id })}>Wear {LOOKS[index].name}</button></p> : null}
      </section>
      {/* Changes to the page save as they're made; this puts back the look's own arrangement. */}
      {onSuggested ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3">
        <small className="min-w-[180px] flex-1 text-[13px] font-semibold text-muted-foreground">You’ve arranged your page yourself. Want {LOOKS[index].name}’s own layout instead?</small>
        <button type="button" onClick={onSuggested} className="inline-flex h-9 items-center gap-1.5 rounded-full border-2 border-border bg-card px-3.5 text-[13px] font-bold hover:bg-raised"><LayoutGrid className="h-4 w-4" />Use {LOOKS[index].name}’s layout</button>
      </div> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Heading>Mode</Heading>
        <Segments label="Light or dark" value={mode} options={MODES.map((item) => [item.id, item.label, MODE_ICONS[item.id]])} onPick={(next) => onChange({ mode: next })} />
      </div>
      <section aria-label="Accent color" className="grid gap-2.5">
        <Heading>Accent color</Heading>
        <div className="flex flex-wrap items-center gap-2.5">
          <button type="button" aria-pressed={!accent} onClick={() => onChange({ accent: '' })} className={`h-9 rounded-full border-2 border-border px-3 text-xs font-bold ${!accent ? 'border-foreground' : 'text-muted-foreground'}`}>Look’s own</button>
          {ACCENTS.map((color) => <button key={color} type="button" aria-label={`Accent ${color}`} aria-pressed={accent === color} onClick={() => onChange({ accent: color })} className={`grid h-9 w-9 place-items-center rounded-full ${ring(accent === color)}`} style={{ background: color }}>{accent === color ? <Check className="h-4 w-4" style={{ color: ['#f5a524', '#b8e62e'].includes(color) ? '#111' : '#fff' }} /> : null}</button>)}
          <label className={`relative grid h-9 w-9 cursor-pointer place-items-center rounded-full border-2 border-dashed border-border ${ring(Boolean(custom))}`} style={custom ? { background: accent, borderStyle: 'solid' } : undefined} title="Any color">
            <Pipette className="h-4 w-4 text-muted-foreground" style={custom ? { color: '#fff' } : undefined} />
            <input type="color" aria-label="Pick any accent color" value={accent || '#4c8dff'} onChange={(event) => onChange({ accent: event.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
        </div>
      </section>
      {NO_BANNER.includes(LOOKS[index].id) ? <p className="text-[13px] font-semibold text-muted-foreground">{LOOKS[index].name} has no banner: your name and photo lead the page. The banner you pick shows in the other looks.</p> : <section aria-label="Banner" className="grid gap-2.5">
        <Heading>Banner</Heading>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {BANNERS.map((item) => <button key={item.id} type="button" aria-pressed={banner === item.id} onClick={() => onChange({ banner: item.id })} className={`grid gap-1 text-left ${banner === item.id ? '' : 'opacity-90 hover:opacity-100'}`}>
            <span className={`block h-12 rounded-xl ${ring(banner === item.id)}`} style={{ background: item.css }} />
            <small className="px-0.5 text-[11px] font-bold text-muted-foreground">{item.name}</small>
          </button>)}
          <button type="button" aria-pressed={banner === 'image'} onClick={() => layout.banner_image && banner !== 'image' ? onChange({ banner: 'image' }) : setPicking(true)} className="grid gap-1 text-left">
            <span className={`relative grid h-12 place-items-center overflow-hidden rounded-xl border-2 border-dashed border-border text-muted-foreground ${ring(banner === 'image')}`}>
              {layout.banner_image ? <img src={normalizeMediaUrl(layout.banner_image.url) || layout.banner_image.url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <ImagePlus className="h-5 w-5" />}
            </span>
            <small className="px-0.5 text-[11px] font-bold text-muted-foreground">{layout.banner_image ? (banner === 'image' ? 'Change photo' : 'Your photo') : 'Upload'}</small>
          </button>
        </div>
      </section>}
      <MediaPickerDialog open={picking} onOpenChange={setPicking} title="Banner photo" description="Upload a wide photo, or pick one you’ve used. It sits across the top of your portfolio." owner={{ type: 'user', id: userId }} mediaType="image" accessToken={token} onSave={(asset) => { setPicking(false); onChange({ banner_image_uuid: asset.asset_uuid }) }} />
    </DialogContent>
  </Dialog>
}
