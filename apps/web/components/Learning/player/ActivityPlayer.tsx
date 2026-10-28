'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { footerButtons, isQuestionResponseRequired, LearningPageContent } from '@components/Learning/LearningBadgeViews'
import { allowsNoAnswer } from './OptionSources'
import { LearningActivitySurface } from './ActivitySurface'
import useAutoAdvance from './useAutoAdvance'
import { EndingScreen, endingState } from './EndingScreen'

// The learner runtime behind a player: the live run API for learners, or the
// side-effect-free preview API for admins and the Claude connector. Both return
// the same run shape (attempts, navigation, render_context), so one player
// renders both and a preview behaves exactly like the real activity.
export interface ActivityRuntime {
  start?: () => Promise<any>
  // eslint-disable-next-line no-unused-vars
  submit: (pageUuid: string, answer: any, button?: string) => Promise<any>
  // eslint-disable-next-line no-unused-vars
  complete: (pageUuid: string, button?: string) => Promise<any>
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

// The server's verdict for an activity once its required pages are done
// (null before that). Live runs and previews report the same result shape.
export function getActivityResult(run: any): { status: 'pending' | 'failed' | 'completed'; scored: boolean } | null {
  const result = run?.navigation?.result
  if (!result) return null
  const scored = result.grading?.mode === 'pass_fail'
  if (Number(result.pending_manual_grades || 0) > 0) return { status: 'pending', scored }
  return { status: result.passed ? 'completed' : 'failed', scored }
}

// The pages a learner walks through, in the order the server routed them. The
// runtime resolves flows (branching, button routes, variables); the player only
// renders that route. Before a run exists there is no route yet, so fall back
// to page order.
function routedPages(activity: any, run: any): any[] {
  const pages = activity.pages || []
  const navigation = run?.navigation
  if (!navigation) return pages
  const byUuid = new Map(pages.map((page: any) => [page.page_uuid, page]))
  return (navigation.path || []).map((pageUuid: string) => byUuid.get(pageUuid)).filter(Boolean)
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
  // The finished run while its ending screen shows (activities with ``settings.design.ending``).
  const [ended, setEnded] = React.useState<any>(null)
  const ending = activity.settings?.design?.ending
  const baseline = retakeBaselineAttemptIds
  const pages = routedPages(activity, run)
  const page = pages[index]

  React.useEffect(() => {
    if (!runtime.start) return
    runtime.start().then(setRun).catch(() => null)
  }, [runtime])

  // Resume where the server says the learner is, once, when the run arrives.
  const resumed = React.useRef(false)
  React.useEffect(() => {
    if (resumed.current || !run) return
    resumed.current = true
    const current = run.navigation?.current_page_uuid
    const position = current ? routedPages(activity, run).findIndex((item: any) => item.page_uuid === current) : -1
    if (position > 0) setIndex(position)
  }, [run, activity])

  // A new page starts from its saved answer, if any. The run arriving later (or refreshing)
  // with nothing saved for this page keeps what the learner has typed so far.
  const shownPage = React.useRef<string | undefined>(undefined)
  React.useEffect(() => {
    const prior = (run?.attempts || [])
      .filter((item: any) => item.page_uuid === page?.page_uuid && !baseline?.has(item.attempt_uuid))
      .at(-1)
    if (shownPage.current === page?.page_uuid && !prior) return
    shownPage.current = page?.page_uuid
    setUnlocked(Boolean(page) && (!isQuestionResponseRequired(page) || allowsNoAnswer(page)))
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

  // `button` is the continue button the learner pressed, if any; the flow can
  // route on it via `<page_uuid>.button`.
  const completeAndNext = async (button?: string) => {
    if (!run || !page) return
    try {
      const submitting = isQuestionResponseRequired(page)
      const nextRun = submitting ? await runtime.submit(page.page_uuid, answer, button) : await runtime.complete(page.page_uuid, button)
      setRun(nextRun)
      if (submitting) onEvent?.({ type: 'answer_submitted', page_uuid: page.page_uuid, page_title: page.title, answer, run: nextRun })
      const nextNavigation = nextRun?.navigation
      // Go to the first page the route still needs; when every page is done
      // (a retake or review), step to the page after this one on the route.
      const nextPages = routedPages(activity, nextRun)
      const position = nextPages.findIndex((item: any) => item.page_uuid === page.page_uuid)
      // A finished run that reached its last page is done, even with optional pages skipped on the way.
      const done = nextRun?.status === 'completed' && position === nextPages.length - 1
      const nextPageUuid = done ? undefined : nextNavigation?.current_page_uuid || nextPages[position + 1]?.page_uuid
      const destination = nextPageUuid ? nextPages.findIndex((item: any) => item.page_uuid === nextPageUuid) : -1
      if (destination >= 0) {
        setIndex(destination)
      } else {
        onEvent?.({ type: 'finished', run: nextRun })
        if (ending) setEnded(nextRun)
        else onFinish(nextRun)
      }
    } catch (error: any) {
      const message = error?.message || 'Could not complete page'
      onEvent?.({ type: 'error', page_uuid: page.page_uuid, message })
      toast.error(message)
    }
  }

  // The configured exit jumps ahead to its page on the route (so finishing pages still run), else closes.
  const exitTo = activity.settings?.design?.exit?.to_page_uuid
  const exit = () => {
    const destination = pages.findIndex((item: any) => item.page_uuid === exitTo)
    if (destination > index) setIndex(destination); else onClose()
  }
  // Enter in a one-line answer moves on, as Continue would (phone keyboards have no other way).
  // Text areas keep Enter for new lines; pages that route on their own buttons wait for a tap.
  const enterToContinue = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement
    if (event.key !== 'Enter' || event.nativeEvent.isComposing || !(target instanceof HTMLInputElement)) return
    if (['checkbox', 'radio', 'file', 'button', 'submit'].includes(target.type) || !unlocked || footerButtons(page, run)) return
    event.preventDefault()
    void completeAndNext()
  }
  const timed = useAutoAdvance(ended ? undefined : page, unlocked, () => void completeAndNext(), index > 0 ? () => setIndex(index - 1) : undefined)

  if (ended) {
    const celebrate = ending.celebrate !== false && endingState(ended) === 'finished'
    return (
      <LearningActivitySurface
        pages={pages}
        page={{ page_uuid: 'ending', page_type: 'standard', design: { celebrate, background: pages[pages.length - 1]?.design?.background } }}
        pageIndex={Math.max(0, pages.length - 1)}
        onBack={() => onFinish(ended)}
        actionLabel={finishLabel}
        onAction={() => onFinish(ended)}
        className={className}
        settings={activity.settings}
      >
        <EndingScreen ending={ending} run={ended} settings={activity.settings} />
      </LearningActivitySurface>
    )
  }

  return (
    <LearningActivitySurface
      pages={pages}
      page={page}
      pageIndex={index}
      onBack={onClose}
      actionLabel={page?.content?.action_label || (index === pages.length - 1 ? finishLabel : 'Continue')}
      actionDisabled={!unlocked}
      onAction={() => completeAndNext()}
      interactionState={answer}
      className={className}
      settings={activity.settings}
      onPrevious={() => navigateToPage(pages[index - 1]?.page_uuid)}
      onExit={exitTo ? exit : undefined}
      footer={footerButtons(page, run, unlocked ? completeAndNext : undefined)}
      timed={timed}
    >
      <div className="contents" onKeyDown={enterToContinue}>
      <LearningPageContent
        page={page}
        answer={answer}
        setAnswer={setAnswer}
        setUnlocked={setUnlocked}
        pages={pages}
        run={run}
        onNavigatePage={navigateToPage}
        onButton={unlocked ? completeAndNext : undefined}
        responseMediaOwner={responseMediaOwner}
      />
      </div>
    </LearningActivitySurface>
  )
}
