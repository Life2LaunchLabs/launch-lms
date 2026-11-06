'use client'

import React from 'react'
import { Mic, Square, Volume2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAccessibility } from './AccessibilityContext'
import { speak, stopSpeaking, stopSpeakingIf, useSpeech, useSpeechSupported } from './speech'
import { joinSpoken, useDictation } from './dictation'

type Size = 'sm' | 'md' | 'lg'
const SIZES: Record<Size, { box: string; icon: number }> = {
  sm: { box: 'size-8', icon: 16 },
  md: { box: 'size-10', icon: 19 },
  lg: { box: 'size-12', icon: 22 },
}

/** A stable id for a piece of text, so its button and its highlighted words know they're the ones speaking. */
export function useSpeechId(prefix = 'say'): string {
  return `${prefix}-${React.useId()}`
}

/**
 * The speaker button: reads `text` aloud, or stops it. Shows for everyone (no setting needed) wherever the
 * browser can speak. Pass the same `id` to <ReadAloudText> to light up each word as it's read.
 */
export function SpeakButton({ text, id, label = 'Read aloud', size = 'md', className, tone = 'muted' }: {
  text: string; id?: string; label?: string; size?: Size; className?: string; tone?: 'muted' | 'onDark'
}) {
  const own = useSpeechId()
  const speechId = id || own
  const supported = useSpeechSupported()
  const { settings } = useAccessibility()
  const now = useSpeech()
  React.useEffect(() => () => stopSpeakingIf(speechId), [speechId])
  if (!supported || !text.trim()) return null
  const speaking = now.id === speechId
  const { box, icon } = SIZES[size]
  return <button type="button" aria-label={speaking ? 'Stop reading' : label} aria-pressed={speaking}
    onClick={(event) => { event.stopPropagation(); if (speaking) stopSpeaking(); else speak(speechId, text, { rate: settings.rate, voice: settings.voice }) }}
    className={cn('inline-grid shrink-0 place-items-center rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--org-primary-color)]', box,
      tone === 'onDark' ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-muted text-foreground/80 hover:bg-muted/70 hover:text-foreground',
      speaking && (tone === 'onDark' ? 'bg-white text-black hover:bg-white' : 'bg-[var(--org-primary-color)] text-white hover:bg-[var(--org-primary-color)] hover:text-white'), className)}>
    {speaking ? <Square size={icon - 3} className="fill-current" aria-hidden="true" /> : <Volume2 size={icon} aria-hidden="true" />}
  </button>
}

/** Text that lights up word by word while its speaker button reads it (when Highlight words is on). */
export function ReadAloudText({ text, id }: { text: string; id: string }) {
  const now = useSpeech()
  const { settings } = useAccessibility()
  if (!settings.highlight || now.id !== id || !now.word) return <>{text}</>
  const [from, to] = now.word
  return <>{text.slice(0, from)}<span className="read-aloud-word">{text.slice(from, to)}</span>{text.slice(to)}</>
}

/**
 * Reads `text` out loud when it first shows (and again when it changes), for learners with Read to me on.
 * Browsers only allow this after the learner has tapped something on the page, which they will have by then.
 */
export function useAutoRead(id: string, text: string, enabled = true) {
  const { settings } = useAccessibility()
  const on = enabled && settings.read_to_me && Boolean(text.trim())
  React.useEffect(() => {
    if (!on) return
    const timer = window.setTimeout(() => speak(id, text, { rate: settings.rate, voice: settings.voice }), 250)
    return () => { window.clearTimeout(timer); stopSpeaking() }
  }, [on, id, text]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** A heading or line with its speaker button beside it, read aloud on arrival for Read to me. */
export function SpokenLine({ text, as: Tag = 'p', className, buttonSize = 'md', autoRead = false, tone }: {
  text: string; as?: React.ElementType; className?: string; buttonSize?: Size; autoRead?: boolean; tone?: 'muted' | 'onDark'
}) {
  const id = useSpeechId()
  useAutoRead(id, text, autoRead)
  return <div className="flex items-start gap-2">
    <Tag className={cn('min-w-0 flex-1', className)}><ReadAloudText id={id} text={text} /></Tag>
    <SpeakButton id={id} text={text} size={buttonSize} tone={tone} className="mt-0.5" />
  </div>
}

/**
 * The mic button: talk instead of typing. Spoken words are added to `value` through `onChange`. Hidden on
 * browsers without speech recognition (Firefox).
 */
// eslint-disable-next-line no-unused-vars
export function MicButton({ value, onChange, size = 'md', className, label = 'Talk instead of typing' }: { value: string; onChange: (next: string) => void; size?: Size; className?: string; label?: string }) {
  const latest = React.useRef(value)
  React.useEffect(() => { latest.current = value }, [value])
  const dictation = useDictation((said) => {
    const next = joinSpoken(latest.current, said)
    latest.current = next
    onChange(next)
  })
  if (!dictation.supported) return null
  const { box, icon } = SIZES[size]
  return <span className={cn('relative inline-flex shrink-0', className)}>
    <button type="button" aria-label={dictation.listening ? 'Stop listening' : label} aria-pressed={dictation.listening}
      onClick={() => dictation.listening ? dictation.stop() : dictation.start()}
      className={cn('inline-grid place-items-center rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--org-primary-color)]', box,
        dictation.listening ? 'animate-pulse bg-red-500 text-white' : 'bg-muted text-foreground/80 hover:bg-muted/70 hover:text-foreground')}>
      {dictation.listening ? <Square size={icon - 3} className="fill-current" aria-hidden="true" /> : <Mic size={icon} aria-hidden="true" />}
    </button>
    <span role="status" aria-live="polite" className={cn('pointer-events-none absolute right-0 top-full z-20 mt-1.5 w-max max-w-[260px] rounded-xl bg-foreground px-3 py-1.5 text-[13px] font-semibold text-background shadow-lg', !(dictation.listening || dictation.error) && 'sr-only')}>
      {dictation.error || (dictation.listening ? (dictation.interim || 'Listening… talk now') : '')}
    </span>
  </span>
}

/**
 * A question and its helper line, read together by one speaker button (and on arrival for Read to me), each
 * part lighting up as it's read.
 */
export function SpokenQuestion({ title, sub, as: Tag = 'h1', className, subClassName, autoRead = true, buttonSize = 'lg', tone }: {
  title: string; sub?: string | null; as?: React.ElementType; className?: string; subClassName?: string; autoRead?: boolean; buttonSize?: Size; tone?: 'muted' | 'onDark'
}) {
  const id = useSpeechId()
  const gap = sub ? '. ' : ''
  const joined = /[.!?…]$/.test(title.trim()) || !sub ? `${title} ${sub || ''}`.trim() : `${title}${gap}${sub}`
  const subStart = sub ? joined.length - sub.length : joined.length
  useAutoRead(id, joined, autoRead)
  const now = useSpeech()
  const { settings } = useAccessibility()
  const word = settings.highlight && now.id === id ? now.word : null
  const part = (text: string, offset: number) => {
    if (!word || word[1] <= offset || word[0] >= offset + text.length) return text
    const from = Math.max(0, word[0] - offset)
    const to = Math.min(text.length, word[1] - offset)
    return <>{text.slice(0, from)}<span className="read-aloud-word">{text.slice(from, to)}</span>{text.slice(to)}</>
  }
  return <div className="flex items-start gap-3">
    <div className="min-w-0 flex-1">
      <Tag className={className}>{part(title, 0)}</Tag>
      {sub ? <p className={subClassName}>{part(sub, subStart)}</p> : null}
    </div>
    <SpeakButton id={id} text={joined} size={buttonSize} tone={tone} />
  </div>
}

/** A pill that turns Read to me on or off, for the first screens a learner sees. */
export function ReadToMeToggle({ className }: { className?: string }) {
  const { settings, save } = useAccessibility()
  const supported = useSpeechSupported()
  if (!supported) return null
  const on = settings.read_to_me
  return <button type="button" role="switch" aria-checked={on} onClick={() => { void save({ read_to_me: !on }).catch(() => undefined) }}
    className={cn('inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold transition-colors', on ? 'bg-[var(--org-primary-color)] text-white' : 'bg-muted text-foreground', className)}>
    <Volume2 size={17} aria-hidden="true" />Read to me
  </button>
}

/** The words in rich text (Tiptap JSON), one block per line, for reading aloud. */
export function richTextWords(node: any): string {
  if (!node) return ''
  if (Array.isArray(node)) return node.map(richTextWords).filter(Boolean).join('\n')
  if (typeof node.text === 'string') return node.text
  return Array.isArray(node.content) ? node.content.map(richTextWords).join(node.type === 'doc' || node.type?.endsWith('List') ? '\n' : '') : ''
}

/** Rich text with its speaker button beside it. */
export function SpokenRichText({ nodes, children }: { nodes: any; children: React.ReactNode }) {
  const spoken = richTextWords(nodes)
  return <div className="flex items-start gap-2"><div className="min-w-0 flex-1">{children}</div>
    {spoken.trim().length > 3 ? <SpeakButton text={spoken} size="sm" className="mt-1" /> : null}</div>
}

/** Beside an answer box's label: hear the label, and talk instead of typing when the answer is words. */
// eslint-disable-next-line no-unused-vars
export function AnswerVoiceTools({ label, value, typed, onChange }: { label: string; value: string; typed: boolean; onChange: (next: string) => void }) {
  return <>
    {label ? <SpeakButton text={label} size="sm" /> : null}
    {typed ? <MicButton value={value} onChange={onChange} size="sm" /> : null}
  </>
}
