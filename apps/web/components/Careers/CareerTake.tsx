'use client'

import React from 'react'
import { toast } from 'react-hot-toast'
import { Check, Loader2 } from 'lucide-react'
import { Switch } from '@components/ui/switch'
import { saveResource, type SavedResourceState } from '@services/resources/resources'
import { cn } from '@/lib/utils'

export const INTEREST_LEVELS: Array<[number, string, string]> = [[1, 'Maybe', '♥'], [2, 'Into it', '♥♥'], [3, 'Love it', '♥♥♥']]
const QUICK = ['Sounds like me', 'I want to job shadow', 'Ask my counselor about classes', 'The pay looks good', 'I know someone who does this']

/**
 * The learner's own take on a saved career: how into it they are, what caught their eye, and whether it shows on
 * their Education Plan and Profile. The rating is theirs alone; public reviews are separate.
 */
export default function CareerTake({ resourceUuid, state, token, onSaved, onSkip, fresh = false }: {
  resourceUuid: string; state: SavedResourceState | null; token: string; onSaved?: () => void; onSkip?: () => void; fresh?: boolean
}) {
  const [level, setLevel] = React.useState<number>(state?.interest_level || 2)
  const [note, setNote] = React.useState(state?.notes || '')
  const [epp, setEpp] = React.useState<boolean>(fresh ? true : Boolean(state?.show_on_epp))
  const [busy, setBusy] = React.useState(false)
  const dirty = fresh || level !== (state?.interest_level || 2) || note !== (state?.notes || '') || epp !== Boolean(state?.show_on_epp)

  const quick = (text: string) => setNote((value) => value.trim() ? `${value.trim().replace(/[.!]?$/, '.')} ${text}.` : `${text}.`)
  const save = async () => {
    setBusy(true)
    try {
      const result: any = await saveResource(resourceUuid, { notes: note.trim(), interest_level: level, show_on_epp: epp }, token)
      if (result?.success === false) throw new Error()
      toast.success(epp ? 'Saved, and on your EPP' : 'Saved')
      onSaved?.()
    } catch {
      toast.error('Couldn’t save that. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="flex flex-col gap-3">
    <div className="flex flex-col gap-2">
      <span className="text-[14px] font-extrabold">How into it are you?</span>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="How into it are you">
        {INTEREST_LEVELS.map(([value, label, hearts]) => <button key={value} type="button" role="radio" aria-checked={level === value} onClick={() => setLevel(value)}
          className={cn('flex flex-col items-center gap-0.5 rounded-2xl border-2 py-2 text-[13px] font-extrabold', level === value ? 'border-[var(--org-primary-color)] bg-[color-mix(in_srgb,var(--org-primary-color)_12%,transparent)]' : 'border-border bg-card')}>
          <small className="text-[11px] tracking-widest text-rose-500" aria-hidden="true">{hearts}</small>{label}
        </button>)}
      </div>
    </div>
    <label className="flex flex-col gap-2">
      <span className="text-[14px] font-extrabold">What caught your eye?</span>
      <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={3} placeholder="A few words for future you (and your counselor)"
        className="w-full resize-y rounded-2xl border-2 border-border bg-card p-3 text-[14px] focus:border-[var(--org-primary-color)] focus:outline-none" />
    </label>
    <div className="flex flex-wrap gap-1.5">{QUICK.map((text) => <button key={text} type="button" onClick={() => quick(text)} className="rounded-full border-2 border-border bg-card px-3 py-1 text-[12.5px] font-bold hover:bg-raised">{text}</button>)}</div>
    <label className="flex items-start gap-3 rounded-2xl bg-muted p-3">
      <Switch checked={epp} onCheckedChange={setEpp} className="mt-0.5" aria-label="Add to my EPP" />
      <span className="flex flex-col gap-0.5"><b className="text-[14px]">Add to my EPP</b><span className="text-[12.5px] text-muted-foreground">It shows under Careers I’m exploring in your Education Plan and Profile, with your note, so your counselor sees it when you review your plan.</span></span>
    </label>
    <div className="flex gap-2.5">
      {onSkip ? <button type="button" onClick={onSkip} className="h-12 flex-1 rounded-2xl text-sm font-bold text-muted-foreground hover:bg-muted">{fresh ? 'Skip' : 'Cancel'}</button> : null}
      <button type="button" onClick={() => void save()} disabled={busy || !dirty}
        className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--org-primary-color)] text-sm font-extrabold uppercase tracking-wide text-[var(--org-on-primary-color)] shadow-[0_4px_0_color-mix(in_srgb,var(--org-primary-color)_68%,#000)] disabled:opacity-50 active:translate-y-[3px]">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}Save
      </button>
    </div>
  </div>
}
