'use client'

import React from 'react'
import toast from 'react-hot-toast'
import {
  isQuestionResponseRequired,
  LearningActivitySurface,
  LearningPageContent,
} from '@components/Learning/LearningBadgeViews'

// The learner runtime behind a player: the live run API for learners, or the
// side-effect-free preview API for admins and the Claude connector. Both return
// the same run shape (attempts, navigation, render_context), so one player
// renders both and a preview behaves exactly like the real activity.
export interface ActivityRuntime {
  start?: () => Promise<any>
  // eslint-disable-next-line no-unused-vars
  submit: (pageUuid: string, answer: any) => Promise<any>
  // eslint-disable-next-line no-unused-vars
  complete: (pageUuid: string) => Promise<any>
}

export interface ActivityPlayerEvent {
  type: 'page_viewed' | 'answer_submitted' | 'finished' | 'error'
  page_uuid?: string
  page_title?: string
  page_index?: number
  answer?: any
  run?: any
  message?: string
}

export function getSubmittedActivityStatus(run: any, activity: any): 'pending' | 'failed' | 'completed' {
  const pageIds = new Set((activity.pages || []).map((page: any) => page.page_uuid))
  const latestByPage = new Map<string, any>()
  for (const attempt of (run?.attempts || []).filter((item: any) => pageIds.has(item.page_uuid))) {
    const prior = latestByPage.get(attempt.page_uuid)
    if (!prior || new Date(attempt.submitted_at).getTime() >= new Date(prior.submitted_at).getTime()) {
      latestByPage.set(attempt.page_uuid, attempt)
    }
  }
  const attempts = Array.from(latestByPage.values())
  if (attempts.some((attempt: any) => attempt.result?.grading_status === 'pending')) return 'pending'
  const scored = attempts.filter((attempt: any) => Number(attempt.result?.max_score || 0) > 0)
  const score = scored.reduce((total: number, attempt: any) => total + Number(attempt.score ?? attempt.result?.score ?? 0), 0)
  const max = scored.reduce((total: number, attempt: any) => total + Number(attempt.result?.max_score || 0), 0)
  const minimum = Number(activity.settings?.grading?.minimum_score_percent ?? 70)
  return max > 0 && (score / max) * 100 < minimum ? 'failed' : 'completed'
}

// The pages a learner walks through: the run's resolved route when the
// activity has a current branching flow, otherwise every page in order.
function visiblePages(activity: any, run: any): any[] {
  const configuredPages = activity.pages || []
  const navigation = (run?.navigation?.activities || []).find((item: any) => item.activity_id === activity.id)
  const navigatedPages = navigation?.path?.length
    ? navigation.path.map((pageUuid: string) => configuredPages.find((item: any) => item.page_uuid === pageUuid)).filter(Boolean)
    : []
  const configuredPageUuids = new Set(configuredPages.map((item: any) => item.page_uuid))
  const flowPageUuids = (activity.settings?.flow?.nodes || []).filter((node: any) => node.type === 'page').map((node: any) => node.page_uuid)
  const flowIsCurrent = flowPageUuids.length > 0 && flowPageUuids.every((pageUuid: string) => configuredPageUuids.has(pageUuid))
  return flowIsCurrent && navigatedPages.length ? navigatedPages : configuredPages
}

export function ActivityPlayer({
  activity,
  initialRun,
  runtime,
  onClose,
  onFinish,
  onEvent,
  retakeBaselineAttemptIds,
  finishLabel = 'Finish',
  className,
  responseMediaOwner,
}: {
  activity: any
  initialRun?: any
  runtime: ActivityRuntime
  onClose: () => void
  // eslint-disable-next-line no-unused-vars
  onFinish: (run: any) => void
  // eslint-disable-next-line no-unused-vars
  onEvent?: (event: ActivityPlayerEvent) => void
  retakeBaselineAttemptIds?: Set<string>
  finishLabel?: string
  className?: string
  responseMediaOwner?: any
}) {
  const [run, setRun] = React.useState<any>(initialRun)
  const [index, setIndex] = React.useState(0)
  const [unlocked, setUnlocked] = React.useState(false)
  const [answer, setAnswer] = React.useState<any>({})
  const baseline = retakeBaselineAttemptIds
  const pages = visiblePages(activity, run)
  const page = pages[index]

  React.useEffect(() => {
    if (!runtime.start) return
    runtime.start().then(setRun).catch(() => null)
  }, [runtime])

  React.useEffect(() => {
    setUnlocked(Boolean(page) && !isQuestionResponseRequired(page))
    const prior = (run?.attempts || [])
      .filter((item: any) => item.page_uuid === page?.page_uuid && !baseline?.has(item.attempt_uuid))
      .at(-1)
    setAnswer(prior?.answer || {})
  }, [page, baseline, run?.attempts])

  const announced = React.useRef<string | undefined>(undefined)
  React.useEffect(() => {
    // Only announce real page changes, not re-renders.
    if (!page || announced.current === page.page_uuid) return
    announced.current = page.page_uuid
    onEvent?.({ type: 'page_viewed', page_uuid: page.page_uuid, page_title: page.title, page_index: index })
  }, [page, index, onEvent])

  const navigateToPage = (pageUuid: string) => {
    const destination = pages.findIndex((item: any) => item.page_uuid === pageUuid)
    if (destination < 0) return
    setIndex(destination)
    window.requestAnimationFrame(() => {
      const heading = document.querySelector('[data-learning-page-heading]') as HTMLElement | null
      heading?.focus()
      heading?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    })
  }

  const completeAndNext = async () => {
    if (!run || !page) return
    try {
      const submitting = isQuestionResponseRequired(page)
      const nextRun = submitting ? await runtime.submit(page.page_uuid, answer) : await runtime.complete(page.page_uuid)
      setRun(nextRun)
      if (submitting) onEvent?.({ type: 'answer_submitted', page_uuid: page.page_uuid, page_title: page.title, answer, run: nextRun })
      const nextNavigation = (nextRun?.navigation?.activities || []).find((item: any) => item.activity_id === activity.id)
      const nextPageUuid = nextNavigation?.current_page_uuid
      // Index into the list rendered after this update: the route can change
      // (e.g. a fresh run's first answer picks a branch), so the current list
      // would point at the wrong page.
      const nextPages = visiblePages(activity, nextRun)
      const destination = nextPageUuid ? nextPages.findIndex((item: any) => item.page_uuid === nextPageUuid) : -1
      if (destination >= 0) {
        setIndex(destination)
      } else if (index < nextPages.length - 1) {
        setIndex(index + 1)
      } else {
        onEvent?.({ type: 'finished', run: nextRun })
        onFinish(nextRun)
      }
    } catch (error: any) {
      const message = error?.message || 'Could not complete page'
      onEvent?.({ type: 'error', page_uuid: page.page_uuid, message })
      toast.error(message)
    }
  }

  return (
    <LearningActivitySurface
      pages={pages}
      page={page}
      pageIndex={index}
      onBack={onClose}
      actionLabel={page?.content?.action_label || (index === pages.length - 1 ? finishLabel : 'Continue')}
      actionDisabled={!unlocked}
      onAction={completeAndNext}
      interactionState={answer}
      className={className}
    >
      <LearningPageContent
        page={page}
        answer={answer}
        setAnswer={setAnswer}
        setUnlocked={setUnlocked}
        pages={pages}
        run={run}
        onNavigatePage={navigateToPage}
        responseMediaOwner={responseMediaOwner}
      />
    </LearningActivitySurface>
  )
}
