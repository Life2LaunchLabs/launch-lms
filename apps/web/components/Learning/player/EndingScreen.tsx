'use client'

import React from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check, Clock, RotateCcw } from 'lucide-react'
import type { ActivityEnding } from '@components/Learning/generated/content'

/**
 * The screen after an activity's last page, when the activity has one (``settings.design.ending``):
 * a finished, not-yet or waiting-for-review message, the score on graded activities, and confetti
 * when they finish or pass. The surface's main button closes it.
 */
export type EndingState = 'finished' | 'not_yet' | 'pending'

export function endingState(run: any): EndingState {
  const result = run?.navigation?.result || run?.result
  if (Number(result?.pending_manual_grades || 0) > 0) return 'pending'
  if (result && result.grading?.mode === 'pass_fail' && !result.passed) return 'not_yet'
  return 'finished'
}

export function EndingScreen({ ending, run, settings }: { ending: ActivityEnding; run: any; settings?: any }) {
  const reduce = useReducedMotion()
  const state = endingState(run)
  const result = run?.navigation?.result || run?.result
  const grading = settings?.grading || {}
  const scored = result?.grading?.mode === 'pass_fail' && Number(result?.max_score) > 0
  const title = state === 'pending' ? 'Sent for review'
    : state === 'not_yet' ? ending.not_yet_title || 'Not quite yet'
      : ending.title || 'Nice work'
  const message = state === 'pending' ? 'Your answers are with staff. This step finishes once they have looked.'
    : state === 'not_yet' ? ending.not_yet_message || grading.failure_message || ''
      : ending.message || grading.success_message || ''
  const Icon = state === 'pending' ? Clock : state === 'not_yet' ? RotateCcw : Check
  const ring = state === 'finished' ? 'from-amber-200 via-amber-400 to-amber-600 shadow-[0_0_60px_rgba(251,191,36,0.45)]' : 'from-slate-200 via-slate-300 to-slate-400'
  return <div className="flex w-full flex-col items-center gap-5 text-center @3xl:flex-row @3xl:gap-10 @3xl:text-left" data-ending={state}>
    <motion.div aria-hidden="true" initial={reduce ? false : { scale: 2.2, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.15 }}
      className={`flex h-32 w-32 shrink-0 items-center justify-center rounded-full bg-gradient-to-br p-2 ${ring}`}>
      <div className="flex h-full w-full items-center justify-center rounded-full border-4 border-white/60 bg-white/10">
        <Icon size={52} className="text-white" strokeWidth={2.5} />
      </div>
    </motion.div>
    <div className="flex min-w-0 flex-col gap-3">
      <h2 className="text-3xl font-extrabold tracking-tight text-foreground @xl:text-4xl">{title}</h2>
      {message ? <p className="whitespace-pre-line text-lg leading-relaxed text-muted-foreground">{message}</p> : null}
      {scored && ending.show_score !== false && state !== 'pending' ? (
        <p className="text-sm font-bold text-muted-foreground" data-ending-score>
          You scored <span className="text-foreground">{Math.round(Number(result.score_percent) || 0)}%</span>
          {result.grading?.minimum_score_percent !== undefined ? <> · pass mark {result.grading.minimum_score_percent}%</> : null}
        </p>
      ) : null}
    </div>
  </div>
}
