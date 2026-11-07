'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import type { AccessibilitySettings } from '@services/users/accessibility'
import { speak, useSpeechSupported, useVoices } from './speech'

import { tr } from '@/lib/tr'
const RATES = [{ value: 0.75, get label() { return tr('access.accessibility_controls.slower', 'Slower') } }, { value: 1, get label() { return tr('access.accessibility_controls.normal', 'Normal') } }, { value: 1.25, get label() { return tr('access.accessibility_controls.faster', 'Faster') } }]
const MOTION = [{ value: 'device', get label() { return tr('access.accessibility_controls.like_my_device', 'Like my device') } }, { value: 'on', get label() { return tr('access.accessibility_controls.less_motion', 'Less motion') } }, { value: 'off', get label() { return tr('access.accessibility_controls.all_motion', 'All motion') } }] as const

function Toggle({ label, help, checked, onChange }: { label: string; help: string; checked: boolean; onChange: (next: boolean) => void }) { // eslint-disable-line no-unused-vars
  const id = React.useId()
  return <div className="flex items-center justify-between gap-4 py-3">
    <div className="min-w-0"><label htmlFor={id} className="block text-[15px] font-bold">{label}</label><p id={`${id}-help`} className="text-sm text-muted-foreground">{help}</p></div>
    <button id={id} type="button" role="switch" aria-checked={checked} aria-describedby={`${id}-help`} onClick={() => onChange(!checked)}
      className={cn('relative h-8 w-14 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--org-primary-color)]', checked ? 'bg-[var(--org-primary-color)]' : 'bg-muted-foreground/30')}>
      <span aria-hidden="true" className={cn('absolute top-1 size-6 rounded-full bg-white shadow transition-[left]', checked ? 'left-7' : 'left-1')} />
    </button>
  </div>
}

function Choice<T extends string | number>({ label, options, value, onChange }: { label: string; options: ReadonlyArray<{ value: T; label: string }>; value: T; onChange: (next: T) => void }) { // eslint-disable-line no-unused-vars
  return <fieldset className="py-3">
    <legend className="mb-2 text-[15px] font-bold">{label}</legend>
    <div className="flex flex-wrap gap-2">
      {options.map((option) => <button key={String(option.value)} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}
        className={cn('min-h-11 rounded-full border-2 px-4 text-sm font-bold transition-colors', value === option.value ? 'border-[var(--org-primary-color)] bg-muted' : 'border-border text-muted-foreground hover:bg-muted')}>{option.label}</button>)}
    </div>
  </fieldset>
}

/**
 * The accessibility settings, for the learner's own Settings page and for staff setting them for a learner.
 * `forSomeoneElse` words the help for staff and leaves out trying the voice on this device.
 */
// eslint-disable-next-line no-unused-vars
export function AccessibilityControls({ settings, onChange, forSomeoneElse = false }: { settings: AccessibilitySettings; onChange: (patch: Partial<AccessibilitySettings>) => void; forSomeoneElse?: boolean }) {
  const voices = useVoices()
  const supported = useSpeechSupported()
  const lang = (typeof document !== 'undefined' && document.documentElement.lang) || 'en'
  const inLang = voices.filter((voice) => voice.lang.toLowerCase().startsWith(lang.split('-')[0].toLowerCase()))
  const they = forSomeoneElse ? 'their' : 'your'
  return <div className="divide-y divide-border">
    <Toggle label={tr('access.read_aloud.read_to_me', 'Read to me')} help={`Reads each new question, card and step out loud as it shows up. The speaker buttons work either way.`} checked={settings.read_to_me} onChange={(read_to_me) => onChange({ read_to_me })} />
    <Choice label={tr('access.accessibility_controls.how_fast_it_talks', 'How fast it talks')} options={RATES} value={settings.rate} onChange={(rate) => onChange({ rate })} />
    {!forSomeoneElse && supported && inLang.length > 1 ? <div className="py-3">
      <label className="mb-2 block text-[15px] font-bold" htmlFor="read-aloud-voice">{tr('access.accessibility_controls.voice', 'Voice')}</label>
      <div className="flex flex-wrap items-center gap-2">
        <select id="read-aloud-voice" value={settings.voice || ''} onChange={(event) => onChange({ voice: event.target.value || null })}
          className="h-11 min-w-0 max-w-full rounded-xl border-2 border-border bg-card px-3 text-sm font-semibold">
          <option value="">{tr('access.accessibility_controls.this_device_s_usual_voice', 'This device’s usual voice')}</option>
          {inLang.map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name}</option>)}
        </select>
        <button type="button" className="min-h-11 rounded-full border-2 border-border px-4 text-sm font-bold hover:bg-muted"
          onClick={() => speak('voice-sample', 'Hi! This is how I sound when I read to you.', { rate: settings.rate, voice: settings.voice })}>{tr('access.accessibility_controls.try_it', 'Try it')}</button>
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">{tr('access.accessibility_controls.voices_come_from_this_device', 'Voices come from this device, so another computer may sound different.')}</p>
    </div> : null}
    <Toggle label={tr('access.accessibility_controls.light_up_words', 'Light up words')} help="Highlights each word as it’s read." checked={settings.highlight} onChange={(highlight) => onChange({ highlight })} />
    <Toggle label={tr('access.accessibility_controls.bigger_text', 'Bigger text')} help={`Makes words and buttons larger on ${they} screens.`} checked={settings.bigger_text} onChange={(bigger_text) => onChange({ bigger_text })} />
    <Choice label={tr('access.accessibility_controls.motion', 'Motion')} options={MOTION} value={settings.less_motion} onChange={(less_motion) => onChange({ less_motion })} />
  </div>
}
