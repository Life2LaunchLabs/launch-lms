'use client'

import React from 'react'

// Captions on video pages: one chunk at a time, timed to the video, in the page's caption look and
// at the spot the author dragged it to (phone and desktop each keep their own).

export type CaptionChunk = { id: string; start: number; end?: number | null; words: string; text?: any }
export type Captions = { chunks?: CaptionChunk[]; look?: { style?: string }; phone?: { x: number; y: number } | null; desktop?: { x: number; y: number } | null; source?: string | null; language?: string | null }

export const CAPTION_LOOKS = [
  { value: 'boxed', label: 'Boxed', help: 'White words on a dark box' },
  { value: 'pop', label: 'Pop', help: 'Big bold words, no box' },
  { value: 'lower', label: 'Lower third', help: 'A band along the bottom' },
]

const DEFAULT_SPOT = { x: 50, y: 82 }

/** The chunk showing at `time`: from its start until its end, or the next chunk's start. */
export function chunkAt(chunks: CaptionChunk[] = [], time = 0): CaptionChunk | null {
  const sorted = [...chunks].sort((a, b) => a.start - b.start)
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const chunk = sorted[index]
    if (time < chunk.start) continue
    const until = chunk.end ?? sorted[index + 1]?.start ?? Infinity
    return time < until + 0.25 ? chunk : null
  }
  return null
}

function StyledWords({ chunk }: { chunk: CaptionChunk }) {
  const paragraph = chunk.text?.content?.[0]
  if (!paragraph?.content) return <>{chunk.words}</>
  return <>{paragraph.content.map((node: any, index: number) => {
    const style: React.CSSProperties = {}
    let text: React.ReactNode = node.text || ''
    for (const mark of node.marks || []) {
      if (mark.type === 'textStyle') Object.assign(style, mark.attrs?.color ? { color: mark.attrs.color } : {}, mark.attrs?.fontSize ? { fontSize: `${Number(mark.attrs.fontSize) / 16}em` } : {})
      if (mark.type === 'bold') text = <b>{text}</b>
      if (mark.type === 'italic') text = <i>{text}</i>
    }
    return <span key={index} style={style}>{text}</span>
  })}</>
}

export function CaptionText({ chunk, look }: { chunk: CaptionChunk; look?: string }) {
  const style = look || 'boxed'
  const className = style === 'pop'
    ? 'text-2xl font-black leading-tight text-white [text-shadow:0_2px_0_rgb(0_0_0/0.85),0_0_12px_rgb(0_0_0/0.6)] sm:text-3xl'
    : style === 'lower'
      ? 'block w-full bg-black/70 px-4 py-2 text-left text-base font-bold text-white'
      : 'rounded-lg bg-black/75 px-3 py-1.5 text-base font-bold leading-snug text-white sm:text-lg'
  return <span key={chunk.id} className={`inline-block motion-safe:animate-[caption-in_180ms_ease-out] ${className}`}><StyledWords chunk={chunk} /></span>
}

function useWide() {
  const [wide, setWide] = React.useState(false)
  React.useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)')
    const update = () => setWide(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return wide
}

/** The learner's captions over a playing video. */
export function CaptionOverlay({ captions, time }: { captions?: Captions | null; time?: number }) {
  const wide = useWide()
  const chunk = chunkAt(captions?.chunks, Number(time) || 0)
  if (!chunk || !chunk.words.trim()) return null
  const look = captions?.look?.style
  const spot = (wide ? captions?.desktop : captions?.phone) || DEFAULT_SPOT
  return (
    <div aria-live="off" className={`pointer-events-none absolute z-10 ${look === 'lower' ? 'inset-x-0' : 'max-w-[86%] -translate-x-1/2 text-center'} -translate-y-1/2`}
      style={look === 'lower' ? { top: `${spot.y}%` } : { left: `${spot.x}%`, top: `${spot.y}%` }}>
      <CaptionText chunk={chunk} look={look} />
    </div>
  )
}
