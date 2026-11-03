'use client'

import { useState } from 'react'
import { Check, ChevronLeft, ChevronRight, ImagePlus, Monitor, Moon, Pipette, Sun } from 'lucide-react'
import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { ACCENTS, BANNERS, LOOKS, MODES, type LookMode } from '@components/Looks/looks'
import { normalizeMediaUrl } from '@services/media/media'
import type { LayoutChange } from '@services/portfolio/records'
import type { OpenChange } from './parts'
import type { PortfolioLayout } from '../portfolioTypes'

// eslint-disable-next-line no-unused-vars
type Change = (next: LayoutChange) => void

/** The look being worn, as one card: a little page in its type and colors. Arrows try on the next one. */
function LookCard({ look, dark, onStep, index, count }: { look: (typeof LOOKS)[number]; dark: boolean; onStep: (step: number) => void; index: number; count: number }) { // eslint-disable-line no-unused-vars
  const [background, a, b, c] = dark ? look.night : look.colors
  const ink = dark ? '#f4f4f5' : '#111111'
  const radius = look.id === 'gallery' ? 0 : look.id === 'volt' ? 14 : 18
  const arrow = 'grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-border bg-card text-foreground transition hover:bg-raised'
  return <div className="grid gap-3">
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => onStep(-1)} aria-label="Previous look" className={arrow}><ChevronLeft className="h-5 w-5" /></button>
      <div className="relative h-[150px] min-w-0 flex-1 overflow-hidden rounded-2xl border border-black/10 p-3" style={{ background }} aria-hidden="true">
        <i className="absolute inset-x-3 top-3 h-[44px]" style={{ background: `linear-gradient(120deg, ${a}, ${b})`, borderRadius: radius }} />
        <b className="absolute left-4 top-[66px] text-[26px] leading-none" style={{ fontFamily: look.font, color: ink, textTransform: look.id === 'volt' ? 'uppercase' : 'none', fontWeight: look.id === 'playful' ? 900 : 400 }}>{look.id === 'gallery' ? <>Maya <em style={{ color: a }}>Torres</em></> : 'Maya Torres'}</b>
        <i className="absolute bottom-3 left-3 h-[34px] w-[38%]" style={{ background: look.id === 'gallery' ? 'transparent' : c, borderTop: look.id === 'gallery' ? `1px solid ${ink}` : undefined, borderRadius: radius, boxShadow: look.id === 'playful' ? `0 3px 0 ${dark ? '#24323f' : '#d5dde2'}` : undefined }} />
        <i className="absolute bottom-3 right-3 h-[34px] w-[calc(62%-30px)]" style={{ background: a, opacity: look.id === 'volt' ? 1 : 0.35, borderRadius: look.id === 'volt' ? 999 : radius }} />
      </div>
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

const Heading = ({ children }: { children: React.ReactNode }) => <h3 className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{children}</h3>
const MODE_ICONS: Record<LookMode, React.ReactNode> = { light: <Sun className="h-3.5 w-3.5" />, dark: <Moon className="h-3.5 w-3.5" />, system: <Monitor className="h-3.5 w-3.5" /> }

/** The learner's look (their theme for the whole app): the look, light or dark, an accent, and the banner. */
export function LookDialog({ open, onOpenChange, layout, mode, dark, onChange, spot, userId, token }: { open: boolean; onOpenChange: OpenChange; layout: PortfolioLayout; mode: LookMode; dark: boolean; onChange: Change; spot?: string; userId: number; token?: string }) {
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
      <section aria-label="Banner" className="grid gap-2.5">
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
      </section>
      <MediaPickerDialog open={picking} onOpenChange={setPicking} title="Banner photo" description="Upload a wide photo, or pick one you’ve used. It sits across the top of your portfolio." owner={{ type: 'user', id: userId }} mediaType="image" accessToken={token} onSave={(asset) => { setPicking(false); onChange({ banner_image_uuid: asset.asset_uuid }) }} />
    </DialogContent>
  </Dialog>
}
