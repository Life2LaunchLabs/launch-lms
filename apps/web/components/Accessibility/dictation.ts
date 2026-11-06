'use client'

/**
 * Speech-to-text on the browser's own speech recognition: free and nothing to install. Chrome and Edge send
 * the audio to their maker to turn into words (Safari to Apple); Firefox has none, so the mic button hides
 * there. Words arrive as they're recognized: `interim` while the learner is still talking, `onText` once a
 * phrase is final.
 */

import React from 'react'

/* eslint-disable no-unused-vars -- parameter names in function types */
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean
  start: () => void; stop: () => void; abort: () => void
  onresult: ((event: any) => void) | null; onend: (() => void) | null; onerror: ((event: any) => void) | null
}
/* eslint-enable no-unused-vars */

function Recognizer(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null
  const w = window as any
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export function dictationSupported(): boolean {
  return Boolean(Recognizer())
}

/** Adds spoken words to typed ones with one space between, capitalizing a new sentence. */
export function joinSpoken(typed: string, said: string): string {
  const words = said.trim()
  if (!words) return typed
  const before = typed.replace(/\s+$/, '')
  const startsSentence = !before || /[.!?]$/.test(before)
  const shaped = startsSentence ? words[0].toUpperCase() + words.slice(1) : words
  return before ? `${before} ${shaped}` : shaped
}

let active: Recognition | null = null

// eslint-disable-next-line no-unused-vars
export function useDictation(onText: (text: string) => void, lang?: string) {
  const [supported, setSupported] = React.useState(false)
  const [listening, setListening] = React.useState(false)
  const [interim, setInterim] = React.useState('')
  const [error, setError] = React.useState('')
  const recognition = React.useRef<Recognition | null>(null)
  const latest = React.useRef(onText)
  React.useEffect(() => { latest.current = onText })

  React.useEffect(() => { setSupported(dictationSupported()) }, [])
  React.useEffect(() => () => { recognition.current?.abort() }, [])

  const stop = React.useCallback(() => { recognition.current?.stop() }, [])
  const start = React.useCallback(() => {
    const Ctor = Recognizer()
    if (!Ctor) return
    active?.abort() // one mic at a time
    const r = new Ctor()
    r.lang = lang || document.documentElement.lang || 'en-US'
    r.continuous = true
    r.interimResults = true
    r.onresult = (event: any) => {
      let pending = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (result.isFinal) latest.current(result[0].transcript)
        else pending += result[0].transcript
      }
      setInterim(pending)
    }
    r.onerror = (event: any) => {
      const code = event?.error
      setError(code === 'not-allowed' || code === 'service-not-allowed' ? 'Allow the microphone to talk instead of typing.'
        : code === 'no-speech' ? 'I didn’t hear anything. Try again.' : code === 'aborted' ? '' : 'Talking didn’t work this time. Try again.')
    }
    r.onend = () => { setListening(false); setInterim(''); if (active === r) active = null }
    recognition.current = r
    active = r
    setError('')
    setListening(true)
    try { r.start() } catch { setListening(false) }
  }, [lang])

  return { supported, listening, interim, error, start, stop }
}
