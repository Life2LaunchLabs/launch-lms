'use client'

import { useState } from 'react'
import { Check, ImagePlus, Monitor, Moon, Pipette, Sun } from 'lucide-react'
import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { ACCENTS, BANNERS, LOOKS, MODES, type LookId, type LookMode } from '@components/Looks/looks'
import { normalizeMediaUrl } from '@services/media/media'
import type { LayoutChange } from '@services/portfolio/records'
import type { OpenChange } from './parts'
import type { PortfolioLayout } from '../portfolioTypes'

// eslint-disable-next-line no-unused-vars
type Change = (next: LayoutChange) => void

/** A look's card: a little page in its colors (its dark side in dark mode), a cover from accent A to B, and two tiles. */
function LookCard({ look, on, dark, onPick }: { look: (typeof LOOKS)[number]; on: boolean; dark: boolean; onPick: () => void }) {
  const [background, a, b, c] = dark ? look.night : look.colors
  return <button type="button" onClick={onPick} aria-pressed={on} className={`relative grid gap-1.5 rounded-2xl border-2 p-2 text-left transition ${on ? 'border-foreground' : 'border-border hover:border-foreground/40'}`}>
    <span className="relative block h-[86px] overflow-hidden rounded-xl border border-black/10" style={{ background }} aria-hidden="true">
      <i className="absolute inset-x-2 top-2 h-[30px] rounded-lg" style={{ background: `linear-gradient(120deg, ${a}, ${b})` }} />
      <i className="absolute left-2 top-11 h-[34px] w-[40%] rounded-lg" style={{ background: c }} />
      <i className="absolute right-2 top-11 h-[34px] w-[calc(60%-24px)] rounded-lg opacity-35" style={{ background: a }} />
    </span>
    <b className="px-1 text-sm font-extrabold">{look.name}</b>
    <small className="px-1 text-xs font-semibold leading-snug text-muted-foreground">{look.blurb}</small>
    {on ? <span className="absolute right-3.5 top-3.5 grid h-6 w-6 place-items-center rounded-full bg-foreground text-background"><Check className="h-3.5 w-3.5" /></span> : null}
  </button>
}

function Segments<T extends string>({ value, options, onPick, label }: { value: T; options: Array<[T, string, React.ReactNode?]>; onPick: (next: T) => void; label: string }) { // eslint-disable-line no-unused-vars
  return <div role="group" aria-label={label} className="inline-flex rounded-full bg-muted p-1">
    {options.map(([option, text, icon]) => <button key={option} type="button" aria-pressed={value === option} onClick={() => onPick(option)} className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-bold transition ${value === option ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{icon}{text}</button>)}
  </div>
}

const Heading = ({ children }: { children: React.ReactNode }) => <h3 className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{children}</h3>
const MODE_ICONS: Record<LookMode, React.ReactNode> = { light: <Sun className="h-3.5 w-3.5" />, dark: <Moon className="h-3.5 w-3.5" />, system: <Monitor className="h-3.5 w-3.5" /> }

/** The learner's look (their theme for the whole app): light or dark, the look, an accent, the banner, and the front page's layout. */
export function LookDialog({ open, onOpenChange, layout, mode, dark, onChange, spot, userId, token }: { open: boolean; onOpenChange: OpenChange; layout: PortfolioLayout; mode: LookMode; dark: boolean; onChange: Change; spot?: string; userId: number; token?: string }) {
  const [picking, setPicking] = useState(false)
  const accent = layout.accent || ''
  const banner = layout.banner || 'look'
  const custom = accent && !ACCENTS.includes(accent)
  const ring = (on: boolean) => on ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : ''
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90dvh] max-w-xl gap-6 overflow-y-auto">
      <DialogHeader><DialogTitle>Your look</DialogTitle><DialogDescription>Your theme for all of Launchpad. Visitors see your portfolio in it too.</DialogDescription></DialogHeader>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Heading>Mode</Heading>
        <Segments label="Light or dark" value={mode} options={MODES.map((item) => [item.id, item.label, MODE_ICONS[item.id]])} onPick={(next) => onChange({ mode: next })} />
      </div>
      <section aria-label="Theme" className={`grid grid-cols-2 gap-2.5 rounded-2xl sm:grid-cols-4 ${spot ? 'p-1 ring-4 ring-[#2F66D6]/25' : ''}`}>
        {LOOKS.map((look) => <LookCard key={look.id} look={look} dark={dark} on={layout.look === look.id} onPick={() => onChange({ look: look.id as LookId })} />)}
      </section>
      <section aria-label="Accent color" className="grid gap-2.5">
        <Heading>Accent color</Heading>
        <div className="flex flex-wrap items-center gap-2.5">
          <button type="button" aria-pressed={!accent} onClick={() => onChange({ accent: '' })} className={`h-9 rounded-full border-2 border-border px-3 text-xs font-bold ${!accent ? 'border-foreground' : 'text-muted-foreground'}`}>Look’s own</button>
          {ACCENTS.map((color) => <button key={color} type="button" aria-label={`Accent ${color}`} aria-pressed={accent === color} onClick={() => onChange({ accent: color })} className={`grid h-9 w-9 place-items-center rounded-full ${ring(accent === color)}`} style={{ background: color }}>{accent === color ? <Check className="h-4 w-4" style={{ color: color === '#f5a524' ? '#111' : '#fff' }} /> : null}</button>)}
          <label className={`relative grid h-9 w-9 cursor-pointer place-items-center rounded-full border-2 border-dashed border-border ${ring(Boolean(custom))}`} style={custom ? { background: accent, borderStyle: 'solid' } : undefined} title="Any color">
            <Pipette className="h-4 w-4 text-muted-foreground" style={custom ? { color: '#fff' } : undefined} />
            <input type="color" aria-label="Pick any accent color" value={accent || '#4c8dff'} onChange={(event) => onChange({ accent: event.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
        </div>
      </section>
      <section aria-label="Banner" className="grid gap-2.5">
        <Heading>Banner</Heading>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-4">
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
      <section aria-label="Layout" className="grid gap-2.5">
        <Heading>Layout</Heading>
        <div className="flex items-center justify-between gap-3"><b className="text-sm">Header</b><Segments label="Header" value={layout.header} options={[['left', 'Left'], ['center', 'Centered']]} onPick={(header) => onChange({ header })} /></div>
        <div className="flex items-center justify-between gap-3"><b className="text-sm">Sections</b><Segments label="Sections" value={layout.sections} options={[['grid', 'Grid'], ['list', 'List']]} onPick={(sections) => onChange({ sections })} /></div>
      </section>
      <MediaPickerDialog open={picking} onOpenChange={setPicking} title="Banner photo" description="Upload a wide photo, or pick one you’ve used. It sits across the top of your portfolio." owner={{ type: 'user', id: userId }} mediaType="image" accessToken={token} onSave={(asset) => { setPicking(false); onChange({ banner_image_uuid: asset.asset_uuid }) }} />
    </DialogContent>
  </Dialog>
}
