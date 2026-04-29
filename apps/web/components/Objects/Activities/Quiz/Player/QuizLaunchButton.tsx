'use client'
import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Play } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { useCourse } from '@components/Contexts/CourseContext'
import { getMyQuizResult } from '@services/quiz/quiz'
import QuizResultsView from './QuizResultsView'
import QuizResultsPrintTemplate from './QuizResultsPrintTemplate'

const QuizActivityPlayer = lazy(() => import('./QuizActivityPlayer'))

interface Props {
  activity: any
}

export default function QuizLaunchButton({ activity }: Props) {
  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token
  const org = useOrg() as any
  const course = useCourse() as any

  const [open, setOpen] = useState(false)
  const [initialShowResults, setInitialShowResults] = useState(false)
  const [existingResult, setExistingResult] = useState<any>(undefined) // undefined = loading
  const openTake = useCallback(() => {
    setInitialShowResults(false)
    setOpen(true)
  }, [])

  useEffect(() => {
    getMyQuizResult(activity.activity_uuid, access_token)
      .then(r => setExistingResult(r ?? null))
      .catch(() => setExistingResult(null))
  }, [activity.activity_uuid, access_token])

  useEffect(() => {
    const handleResultUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail?.activity_uuid === activity.activity_uuid) {
        setExistingResult(detail.result ?? null)
      }
    }
    const handleRetakeRequested = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail?.activity_uuid === activity.activity_uuid) {
        openTake()
      }
    }
    const handlePrintRequested = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail?.activity_uuid === activity.activity_uuid) {
        window.requestAnimationFrame(() => window.print())
      }
    }

    window.addEventListener('lh:quiz-result-updated', handleResultUpdated)
    window.addEventListener('lh:quiz-retake-requested', handleRetakeRequested)
    window.addEventListener('lh:quiz-print-requested', handlePrintRequested)
    return () => {
      window.removeEventListener('lh:quiz-result-updated', handleResultUpdated)
      window.removeEventListener('lh:quiz-retake-requested', handleRetakeRequested)
      window.removeEventListener('lh:quiz-print-requested', handlePrintRequested)
    }
  }, [activity.activity_uuid, openTake])

  const handleComplete = (result: any) => {
    setExistingResult(result ?? null)
    setOpen(false)
  }

  const hasResult = !!existingResult
  const loading = existingResult === undefined

  return (
    <>
      <div className={hasResult ? "-mx-5 sm:-mx-7 -mb-6 sm:-mb-7" : "flex flex-col items-center justify-center py-16 gap-3"}>
        {loading ? (
          <div className="w-8 h-8 rounded-full border-2 border-violet-300 border-t-violet-600 animate-spin" />
        ) : hasResult ? (
          <>
            <QuizResultsView
              result={existingResult}
              activity={activity}
              org={org}
              course={course}
              onRetake={openTake}
            />
          </>
        ) : (
          <button
            onClick={openTake}
            className="flex items-center gap-2 px-8 py-4 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white text-base font-bold transition-colors shadow-lg shadow-violet-500/25 outline-none"
          >
            <Play size={18} fill="currentColor" />
            Take Quiz
          </button>
        )}
      </div>

      {open && typeof document !== 'undefined' && createPortal(
        <Suspense fallback={null}>
          <QuizActivityPlayer
            activity={activity}
            initialShowResults={initialShowResults}
            onComplete={handleComplete}
            onClose={() => setOpen(false)}
          />
        </Suspense>,
        document.body
      )}

      {hasResult && typeof document !== 'undefined' && createPortal(
        <QuizResultsPrintTemplate
          result={existingResult}
          activity={activity}
          org={org}
          course={course}
        />,
        document.body
      )}
    </>
  )
}
