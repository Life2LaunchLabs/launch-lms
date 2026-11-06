'use client'

/**
 * Read-aloud on the browser's own voices (speechSynthesis): free, on the device, and on every browser we
 * support, school Chromebooks included. One thing speaks at a time. Text is spoken a sentence at a time,
 * because Chrome stops long utterances partway, and each spoken word is reported so the words on screen can
 * light up as they're read.
 */

import React from 'react'

export type SpeakOptions = { rate?: number; voice?: string | null; lang?: string }
type State = { id: string | null; word: [number, number] | null }

let state: State = { id: null, word: null }
let runId = 0
const listeners = new Set<() => void>()

function set(next: State) {
  state = next
  listeners.forEach((listener) => listener())
}

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function'
}

/** Sentences of at most ~220 characters, with where each starts in the text. */
export function chunkText(text: string): Array<{ text: string; start: number }> {
  const chunks: Array<{ text: string; start: number }> = []
  const pattern = /[^.!?\n]+[.!?]*[\s]*|\n+/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    let piece = match[0]
    let start = match.index
    while (piece.length > 220) { // a run-on sentence: break at the last space before the limit
      const cut = piece.lastIndexOf(' ', 220) > 40 ? piece.lastIndexOf(' ', 220) : 220
      if (piece.slice(0, cut).trim()) chunks.push({ text: piece.slice(0, cut), start })
      piece = piece.slice(cut)
      start += cut
    }
    if (piece.trim()) chunks.push({ text: piece, start })
  }
  return chunks
}

export function listVoices(): SpeechSynthesisVoice[] {
  return speechSupported() ? window.speechSynthesis.getVoices() : []
}

/** The saved voice, else the device's default voice for the language, else any voice in it. */
export function pickVoice(voiceURI: string | null | undefined, lang: string): SpeechSynthesisVoice | null {
  const voices = listVoices()
  if (voiceURI) {
    const saved = voices.find((voice) => voice.voiceURI === voiceURI)
    if (saved) return saved
  }
  const base = lang.toLowerCase().split('-')[0]
  const inLang = voices.filter((voice) => voice.lang.toLowerCase().split(/[-_]/)[0] === base)
  return inLang.find((voice) => voice.default) || inLang.find((voice) => voice.localService) || inLang[0] || null
}

function pageLang(): string {
  return (typeof document !== 'undefined' && document.documentElement.lang) || 'en'
}

/** Speak `text` as `id`, stopping anything else that was speaking. */
export function speak(id: string, text: string, options: SpeakOptions = {}): void {
  if (!speechSupported()) return
  const synth = window.speechSynthesis
  const run = ++runId
  synth.cancel()
  const chunks = chunkText(text)
  if (!chunks.length) return set({ id: null, word: null })
  const lang = options.lang || pageLang()
  const voice = pickVoice(options.voice, lang)
  set({ id, word: null })
  const next = (index: number) => {
    if (run !== runId) return
    if (index >= chunks.length) return set({ id: null, word: null })
    const chunk = chunks[index]
    const utterance = new SpeechSynthesisUtterance(chunk.text)
    utterance.rate = options.rate || 1
    utterance.lang = voice?.lang || lang
    if (voice) utterance.voice = voice
    utterance.onboundary = (event) => {
      if (run !== runId || event.name !== 'word') return
      const from = chunk.start + event.charIndex
      const length = event.charLength || (chunk.text.slice(event.charIndex).match(/^\S+/)?.[0].length ?? 0)
      set({ id, word: [from, from + length] })
    }
    utterance.onend = () => next(index + 1)
    utterance.onerror = () => { if (run === runId) set({ id: null, word: null }) }
    synth.speak(utterance)
  }
  next(0)
}

export function stopSpeaking(): void {
  if (!speechSupported()) return
  runId += 1
  window.speechSynthesis.cancel()
  set({ id: null, word: null })
}

/** Stops reading if `id` is what's speaking (for a button leaving the page). */
export function stopSpeakingIf(id: string): void {
  if (state.id === id) stopSpeaking()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

const SERVER_STATE: State = { id: null, word: null }

/** What's speaking now, and which word. */
export function useSpeech(): State {
  return React.useSyncExternalStore(subscribe, () => state, () => SERVER_STATE)
}

/** The device's voices, which some browsers load after the page. */
export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = React.useState<SpeechSynthesisVoice[]>([])
  React.useEffect(() => {
    if (!speechSupported()) return
    const load = () => setVoices(window.speechSynthesis.getVoices())
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])
  return voices
}

/** True after mount when this browser can speak, so server and first client render match. */
export function useSpeechSupported(): boolean {
  const [supported, setSupported] = React.useState(false)
  React.useEffect(() => setSupported(speechSupported()), [])
  return supported
}

/** Markdown said as plain words: no symbols, links read by their text. */
export function plainForSpeech(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/(\*\*|__|\*|_|`|~~)/g, '')
    .replace(/\|/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
}
