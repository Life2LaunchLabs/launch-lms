import React from 'react'
import { Pause, Play } from 'lucide-react'

/** The big play button over a paused video page. A blocked autoplay leaves the video paused, so this is how it starts (FEED-113). */
export function VideoPlayButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      data-video-play
      aria-label="Play video"
      onClick={onClick}
      className="absolute left-1/2 top-1/2 z-10 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white shadow-lg ring-1 ring-white/30 backdrop-blur transition hover:bg-black/70"
    >
      <Play size={30} fill="currentColor" className="ml-1" />
    </button>
  )
}

export function VideoPlaybackStatus({ interactionState, pageUuid, allowScrubbing = true }: { interactionState: any; pageUuid?: string; allowScrubbing?: boolean }) {
  const progress = Math.max(0, Math.min(1, interactionState?.videoProgress || 0))
  const seekFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!allowScrubbing || !pageUuid) return
    const rect = event.currentTarget.getBoundingClientRect()
    const nextProgress = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)))
    window.dispatchEvent(new CustomEvent(`learning-video-seek-${pageUuid}`, { detail: { progress: nextProgress } }))
  }

  const startScrub = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!allowScrubbing || !pageUuid) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    seekFromPointer(event)
  }

  return (
    <div className="w-full max-w-2xl text-white drop-shadow">
      <div
        className={`relative mb-4 h-4 rounded-full ${allowScrubbing ? 'cursor-pointer touch-none' : ''}`}
        onPointerDown={startScrub}
        onPointerMove={(event) => {
          if (event.buttons !== 1) return
          seekFromPointer(event)
        }}
        title={allowScrubbing ? 'Seek video' : 'Seeking disabled'}
      >
        <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-white/30">
          <div className="h-full rounded-full bg-card transition-all" style={{ width: `${progress * 100}%` }} />
        </div>
        {allowScrubbing && (
          <div
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-card shadow"
            style={{ left: `${progress * 100}%` }}
          />
        )}
      </div>
      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-label={interactionState?.videoPlaying ? 'Pause video' : 'Play video'}
          onClick={() => pageUuid && window.dispatchEvent(new Event(`learning-video-toggle-${pageUuid}`))}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25"
        >
          {interactionState?.videoPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
        </button>
        <span className="text-sm font-bold">
          {formatTime(interactionState?.videoCurrentTime || 0)} / {formatTime(interactionState?.videoDuration || 0)}
        </span>
      </div>
    </div>
  )
}

function formatTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const minutes = Math.floor(safeSeconds / 60)
  const remaining = Math.floor(safeSeconds % 60)
  return `${minutes}:${String(remaining).padStart(2, '0')}`
}
