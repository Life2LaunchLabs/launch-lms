'use client'

import Link from 'next/link'
import React from 'react'
import { Award, CheckCircle, ChevronRight, Pause, Play, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import YouTube from 'react-youtube'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg } from '@services/config/config'
import {
  completeLearningPage,
  startLearningRun,
  submitLearningResponse,
} from '@services/learning/learning'
import toast from 'react-hot-toast'

export function LearningCollectionsBand({ orgslug, collections }: { orgslug: string; collections: any[] }) {
  if (!collections.length) return null
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-lime-600">Learning 2.0</p>
          <h2 className="text-2xl font-black text-gray-950">New badges</h2>
        </div>
      </div>
      <div className="space-y-8">
        {collections.map((collection) => (
          <div key={collection.collection_uuid}>
            <h3 className="mb-3 text-lg font-bold text-gray-900">{collection.name}</h3>
            <div className="flex gap-4 overflow-x-auto pb-3">
              {(collection.badges || []).map((badge: any) => (
                <Link key={badge.badge_uuid} href={getUriWithOrg(orgslug, `/badges/${badge.badge_uuid.replace('badge_', '')}`)} className="block w-44 shrink-0">
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/5">
                    {badge.thumbnail_image ? <img src={badge.thumbnail_image} alt="" className="h-full w-full object-cover" /> : <Award className="h-16 w-16 text-lime-500" />}
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm font-bold text-gray-950">{badge.name}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-gray-500">{badge.description}</p>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function LearningBadgeDetail({ orgslug, badge }: { orgslug: string; badge: any }) {
  return (
    <main className="min-h-screen bg-[#f7faf6] px-5 py-10">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_420px]">
        <div>
          <p className="text-xs font-bold uppercase text-lime-600">Badge</p>
          <h1 className="mt-3 text-5xl font-black leading-tight text-gray-950">{badge.name}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-gray-700">{badge.description || badge.about}</p>
          <div className="mt-8 flex gap-3">
            <Link href={getUriWithOrg(orgslug, `/badges/${badge.badge_uuid.replace('badge_', '')}/path`)} className="inline-flex h-12 items-center gap-2 rounded-lg bg-lime-300 px-6 text-sm font-black text-black hover:bg-lime-400">
              Get started
              <ChevronRight size={18} />
            </Link>
          </div>
          <section className="mt-12">
            <h2 className="text-xl font-bold">Criteria</h2>
            <p className="mt-2 text-gray-600">{badge.criteria || 'Complete the required learning path.'}</p>
          </section>
        </div>
        <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5">
          {badge.thumbnail_image ? <img src={badge.thumbnail_image} alt="" className="h-full w-full object-cover" /> : <Award className="h-32 w-32 text-lime-500" />}
        </div>
      </div>
    </main>
  )
}

export function LearningPathView({ orgslug, badgePath }: { orgslug: string; badgePath: any }) {
  const badge = badgePath.badge
  return (
    <main className="min-h-screen bg-[#f8f8f8] px-5 py-10">
      <div className="mx-auto max-w-4xl">
        <Link href={getUriWithOrg(orgslug, `/badges/${badge.badge_uuid.replace('badge_', '')}`)} className="text-sm font-medium text-gray-500">Badge details</Link>
        <h1 className="mt-3 text-4xl font-black text-gray-950">{badge.name} Path</h1>
        <p className="mt-2 text-gray-600">{badge.description}</p>
        <div className="mt-8 space-y-3">
          {(badgePath.activities || []).map((activity: any, index: number) => (
            <Link key={activity.activity_uuid} href={getUriWithOrg(orgslug, `/badges/${badge.badge_uuid.replace('badge_', '')}/chapter/${activity.activity_uuid.replace('learning_activity_', '')}`)} className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-lime-100 font-black text-lime-700">{index + 1}</div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-bold text-gray-950">{activity.title}</h2>
                <p className="text-sm text-gray-500">{activity.pages?.length || 0} pages</p>
              </div>
              <ChevronRight size={20} />
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}

export function LearningActivityPlayer({ orgslug, badgePath, activity }: { orgslug: string; badgePath: any; activity: any }) {
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const badge = badgePath.badge
  const pages = activity.pages || []
  const [run, setRun] = React.useState<any>(badgePath.run)
  const [index, setIndex] = React.useState(0)
  const [unlocked, setUnlocked] = React.useState(false)
  const [answer, setAnswer] = React.useState<any>({})
  const page = pages[index]

  React.useEffect(() => {
    startLearningRun(badge.badge_uuid, accessToken)
      .then(setRun)
      .catch(() => null)
  }, [badge.badge_uuid, accessToken])

  React.useEffect(() => {
    setUnlocked(page?.page_type === 'info' || page?.page_type === 'question_response')
    setAnswer({})
  }, [page?.page_type, page?.page_uuid])

  const completeAndNext = async () => {
    if (!run || !page) return
    try {
      let nextRun
      if (page.page_type === 'multiple_choice' || page.page_type === 'text_input') {
        nextRun = await submitLearningResponse(run.run_uuid, page.page_uuid, answer, accessToken)
      } else {
        nextRun = await completeLearningPage(run.run_uuid, page.page_uuid, {}, accessToken)
      }
      setRun(nextRun)
      if (index < pages.length - 1) {
        setIndex(index + 1)
      } else {
        window.location.href = getUriWithOrg(orgslug, `/badges/${badge.badge_uuid.replace('badge_', '')}/badge`)
      }
    } catch (error: any) {
      toast.error(error?.message || 'Could not complete page')
    }
  }

  return (
    <LearningActivitySurface
      pages={pages}
      page={page}
      pageIndex={index}
      backHref={getUriWithOrg(orgslug, `/badges/${badge.badge_uuid.replace('badge_', '')}/path`)}
      actionLabel={index === pages.length - 1 ? 'Finish' : 'Continue'}
      actionDisabled={!unlocked}
      onAction={completeAndNext}
      interactionState={answer}
    >
      <LearningPageContent page={page} answer={answer} setAnswer={setAnswer} setUnlocked={setUnlocked} pages={pages} run={run} />
    </LearningActivitySurface>
  )
}

export function LearningActivitySurface({
  pages,
  page,
  pageIndex,
  children,
  backHref,
  onBack,
  actionLabel = 'Continue',
  actionDisabled,
  onAction,
  interactionState,
  className = 'h-dvh',
}: any) {
  const progress = ((pageIndex + 1) / Math.max(1, pages.length)) * 100
  const isVideoPage = page?.page_type === 'video'
  const showVideoControls = isVideoPage && actionDisabled && interactionState?.videoStarted
  const backControl = backHref ? (
    <Link href={backHref} className={`rounded-full p-2 transition ${isVideoPage ? 'text-white hover:bg-white/10' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-950'}`}><X size={20} /></Link>
  ) : (
    <button onClick={onBack} className={`rounded-full p-2 transition ${isVideoPage ? 'text-white hover:bg-white/10' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-950'}`}><X size={20} /></button>
  )

  return (
    <main className={`relative flex flex-col overflow-hidden ${isVideoPage ? 'bg-black' : 'bg-[var(--org-page-background)]'} text-gray-950 ${className}`}>
      <div className="relative z-10 shrink-0 px-4">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-4">
          {backControl}
          <div className={`h-2 flex-1 overflow-hidden rounded-full ${isVideoPage ? 'bg-white/25' : 'bg-gray-200'}`}>
            <div className="h-full rounded-full bg-[var(--org-primary-color)] transition-all" style={{ width: `${progress}%` }} />
          </div>
          <span className={`text-sm font-medium ${isVideoPage ? 'text-white/80' : 'text-gray-500'}`}>{pageIndex + 1}/{Math.max(1, pages.length)}</span>
        </div>
      </div>
      <div className={`${isVideoPage ? 'flex min-h-0 flex-1 items-center justify-center overflow-hidden p-0' : 'min-h-0 flex-1 overflow-y-auto px-5 py-8'}`}>
        <div className={`${isVideoPage ? 'flex h-full w-full items-center justify-center overflow-hidden' : 'mx-auto max-w-2xl overflow-hidden'}`}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={page?.page_uuid || pageIndex}
              className={isVideoPage ? 'flex h-full w-full items-center justify-center' : undefined}
              initial={{ x: 36, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -24, opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {page ? children : <div className="flex min-h-[420px] items-center justify-center text-gray-400">No page selected</div>}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <div className="relative z-10 shrink-0 px-5 py-4">
        <div className="mx-auto flex max-w-2xl justify-center">
          {showVideoControls ? (
            <VideoPlaybackStatus interactionState={interactionState} pageUuid={page?.page_uuid} />
          ) : (
            <button onClick={onAction} disabled={actionDisabled} className="inline-flex h-12 w-full max-w-sm items-center justify-center gap-2 rounded-lg bg-[var(--org-primary-color)] px-5 text-sm font-bold text-white shadow-sm transition hover:brightness-95 disabled:opacity-40 sm:w-auto sm:min-w-40">
              {actionLabel}
              <ChevronRight size={18} />
            </button>
          )}
        </div>
      </div>
    </main>
  )
}

export function LearningPageContent({ page, answer, setAnswer, setUnlocked, pages, run, editable = false, onPagePatch }: any) {
  if (!page) return null
  if (page.page_type === 'video') {
    return <VideoPageContent page={page} answer={answer} setAnswer={setAnswer} setUnlocked={setUnlocked} editable={editable} onPagePatch={onPagePatch} />
  }
  if (page.page_type === 'multiple_choice') {
    const options = page.content?.options || []
    const updateOption = (optionIndex: number, text: string) => {
      const nextOptions = options.length ? [...options] : [{ id: 'a', text: '' }, { id: 'b', text: '' }]
      nextOptions[optionIndex] = { ...(nextOptions[optionIndex] || { id: String(optionIndex) }), text }
      onPagePatch?.({ content: { ...(page.content || {}), options: nextOptions } })
    }
    return <div><p className="text-xs font-bold uppercase text-[var(--org-primary-color)]">Check your knowledge</p><EditableText as="h1" editable={editable} value={page.content?.prompt || ''} placeholder="Question prompt" onChange={(value: string) => onPagePatch?.({ content: { ...(page.content || {}), prompt: value } })} className="mt-3 text-3xl font-bold text-gray-950" /><div className="mt-6 space-y-3">{(options.length ? options : [{ id: 'a', text: '' }, { id: 'b', text: '' }]).map((option: any, index: number) => <button key={option.id || index} onClick={() => { if (!editable) { setAnswer({ option_id: option.id || String(index) }); setUnlocked(true) } }} className={`flex w-full items-center gap-4 rounded-xl border bg-white p-4 text-left shadow-sm transition ${answer?.option_id === (option.id || String(index)) ? 'border-[var(--org-primary-color)] ring-2 ring-[var(--org-primary-color)]' : 'border-gray-200 hover:border-gray-300'}`}><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${answer?.option_id === (option.id || String(index)) ? 'border-[var(--org-primary-color)] bg-[var(--org-primary-color)] text-white' : 'border-gray-200 text-gray-600'}`}>{String.fromCharCode(65 + index)}</span><EditableText editable={editable} value={option.text || ''} placeholder={`Option ${index + 1}`} onChange={(value: string) => updateOption(index, value)} className="min-w-0 flex-1 text-gray-900" /></button>)}</div></div>
  }
  if (page.page_type === 'text_input') {
    return <div><p className="text-xs font-bold uppercase text-[var(--org-primary-color)]">Your turn</p><EditableText as="h1" editable={editable} value={page.content?.prompt || ''} placeholder="Prompt" onChange={(value: string) => onPagePatch?.({ content: { ...(page.content || {}), prompt: value } })} className="mt-3 text-3xl font-bold text-gray-950" /><textarea readOnly={editable} onChange={(event) => { setAnswer({ text: event.target.value }); setUnlocked(event.target.value.trim().length > 0) }} placeholder={editable ? 'Learners will write here' : undefined} className="mt-6 min-h-36 w-full resize-none rounded-xl border border-gray-200 bg-white p-4 text-gray-950 outline-none shadow-sm placeholder:text-gray-400 focus:border-[var(--org-primary-color)] focus:ring-2 focus:ring-[var(--org-primary-color)]" /></div>
  }
  if (page.page_type === 'question_response') {
    const linkedUuid = page.content?.linked_page_uuid
    const variants = page.content?.variants || {}
    const linkedPage = pages.find((item: any) => item.page_uuid === linkedUuid)
    const attempt = (run?.attempts || []).filter((item: any) => item.result?.page_uuid === linkedPage?.page_uuid).at(-1)
    const variant = variants[attempt?.feedback_key] || variants[attempt?.is_correct ? 'correct' : 'incorrect'] || variants.default || {}
    return <div><CheckCircle className="mb-6 h-14 w-14 text-[var(--org-primary-color)]" /><EditableText as="h1" editable={editable} value={variant.title || ''} placeholder="Response title" onChange={(value: string) => onPagePatch?.({ content: { ...(page.content || {}), variants: { ...(page.content?.variants || {}), default: { ...(page.content?.variants?.default || {}), title: value } } } })} className="text-3xl font-bold text-gray-950" /><EditableText editable={editable} multiline value={variant.body || page.content?.body || ''} placeholder="Feedback body" onChange={(value: string) => onPagePatch?.({ content: { ...(page.content || {}), body: value, variants: { ...(page.content?.variants || {}), default: { ...(page.content?.variants?.default || {}), body: value } } } })} className="mt-4 whitespace-pre-wrap text-lg leading-8 text-gray-600" /></div>
  }
  return <div><EditableText as="h1" editable={editable} value={page.content?.heading || ''} placeholder="Page heading" onChange={(value: string) => onPagePatch?.({ content: { ...(page.content || {}), heading: value } })} className="text-3xl font-bold text-gray-950" /><EditableText editable={editable} multiline value={page.content?.body || ''} placeholder="Add page content..." onChange={(value: string) => onPagePatch?.({ content: { ...(page.content || {}), body: value } })} className="mt-5 whitespace-pre-wrap text-lg leading-8 text-gray-600" /></div>
}

function VideoPageContent({ page, answer, setAnswer, setUnlocked, editable, onPagePatch }: any) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const youtubePlayerRef = React.useRef<any>(null)
  const videoUrl = page.content?.video_url || ''
  const videoTitle = page.content?.heading || ''
  const youtubeId = React.useMemo(() => getYouTubeId(videoUrl), [videoUrl])
  const toggleEventName = `learning-video-toggle-${page.page_uuid}`

  React.useEffect(() => {
    if (editable) return
    setUnlocked(false)
    setAnswer?.({ videoStarted: Boolean(videoUrl), videoProgress: 0, videoCurrentTime: 0, videoDuration: 0, videoPlaying: true })
  }, [editable, page.page_uuid, setAnswer, setUnlocked, videoUrl])

  React.useEffect(() => {
    if (editable) return

    const togglePlayback = () => {
      const video = videoRef.current
      if (video) {
        if (video.paused) void video.play()
        else video.pause()
        return
      }

      const youtubePlayer = youtubePlayerRef.current
      if (!youtubePlayer) return
      if (youtubePlayer.getPlayerState?.() === 1) youtubePlayer.pauseVideo?.()
      else youtubePlayer.playVideo?.()
    }

    window.addEventListener(toggleEventName, togglePlayback)
    return () => window.removeEventListener(toggleEventName, togglePlayback)
  }, [editable, toggleEventName])

  React.useEffect(() => {
    if (editable || !youtubeId) return
    const interval = window.setInterval(() => {
      const player = youtubePlayerRef.current
      if (!player) return
      const duration = player.getDuration?.() || 0
      const current = player.getCurrentTime?.() || 0
      const playerState = player.getPlayerState?.()
      setAnswer?.({
        videoStarted: true,
        videoProgress: duration > 0 ? current / duration : 0,
        videoCurrentTime: current,
        videoDuration: duration,
        videoPlaying: playerState === 1,
      })
    }, 500)

    return () => window.clearInterval(interval)
  }, [editable, setAnswer, youtubeId])

  if (editable) {
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-black">
        <div className="absolute left-5 right-5 top-5 z-10 mx-auto max-w-2xl">
          <EditableText
            as="h1"
            editable
            value={videoTitle}
            placeholder="Optional video title"
            onChange={(value: string) => onPagePatch?.({ content: { ...(page.content || {}), heading: value } })}
            className="text-3xl font-bold text-white drop-shadow"
          />
        </div>
        <div className="flex h-full w-full items-center justify-center overflow-hidden bg-black">
          {videoUrl ? (
            youtubeId ? (
              <div className="flex aspect-video max-h-full w-full items-center justify-center bg-zinc-900 text-sm font-medium text-white/70">YouTube video preview</div>
            ) : (
              <video src={videoUrl} className="h-full w-full object-contain" muted preload="metadata" />
            )
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-black text-sm font-medium text-white/60">
              Add a video URL in the sidebar
            </div>
          )}
        </div>
      </div>
    )
  }

  const updateNativeProgress = () => {
    const video = videoRef.current
    if (!video) return
    const duration = Number.isFinite(video.duration) ? video.duration : 0
    const current = video.currentTime || 0
    setAnswer?.({
      videoStarted: true,
      videoProgress: duration > 0 ? current / duration : 0,
      videoCurrentTime: current,
      videoDuration: duration,
      videoPlaying: !video.paused,
    })
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-black">
      {videoTitle && (
        <h1 className="absolute left-5 right-5 top-5 z-10 mx-auto max-w-2xl text-3xl font-bold text-white drop-shadow">
          {videoTitle}
        </h1>
      )}
      <div className="flex h-full w-full items-center justify-center overflow-hidden bg-black">
        {youtubeId ? (
          <YouTube
            className="aspect-video max-h-full w-full"
            iframeClassName="h-full w-full"
            videoId={youtubeId}
          opts={{
            width: '100%',
            height: '100%',
            playerVars: { autoplay: 1, controls: 0, modestbranding: 1, rel: 0 },
          }}
          onReady={(event) => {
            youtubePlayerRef.current = event.target
            event.target.playVideo?.()
          }}
          onPlay={() => setAnswer?.({ ...(answer || {}), videoStarted: true, videoPlaying: true })}
          onPause={() => setAnswer?.({ ...(answer || {}), videoStarted: true, videoPlaying: false })}
          onEnd={() => {
            setUnlocked(true)
            setAnswer?.({ ...(answer || {}), videoStarted: false, videoProgress: 1, videoPlaying: false })
            }}
          />
        ) : videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            autoPlay
            playsInline
            className="h-full w-full object-contain"
            onPlay={updateNativeProgress}
            onPause={updateNativeProgress}
            onTimeUpdate={updateNativeProgress}
            onLoadedMetadata={updateNativeProgress}
            onEnded={() => {
              setUnlocked(true)
              setAnswer?.({
                videoStarted: false,
                videoProgress: 1,
                videoCurrentTime: videoRef.current?.duration || 0,
                videoDuration: videoRef.current?.duration || 0,
                videoPlaying: false,
              })
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-medium text-white/60">
            No video added yet
          </div>
        )}
      </div>
    </div>
  )
}

function VideoPlaybackStatus({ interactionState, pageUuid }: { interactionState: any; pageUuid?: string }) {
  const progress = Math.max(0, Math.min(1, interactionState?.videoProgress || 0))
  return (
    <div className="w-full max-w-2xl text-white drop-shadow">
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/30">
        <div className="h-full rounded-full bg-white transition-all" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="flex items-center gap-4">
        <button
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

function getYouTubeId(url: string) {
  if (!url) return ''
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([^?&/]+)/)
  return match?.[1] || ''
}

function formatTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const minutes = Math.floor(safeSeconds / 60)
  const remaining = Math.floor(safeSeconds % 60)
  return `${minutes}:${String(remaining).padStart(2, '0')}`
}

function EditableMediaPlaceholder({ editable, page, onPagePatch }: any) {
  if (!editable) return <div className="aspect-video rounded-xl bg-gray-200" />
  return (
    <label className="block aspect-video rounded-xl border border-dashed border-gray-300 bg-white p-5">
      <span className="text-xs font-bold uppercase text-gray-400">Media URL</span>
      <input value={page.content?.video_url || ''} onChange={(event) => onPagePatch?.({ content: { ...(page.content || {}), video_url: event.target.value } })} placeholder="Paste a video URL" className="mt-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-950 outline-none placeholder:text-gray-400 focus:border-[var(--org-primary-color)] focus:ring-2 focus:ring-[var(--org-primary-color)]" />
    </label>
  )
}

function EditableText({ as = 'div', editable, value, placeholder, onChange, className, multiline = false }: any) {
  const Element = as
  const ref = React.useRef<HTMLElement | null>(null)
  const valueRef = React.useRef(value || '')

  React.useEffect(() => {
    valueRef.current = value || ''
    if (ref.current && document.activeElement !== ref.current && ref.current.innerText !== valueRef.current) {
      ref.current.innerText = valueRef.current
    }
  }, [value])

  if (!editable) return <Element className={className}>{value || placeholder}</Element>

  return (
    <Element
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={placeholder}
      data-placeholder={placeholder}
      onInput={(event: React.FormEvent<HTMLElement>) => {
        valueRef.current = event.currentTarget.innerText
      }}
      onBlur={() => onChange?.(valueRef.current.trim())}
      onKeyDown={(event: React.KeyboardEvent<HTMLElement>) => {
        if (!multiline && event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
      className={`${className || ''} rounded-md outline-none transition focus:bg-white focus:ring-2 focus:ring-[var(--org-primary-color)] empty:before:text-gray-400 empty:before:content-[attr(data-placeholder)]`}
    />
  )
}
