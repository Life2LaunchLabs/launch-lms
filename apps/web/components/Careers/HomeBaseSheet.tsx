'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import useSWR from 'swr'
import { Check, Loader2, MapPin, X } from 'lucide-react'
import { careersApi, type HomeReach } from '@services/life/careers'
import { cn } from '@/lib/utils'

import { tr } from '@/lib/tr'
// Where's home base? The town Explore measures "near you" from, how far the learner would go for school or work,
// and whether online classes are OK. The town is the portfolio's location, so the sheet says it shows there too.

const REACHES = (): Array<[HomeReach, string, string]> => ([
  ['close', tr('lit.home_base_sheet.stay_close', 'Stay close'), tr('lit.home_base_sheet.my_town_and_county', 'My town and county')],
  ['region', tr('lit.home_base_sheet.my_region', 'My region'), tr('lit.home_base_sheet.an_hour_or_two_away', 'An hour or two away')],
  ['state', tr('lit.home_base_sheet.anywhere_in_oregon', 'Anywhere in Oregon'), tr('lit.home_base_sheet.any_school_in_the_state', 'Any school in the state')],
  ['anywhere', tr('lit.home_base_sheet.anywhere', 'Anywhere'), tr('lit.home_base_sheet.other_states_too', 'Other states too')],
])

export default function HomeBaseSheet({ token, onClose, onSaved }: { token: string; onClose: () => void; onSaved: () => void }) {
  const { data } = useSWR(['life-home'], () => careersApi.home(token))
  const [label, setLabel] = React.useState<string | null>(null)
  const [reach, setReach] = React.useState<HomeReach | null>(null)
  const [online, setOnline] = React.useState<boolean | null>(null)
  const [typed, setTyped] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  const text = label ?? data?.label ?? ''
  const reachNow = reach ?? data?.reach ?? 'state'
  const onlineNow = online ?? data?.online ?? true

  React.useEffect(() => setMounted(true), [])
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onClose() } }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])
  // Place what's typed after a short pause, without saving it.
  React.useEffect(() => {
    const timer = window.setTimeout(() => setTyped(text.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [text])
  const { data: preview, isLoading: placing } = useSWR(data && typed && typed !== data.label ? ['life-home', typed] : null, () => careersApi.home(token, typed))
  const shown = typed && data && typed !== data.label ? preview : typed ? data : null

  const save = async () => {
    setSaving(true)
    setFailed(false)
    try {
      await careersApi.saveHome({ label: text, reach: reachNow, online: onlineNow }, token)
      onSaved()
      onClose()
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  const body = <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-6" style={{ zIndex: 'calc(var(--z-modal) + 1)' }}>
    <div aria-hidden="true" className="absolute inset-0 bg-black/45" onClick={onClose} />
    <div role="dialog" aria-modal="true" aria-labelledby="home-base-title" className="relative flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-[28px] bg-background p-4 pb-[max(20px,env(safe-area-inset-bottom))] text-foreground sm:max-w-[480px] sm:rounded-[28px] sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 id="home-base-title" className="m-0 text-[24px] font-extrabold leading-tight">{tr('careers.home_base_sheet.where_s_home_base', 'Where’s home base?')}</h2>
          <p className="m-0 text-[13.5px] text-muted-foreground">{tr('careers.home_base_sheet.pay_openings_and_schools_near', 'Pay, openings and schools near you start from here.')}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={tr('discover.resource_sheet.close', 'Close')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-foreground text-background"><X size={18} /></button>
      </div>

      {!data ? <div className="flex h-24 items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" aria-label={tr('discover.resource_sheet.loading', 'Loading')} /></div> : <>
        <label className="flex flex-col gap-1.5">
          <span className="text-[14px] font-extrabold">{tr('careers.home_base_sheet.town', 'Town')}</span>
          <input value={text} onChange={(event) => setLabel(event.target.value)} maxLength={120} placeholder={tr('careers.home_base_sheet.roseburg_or', 'Roseburg, OR')} autoComplete="address-level2"
            className="min-h-12 rounded-[14px] border-2 border-border bg-card px-3.5 text-[16px] font-bold outline-none focus:border-[var(--org-primary-color)]" />
          <span className="flex min-h-5 items-center gap-1 text-[13px] font-bold" aria-live="polite">
            {!typed ? <span className="text-muted-foreground">{tr('careers.home_base_sheet.leave_it_empty_and_we', 'Leave it empty and we’ll show Oregon.')}</span>
              : placing || !shown ? <Loader2 size={14} className="animate-spin text-muted-foreground" aria-label={tr('careers.home_base_sheet.finding_it', 'Finding it')} />
              : shown.place ? <><MapPin size={14} className="shrink-0 text-amber-600" aria-hidden="true" />{[shown.place.label, shown.area].filter(Boolean).join(' · ')}</>
              : <span className="text-muted-foreground">{tr('careers.home_base_sheet.we_can_t_place_that', 'We can’t place that yet. Try your town’s name, like “Bend, OR”.')}</span>}
          </span>
          <span className="text-[12px] text-muted-foreground">{tr('careers.home_base_sheet.this_is_the_location_on', 'This is the location on your portfolio, so people you share it with see it too.')}</span>
        </label>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-[14px] font-extrabold">{tr('careers.home_base_sheet.how_far_would_you_go', 'How far would you go for school or work?')}</legend>
          {REACHES().map(([key, name, hint]) => <label key={key} className={cn('flex min-h-12 cursor-pointer items-center gap-3 rounded-[16px] border-2 px-3.5 py-2', reachNow === key ? 'border-[var(--org-primary-color)] bg-card' : 'border-border bg-card')}>
            <input type="radio" name="home-reach" value={key} checked={reachNow === key} onChange={() => setReach(key)} className="sr-only" />
            <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2', reachNow === key ? 'border-[var(--org-primary-color)] bg-[var(--org-primary-color)] text-white' : 'border-border')} aria-hidden="true">
              {reachNow === key ? <Check size={12} strokeWidth={3} /> : null}
            </span>
            <span className="flex flex-col"><span className="text-[15px] font-extrabold">{name}</span><span className="text-[12.5px] text-muted-foreground">{hint}</span></span>
          </label>)}
        </fieldset>

        <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-[16px] border-2 border-border bg-card px-3.5 py-2">
          <span className="flex flex-col"><span className="text-[15px] font-extrabold">{tr('careers.home_base_sheet.online_classes_are_ok', 'Online classes are OK')}</span><span className="text-[12.5px] text-muted-foreground">{tr('careers.home_base_sheet.show_fully_online_programs_from', 'Show fully online programs from anywhere')}</span></span>
          <input type="checkbox" role="switch" checked={onlineNow} onChange={(event) => setOnline(event.target.checked)} className="peer sr-only" />
          <span aria-hidden="true" className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring', onlineNow ? 'bg-[var(--org-primary-color)]' : 'bg-muted')}>
            <span className={cn('absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all', onlineNow ? 'left-6' : 'left-1')} />
          </span>
        </label>

        {failed ? <p role="alert" className="m-0 text-[13px] font-bold text-red-600">{tr('careers.home_base_sheet.that_didn_t_save_try', 'That didn’t save. Try again.')}</p> : null}
        <button type="button" onClick={save} disabled={saving} className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--org-primary-color)] px-5 text-[16px] font-extrabold text-white disabled:opacity-60">
          {saving ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : null}{tr('careers.home_base_sheet.save_home_base', 'Save home base')}
        </button>
      </>}
    </div>
  </div>

  return mounted ? createPortal(body, document.body) : null
}
