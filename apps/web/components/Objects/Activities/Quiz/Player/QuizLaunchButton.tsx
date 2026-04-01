'use client'
import React, { lazy, Suspense, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Play, RotateCcw, Trophy } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getMyQuizResult } from '@services/quiz/quiz'

const QuizActivityPlayer = lazy(() => import('./QuizActivityPlayer'))

interface Props {
  activity: any
}

export default function QuizLaunchButton({ activity }: Props) {
  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token

  const [open, setOpen] = useState(false)
  const [initialShowResults, setInitialShowResults] = useState(false)
  const [existingResult, setExistingResult] = useState<any>(undefined) // undefined = loading

  useEffect(() => {
    getMyQuizResult(activity.activity_uuid, access_token)
      .then(r => setExistingResult(r ?? null))
      .catch(() => setExistingResult(null))
  }, [activity.activity_uuid, access_token])

  const openTake = () => { setInitialShowResults(false); setOpen(true) }
  const openResults = () => { setInitialShowResults(true); setOpen(true) }

  const hasResult = !!existingResult
  const loading = existingResult === undefined
  const gradedResult = existingResult?.result_json?.graded_result
  const attemptsRemaining = gradedResult?.attempts_remaining
  const canRetake = attemptsRemaining === null || attemptsRemaining === undefined || attemptsRemaining > 0

  return (
    <>
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        {loading ? (
          <div className="w-8 h-8 rounded-full border-2 border-violet-300 border-t-violet-600 animate-spin" />
        ) : hasResult ? (
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-50 border border-violet-100">
              <Trophy size={14} className="text-violet-500" />
              <span className="text-sm text-violet-700 font-semibold">You've completed this quiz</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={openResults}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold transition-colors shadow-lg shadow-violet-500/25 outline-none"
              >
                <Trophy size={15} />
                View Results
              </button>
              {canRetake ? (
                <button
                  onClick={openTake}
                  className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-sm font-bold transition-colors outline-none"
                >
                  <RotateCcw size={15} />
                  Retake Quiz
                </button>
              ) : (
                <div className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-neutral-100 text-neutral-400 text-sm font-bold">
                  <RotateCcw size={15} />
                  No retakes left
                </div>
              )}
            </div>
          </div>
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
            onClose={() => setOpen(false)}
          />
        </Suspense>,
        document.body
      )}
    </>
  )
}
