'use client'

import React from 'react'
import { MessageSquarePlus, Monitor, RotateCcw, Send, Smartphone, X } from 'lucide-react'
import { getLearningPreview, stepLearningPreview } from '@services/learning/activityDocuments'
import { DEVICE_FRAMES, MOBILE_FRAME_CAP } from '@components/Learning/editor/constants'
import type { DeviceMode } from '@components/Learning/editor/types'
import { ActivityPlayer, type ActivityPlayerEvent, type ActivityRuntime } from './ActivityPlayer'

export type PreviewEvent =
  | (ActivityPlayerEvent & { answer_summary?: string })
  | { type: 'ready'; activity_title: string; page_count: number }
  | { type: 'restarted' }
  | { type: 'feedback'; page_uuid?: string; page_title?: string; text: string }

// One preview experience for every surface: the editor's preview button, a
// shared preview link, and Claude's inline preview all render this component
// against a preview session, so they always show the same thing.
export function ActivityPreview({
  token,
  onClose,
  onEvent,
  allowFeedback = false,
  initialDevice = 'mobile',
  dark = true,
}: {
  token: string
  onClose?: () => void
  // eslint-disable-next-line no-unused-vars
  onEvent?: (event: PreviewEvent) => void
  allowFeedback?: boolean
  initialDevice?: DeviceMode
  dark?: boolean
}) {
  const [preview, setPreview] = React.useState<any>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [device, setDevice] = React.useState<DeviceMode>(initialDevice)
  const [attempt, setAttempt] = React.useState(0)
  const [finishedRun, setFinishedRun] = React.useState<any>(null)
  const [currentPage, setCurrentPage] = React.useState<{ uuid?: string; title?: string }>({})
  const stateRef = React.useRef<any>(null)
  const stageRef = React.useRef<HTMLDivElement>(null)
  const [stage, setStage] = React.useState({ width: 0, height: 0 })
  const emit = React.useRef(onEvent)
  React.useEffect(() => { emit.current = onEvent }, [onEvent])

  React.useEffect(() => {
    let cancelled = false
    getLearningPreview(token)
      .then((payload) => {
        if (cancelled) return
        stateRef.current = payload.state
        setPreview(payload)
        emit.current?.({ type: 'ready', activity_title: payload.activity?.title, page_count: payload.activity?.pages?.length || 0 })
      })
      .catch((reason: any) => !cancelled && setError(reason?.message || 'This preview could not be loaded.'))
    return () => { cancelled = true }
  }, [token])

  React.useEffect(() => {
    const element = stageRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setStage({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(element)
    return () => observer.disconnect()
  }, [preview])

  const runtime = React.useMemo<ActivityRuntime>(() => {
    const step = async (action: 'submit' | 'complete', pageUuid: string, answer?: any) => {
      const next = await stepLearningPreview(token, { action, page_uuid: pageUuid, answer, state: stateRef.current })
      stateRef.current = next.state
      return next.run
    }
    return {
      submit: (pageUuid, answer) => step('submit', pageUuid, answer),
      complete: (pageUuid) => step('complete', pageUuid),
    }
  }, [token])

  const restart = () => {
    stateRef.current = preview?.state
    setFinishedRun(null)
    setAttempt((value) => value + 1)
    emit.current?.({ type: 'restarted' })
  }

  const handleEvent = (event: ActivityPlayerEvent) => {
    if (event.type === 'page_viewed') setCurrentPage({ uuid: event.page_uuid, title: event.page_title })
    if (event.type === 'answer_submitted') {
      const page = preview?.activity?.pages?.find((item: any) => item.page_uuid === event.page_uuid)
      emit.current?.({ ...event, run: undefined, answer_summary: describeAnswer(page, event.answer) })
      return
    }
    emit.current?.(event)
  }

  const frame = DEVICE_FRAMES[device]
  const shellHeight = device === 'mobile' ? frame.height + MOBILE_FRAME_CAP * 2 : frame.height
  const scale = stage.width && stage.height ? Math.min(1, (stage.width - 32) / frame.width, (stage.height - 24) / shellHeight) : 1
  const tone = dark
    ? { bar: 'border-white/10 bg-white/10 text-white', muted: 'text-white/60', button: 'bg-white/10 text-white hover:bg-white/20', active: 'bg-white text-zinc-950', idle: 'text-white/70 hover:bg-white/10' }
    : { bar: 'border-zinc-200 bg-white text-zinc-900', muted: 'text-zinc-500', button: 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200', active: 'bg-zinc-900 text-white', idle: 'text-zinc-600 hover:bg-zinc-100' }

  if (error) {
    return <div className={`flex h-full items-center justify-center p-6 text-center text-sm ${tone.muted}`}>{error}</div>
  }
  if (!preview) {
    return <div className={`flex h-full items-center justify-center text-sm ${tone.muted}`}>Loading preview…</div>
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3">
      <div className={`flex shrink-0 flex-wrap items-center gap-2 rounded-xl border px-3 py-2 ${tone.bar}`}>
        <span className="rounded-md bg-amber-400 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-amber-950">Preview</span>
        <span className="min-w-0 flex-1 truncate text-sm font-bold">{preview.activity?.title}</span>
        <div className="flex items-center gap-1 rounded-lg p-0.5">
          {(['mobile', 'desktop'] as DeviceMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={device === mode}
              onClick={() => setDevice(mode)}
              className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-bold transition ${device === mode ? tone.active : tone.idle}`}
            >
              {mode === 'mobile' ? <Smartphone size={14} /> : <Monitor size={14} />}
              <span className="hidden sm:inline">{mode === 'mobile' ? 'Mobile' : 'Desktop'}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={restart} className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold ${tone.button}`} title="Start over">
          <RotateCcw size={14} /> <span className="hidden sm:inline">Restart</span>
        </button>
        {allowFeedback && <FeedbackButton tone={tone} page={currentPage} onSend={(text) => emit.current?.({ type: 'feedback', page_uuid: currentPage.uuid, page_title: currentPage.title, text })} />}
        {onClose && (
          <button type="button" onClick={onClose} className={`rounded-lg p-2 ${tone.button}`} title="Close preview">
            <X size={16} />
          </button>
        )}
      </div>
      <div ref={stageRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <div
          style={{ width: frame.width, height: shellHeight, minWidth: frame.width, minHeight: shellHeight, transform: `scale(${scale})`, transformOrigin: 'center center' }}
          className={`${device === 'mobile' ? 'rounded-[2rem] bg-black p-[10px]' : 'rounded-xl bg-white'} relative shrink-0 shadow-2xl ring-8 ring-black/5`}
        >
          <div
            data-learning-preview-frame
            className={`${device === 'mobile' ? 'rounded-[1.45rem]' : 'rounded-xl'} relative overflow-hidden bg-[var(--org-page-background)]`}
            style={device === 'mobile' ? { height: frame.height, marginTop: MOBILE_FRAME_CAP - 10 } : { height: frame.height }}
          >
            <ActivityPlayer
              key={attempt}
              activity={preview.activity}
              initialRun={preview.run}
              runtime={runtime}
              className="h-full"
              finishLabel="Finish preview"
              onClose={onClose || restart}
              onFinish={setFinishedRun}
              onEvent={handleEvent}
              contentMediaOwner={preview.badge ? { type: 'org', id: Number(preview.badge.org_id) } : undefined}
            />
            {finishedRun && <PreviewSummary activity={preview.activity} run={finishedRun} onRestart={restart} />}
          </div>
        </div>
      </div>
    </div>
  )
}

// A readable version of an answer (option labels, typed text) for chat context.
function describeAnswer(page: any, answer: any): string {
  const questions = (page?.content?.blocks || []).filter((block: any) => block?.type === 'question')
  const parts = questions.map((question: any) => {
    const sub = answer?.questions?.[question.id] || (questions.length === 1 ? answer : {}) || {}
    const options = new Map((question.content?.options || []).map((option: any) => [String(option.id), option.text]))
    const chosen = (sub.option_ids || []).map((id: any) => options.get(String(id)) || id)
    const typed = Object.values(sub.inputs || {}).map((value: any) => value?.text).filter(Boolean)
    return [...chosen, ...typed].join(', ')
  })
  return parts.filter(Boolean).join(' | ')
}

function PreviewSummary({ activity, run, onRestart }: { activity: any; run: any; onRestart: () => void }) {
  const navigation = (run?.navigation?.activities || [])[0]
  const titles = (navigation?.path || []).map((uuid: string) => activity.pages.find((page: any) => page.page_uuid === uuid)?.title).filter(Boolean)
  const result = run?.result
  const graded = result && Number(result.max_score) > 0
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--org-page-background)] p-6">
      <div className="w-full max-w-sm text-center">
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Preview complete</p>
        <h2 className="mt-2 text-2xl font-black text-foreground">{activity.title}</h2>
        {graded ? (
          <p className={`mt-3 text-sm font-bold ${result.passed ? 'text-emerald-700' : 'text-rose-700'}`}>
            {result.passed ? 'Passed' : 'Not passed'} · {result.score_percent}% (needs {result.grading?.minimum_score_percent}%)
          </p>
        ) : result?.pending_manual_grades ? (
          <p className="mt-3 text-sm font-bold text-amber-700">Waiting for manual grading</p>
        ) : null}
        <ol className="mt-5 space-y-1 text-left text-sm text-muted-foreground">
          {titles.map((title: string, index: number) => (
            <li key={`${title}-${index}`} className="flex gap-2"><span className="font-bold text-foreground">{index + 1}.</span>{title}</li>
          ))}
        </ol>
        <button type="button" onClick={onRestart} className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--org-primary-color)] px-5 text-sm font-bold text-white">
          <RotateCcw size={16} /> Try another path
        </button>
      </div>
    </div>
  )
}

// eslint-disable-next-line no-unused-vars
function FeedbackButton({ tone, page, onSend }: { tone: any; page: { title?: string }; onSend: (text: string) => void }) {
  const [open, setOpen] = React.useState(false)
  const [text, setText] = React.useState('')
  const send = () => {
    const value = text.trim()
    if (!value) return
    onSend(value)
    setText('')
    setOpen(false)
  }
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)} className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold ${tone.button}`} title="Send a note about this page">
        <MessageSquarePlus size={14} /> <span className="hidden sm:inline">Note</span>
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-30 w-72 rounded-xl border border-zinc-200 bg-white p-3 text-zinc-900 shadow-xl">
          <label className="text-xs font-bold text-zinc-500" htmlFor="preview-feedback">About “{page.title || 'this page'}”</label>
          <textarea
            id="preview-feedback"
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) send() }}
            placeholder="What should change here?"
            className="mt-1 h-20 w-full resize-none rounded-lg border border-zinc-200 p-2 text-sm outline-none focus:border-zinc-400"
          />
          <button type="button" onClick={send} className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-900 text-xs font-bold text-white">
            <Send size={13} /> Send to chat
          </button>
        </div>
      )}
    </div>
  )
}
