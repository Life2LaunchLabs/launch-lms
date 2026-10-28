'use client'

/* eslint-disable no-unused-vars */

import React from 'react'
import YouTube from 'react-youtube'
import toast from 'react-hot-toast'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Captions as CaptionsIcon, Loader2, Merge, Plus, Scissors, Trash2, Upload } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { LearningTextStyle } from '@components/Learning/textMarks'
import { CAPTION_LOOKS, CaptionText, chunkAt, type CaptionChunk, type Captions } from '@components/Learning/player/Captions'
import { generateLearningCaptions } from '@services/learning/learning'

// A video page on the canvas: the video with its captions over it (drag them to move them; phone
// and desktop each keep their own spot), and under it one card per caption to fix words and
// timing, split, merge and style with the toolbar.

const id = () => `cap_${Math.random().toString(36).slice(2, 12)}`
const youTubeId = (url: string) => String(url || '').match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([^?&/]+)/)?.[1] || ''
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`
const seconds = (value: string) => {
  const [minutes, rest] = value.includes(':') ? value.split(':') : ['0', value]
  const total = Number(minutes) * 60 + Number(rest)
  return Number.isFinite(total) && total >= 0 ? Math.round(total * 10) / 10 : null
}

export function VideoCaptionsCanvas({ page, device, onRequestVideo, onPatchPage, onTextEditorReady }: { page: any; device: 'mobile' | 'desktop'; onRequestVideo: () => void; onPatchPage: (patch: any) => void; onTextEditorReady?: (editor: any) => void }) {
  const session = useLHSession() as any
  const content = page.content || {}
  const videoUrl = content.video_url || ''
  const youtube = youTubeId(videoUrl)
  const captions: Captions = content.captions || {}
  const chunks: CaptionChunk[] = captions.chunks || []
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const stageRef = React.useRef<HTMLDivElement | null>(null)
  const [time, setTime] = React.useState(0)
  const [selected, setSelected] = React.useState<string | null>(null)
  const [making, setMaking] = React.useState(false)
  const spotKey = device === 'desktop' ? 'desktop' : 'phone'
  const spot = captions[spotKey] || { x: 50, y: 82 }
  const shown = chunks.find((chunk) => chunk.id === selected) || chunkAt(chunks, time) || chunks[0]

  const save = (next: Partial<Captions>, source = 'edited') => onPatchPage({ content: { ...content, captions: { ...captions, ...next, source: next.chunks ? source : captions.source } } })
  const setChunks = (next: CaptionChunk[]) => save({ chunks: [...next].sort((a, b) => a.start - b.start) })
  const patchChunk = (chunkId: string, patch: Partial<CaptionChunk>) => setChunks(chunks.map((chunk) => chunk.id === chunkId ? { ...chunk, ...patch } : chunk))
  const seek = (start: number) => { if (videoRef.current) videoRef.current.currentTime = start; setTime(start) }

  const make = async () => {
    setMaking(true)
    try {
      const made = await generateLearningCaptions(page.page_uuid, session.data?.tokens?.access_token)
      onPatchPage({ content: { ...content, captions: { ...captions, ...made } } })
      toast.success(`${made.chunks?.length || 0} captions made. Check the words, then you're done.`)
    } catch (error: any) {
      toast.error(error?.message || 'Could not make captions')
    } finally {
      setMaking(false)
    }
  }
  const add = () => {
    const chunk = { id: id(), start: Math.round(time * 10) / 10, words: '' }
    setChunks([...chunks, chunk])
    setSelected(chunk.id)
  }
  const split = (chunk: CaptionChunk, at: number) => {
    const words = chunk.words
    if (at <= 0 || at >= words.length) return
    const index = chunks.findIndex((item) => item.id === chunk.id)
    const until = chunk.end ?? chunks[index + 1]?.start ?? chunk.start + 2
    const middle = Math.round((chunk.start + (until - chunk.start) * (at / words.length)) * 10) / 10
    const second = { id: id(), start: middle, end: chunk.end ?? null, words: words.slice(at).trim() }
    setChunks([...chunks.filter((item) => item.id !== chunk.id), { ...chunk, end: middle, words: words.slice(0, at).trim(), text: null }, second])
  }
  const merge = (chunk: CaptionChunk) => {
    const index = chunks.findIndex((item) => item.id === chunk.id)
    const next = chunks[index + 1]
    if (!next) return
    setChunks([...chunks.filter((item) => item.id !== chunk.id && item.id !== next.id), { ...chunk, end: next.end ?? null, words: `${chunk.words} ${next.words}`.trim(), text: null }])
  }

  // Drag the caption to move it, as a percent of the video area.
  const drag = (event: React.PointerEvent) => {
    const stage = stageRef.current
    if (!stage) return
    event.preventDefault()
    const box = stage.getBoundingClientRect()
    let last = spot
    const move = (moved: PointerEvent) => {
      last = { x: Math.round(Math.max(5, Math.min(95, ((moved.clientX - box.left) / box.width) * 100))), y: Math.round(Math.max(5, Math.min(95, ((moved.clientY - box.top) / box.height) * 100))) }
      stage.style.setProperty('--cap-x', `${last.x}%`)
      stage.style.setProperty('--cap-y', `${last.y}%`)
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); save({ [spotKey]: last }) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="flex h-full w-full flex-col bg-black text-white">
      <div ref={stageRef} className="relative min-h-0 flex-[3] overflow-hidden" style={{ ['--cap-x' as any]: `${spot.x}%`, ['--cap-y' as any]: `${spot.y}%` }}>
        {youtube ? (
          <div className="pointer-events-none h-full w-full"><YouTube videoId={youtube} className="h-full" iframeClassName="h-full w-full" opts={{ height: '100%', width: '100%', playerVars: { controls: 0, playsinline: 1 } }} /></div>
        ) : videoUrl ? (
          <video ref={videoRef} src={videoUrl} controls muted preload="metadata" className="h-full w-full object-contain" onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
            onLoadedMetadata={(event) => { const duration = Math.round(event.currentTarget.duration || 0); if (duration > 0 && duration !== Number(content.video_duration_seconds || 0)) onPatchPage({ content: { ...content, video_duration_seconds: duration } }) }} />
        ) : (
          <button type="button" onClick={onRequestVideo} className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm font-bold text-white/60 hover:text-white"><Upload size={20} />Choose a video</button>
        )}
        {shown && shown.words.trim() && (
          <div role="button" tabIndex={-1} aria-label="Drag to move the captions" title={`Drag to move. ${device === 'desktop' ? 'Desktop' : 'Phone'} keeps its own spot.`} onPointerDown={drag}
            className={`absolute z-10 cursor-move -translate-y-1/2 ${captions.look?.style === 'lower' ? 'inset-x-0' : 'max-w-[86%] -translate-x-1/2 text-center'} outline-dashed outline-1 outline-offset-4 outline-white/40`}
            style={captions.look?.style === 'lower' ? { top: 'var(--cap-y)' } : { left: 'var(--cap-x)', top: 'var(--cap-y)' }}>
            <CaptionText chunk={shown} look={captions.look?.style} />
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-[2] flex-col border-t border-white/10 bg-neutral-950">
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-3 py-2 text-xs">
          <span className="mr-auto inline-flex items-center gap-1.5 font-bold"><CaptionsIcon size={14} />Captions{chunks.length ? ` · ${chunks.length}` : ''}</span>
          {videoUrl && !youtube && <button type="button" onClick={() => void make()} disabled={making} className="inline-flex h-7 items-center gap-1.5 rounded-md bg-white px-2.5 font-bold text-black disabled:opacity-60">{making ? <Loader2 size={13} className="animate-spin" /> : <CaptionsIcon size={13} />}{making ? 'Listening…' : chunks.length ? 'Make again' : 'Make captions'}</button>}
          <select aria-label="Caption look" value={captions.look?.style || 'boxed'} onChange={(event) => save({ look: { ...(captions.look || {}), style: event.target.value } })} className="h-7 rounded-md border border-white/15 bg-transparent px-1.5 font-bold">
            {CAPTION_LOOKS.map((look) => <option key={look.value} value={look.value} className="text-black">{look.label}</option>)}
          </select>
          <button type="button" onClick={add} title="Add a caption at the current time" className="inline-flex h-7 items-center gap-1 rounded-md border border-white/15 px-2 font-bold"><Plus size={13} />Caption</button>
        </div>
        <ol className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
          {!chunks.length && <li className="py-4 text-center text-xs text-white/50">{youtube ? 'YouTube videos keep their own captions. You can still add your own.' : 'No captions yet. Make them from the video, or add your own.'}</li>}
          {chunks.map((chunk, index) => (
            <CaptionCard key={chunk.id} chunk={chunk} number={index + 1} selected={selected === chunk.id} last={index === chunks.length - 1}
              onSelect={() => { setSelected(chunk.id); seek(chunk.start) }} onPatch={(patch) => patchChunk(chunk.id, patch)}
              onSplit={(at) => split(chunk, at)} onMerge={() => merge(chunk)} onRemove={() => setChunks(chunks.filter((item) => item.id !== chunk.id))}
              onTextEditorReady={onTextEditorReady} />
          ))}
        </ol>
      </div>
    </div>
  )
}

function CaptionCard({ chunk, number, selected, last, onSelect, onPatch, onSplit, onMerge, onRemove, onTextEditorReady }: {
  chunk: CaptionChunk; number: number; selected: boolean; last: boolean; onSelect: () => void; onPatch: (patch: Partial<CaptionChunk>) => void
  onSplit: (at: number) => void; onMerge: () => void; onRemove: () => void; onTextEditorReady?: (editor: any) => void
}) {
  const [start, setStart] = React.useState(clock(chunk.start))
  React.useEffect(() => setStart(clock(chunk.start)), [chunk.start])
  const editorRef = React.useRef<any>(null)
  return (
    <li onMouseDown={selected ? undefined : onSelect} className={`grid grid-cols-[3.6rem_1fr_auto] items-start gap-2 rounded-lg border px-2 py-1.5 ${selected ? 'border-sky-400 bg-white/10' : 'border-white/10 hover:border-white/25'}`}>
      <input value={start} aria-label={`Caption ${number} starts at`} onChange={(event) => setStart(event.target.value)} onBlur={() => { const value = seconds(start); if (value != null) onPatch({ start: value }); else setStart(clock(chunk.start)) }}
        className="h-6 w-full rounded bg-transparent px-1 font-mono text-[11px] text-white/60 outline-none focus:bg-white/10" />
      {selected ? <CaptionWords chunk={chunk} onPatch={onPatch} editorRef={editorRef} onTextEditorReady={onTextEditorReady} />
        : <p className="min-h-6 py-0.5 text-[13px] leading-snug">{chunk.words || <span className="text-white/40">Empty</span>}</p>}
      <span className="flex items-center gap-0.5 text-white/60">
        {selected && <button type="button" title="Split at the cursor" aria-label="Split at the cursor" onMouseDown={(event) => event.preventDefault()} onClick={() => onSplit(editorRef.current ? editorRef.current.state.selection.from - 1 : 0)} className="rounded p-1 hover:bg-white/10 hover:text-white"><Scissors size={13} /></button>}
        {selected && !last && <button type="button" title="Merge with the next caption" aria-label="Merge with the next caption" onClick={onMerge} className="rounded p-1 hover:bg-white/10 hover:text-white"><Merge size={13} /></button>}
        {selected && <button type="button" title="Delete caption" aria-label="Delete caption" onClick={onRemove} className="rounded p-1 hover:bg-white/10 hover:text-red-300"><Trash2 size={13} /></button>}
      </span>
    </li>
  )
}

/** The selected caption's words, styled with the toolbar's text tools like any text block. */
function CaptionWords({ chunk, onPatch, editorRef, onTextEditorReady }: { chunk: CaptionChunk; onPatch: (patch: Partial<CaptionChunk>) => void; editorRef: React.MutableRefObject<any>; onTextEditorReady?: (editor: any) => void }) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({ heading: false, bulletList: false, orderedList: false, blockquote: false, codeBlock: false, horizontalRule: false, trailingNode: false }), LearningTextStyle],
    content: chunk.text || { type: 'doc', content: [{ type: 'paragraph', content: chunk.words ? [{ type: 'text', text: chunk.words }] : [] }] },
    editorProps: { attributes: { class: 'min-h-6 py-0.5 text-[13px] leading-snug outline-none', 'aria-label': 'Caption words' }, handleKeyDown: (_view, event) => event.key === 'Enter' },
    onUpdate: ({ editor: current }) => {
      const json = current.getJSON()
      const styled = JSON.stringify(json).includes('"marks"')
      onPatch({ words: current.getText().replace(/\s+/g, ' ').trim(), text: styled ? json : null })
    },
  }, [chunk.id])
  React.useEffect(() => {
    editorRef.current = editor
    if (!editor) return
    onTextEditorReady?.(editor)
    const frame = requestAnimationFrame(() => editor.commands.focus('end'))
    return () => { cancelAnimationFrame(frame); onTextEditorReady?.(null) }
  }, [editor, editorRef, onTextEditorReady])
  return <EditorContent editor={editor} />
}
