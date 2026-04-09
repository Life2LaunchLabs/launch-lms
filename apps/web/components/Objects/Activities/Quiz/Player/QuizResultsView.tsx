'use client'
import React from 'react'
import { Trophy, CheckCircle2, XCircle, BarChart3 } from 'lucide-react'
import { getActivityBlockMediaDirectory } from '@services/media/media'
import QuizResultContentRenderer from '../Results/QuizResultContentRenderer'

function getGradient(seed: string): string {
  let hash = 0
  for (let i = 0; i < (seed || '').length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  const h1 = Math.abs(hash) % 360
  const h2 = (h1 + 50 + (Math.abs(hash >> 8) % 60)) % 360
  return `linear-gradient(135deg, hsl(${h1},60%,55%), hsl(${h2},65%,45%))`
}

interface Props {
  result: any
  activity: any
  org: any
  course: any
  onRetake: () => void
}

export default function QuizResultsView({ result, activity, org, course, onRetake }: Props) {
  const resultJson = result?.result_json
  const scores: Record<string, number> = resultJson?.scores || {}
  const vectors: any[] = resultJson?.vectors || []
  const matchedFromAttempt: any = resultJson?.matched_result || null
  const latestMatchedOption = matchedFromAttempt?.uuid
    ? (activity?.details?.result_options || []).find((option: any) => option.uuid === matchedFromAttempt.uuid) || null
    : null
  const matched: any = latestMatchedOption ? { ...matchedFromAttempt, ...latestMatchedOption } : matchedFromAttempt
  const quizMode = resultJson?.quiz_mode || activity?.details?.quiz_mode || 'categories'
  const graded = resultJson?.graded_result || null

  const getCoverUrl = (blockObj: any) => {
    if (!blockObj) return null
    const fileId = `${blockObj.content.file_id}.${blockObj.content.file_format}`
    return getActivityBlockMediaDirectory(
      org?.org_uuid,
      course?.courseStructure?.course_uuid,
      blockObj.content.activity_uuid || activity?.activity_uuid || '',
      blockObj.block_uuid,
      fileId,
      'imageBlock'
    )
  }

  // ── Graded mode ────────────────────────────────────────────────────────────
  if (quizMode === 'graded' && graded) {
    const attemptsRemaining = graded.attempts_remaining
    const canRetake = attemptsRemaining === null || attemptsRemaining > 0
    const passed = !!graded.passed

    return (
      <div className="w-full max-w-3xl mx-auto pb-8">
        <div className="space-y-5">
          <div className={`rounded-3xl p-5 md:p-6 text-white ${passed ? 'bg-emerald-600' : 'bg-rose-600'}`}>
            <div className="flex items-start justify-between gap-4 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
                {passed ? <CheckCircle2 size={26} /> : <XCircle size={26} />}
              </div>
              <span className="text-xs font-bold uppercase tracking-[0.25em] text-white/70">
                {passed ? 'Passed' : 'Not Passed'}
              </span>
            </div>
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div className="space-y-2">
                <p className="text-sm text-white/75">Final score</p>
                <p className="text-5xl font-black leading-none">{graded.score_percent.toFixed(1)}%</p>
                <p className="text-sm text-white/80">Pass mark: {graded.pass_percent.toFixed(0)}%</p>
              </div>
              <div className="rounded-2xl bg-white/10 px-4 py-3 md:min-w-[140px]">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">Correct</p>
                <p className="mt-2 text-2xl font-bold">{graded.correct_answers}/{graded.question_count}</p>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="bg-white rounded-3xl border border-neutral-100 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Trophy size={18} className="text-neutral-700" />
                <h2 className="text-xl font-bold text-neutral-900">Quiz Results</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="rounded-2xl bg-neutral-50 border border-neutral-100 p-4">
                  <div className="flex items-center gap-2 text-neutral-500 text-xs uppercase tracking-wider font-bold">
                    <BarChart3 size={13} />
                    Best Score
                  </div>
                  <p className="mt-3 text-2xl font-bold text-neutral-900">{graded.best_score_percent.toFixed(1)}%</p>
                </div>
                <div className="rounded-2xl bg-neutral-50 border border-neutral-100 p-4">
                  <div className="text-neutral-500 text-xs uppercase tracking-wider font-bold">Attempt</div>
                  <p className="mt-3 text-2xl font-bold text-neutral-900">#{graded.attempt_number}</p>
                </div>
                <div className="rounded-2xl bg-neutral-50 border border-neutral-100 p-4">
                  <div className="text-neutral-500 text-xs uppercase tracking-wider font-bold">Remaining</div>
                  <p className="mt-3 text-2xl font-bold text-neutral-900">{attemptsRemaining === null ? '∞' : attemptsRemaining}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {canRetake && (
                <button
                  onClick={onRetake}
                  className="flex items-center justify-center gap-2 py-3 px-5 rounded-2xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-sm font-semibold transition-colors outline-none"
                >
                  <RotateCcw size={15} />
                  Retake quiz
                </button>
              )}
              {!canRetake && (
                <div className="py-3 px-5 rounded-2xl bg-neutral-100 text-neutral-500 text-sm font-semibold">
                  No retakes remaining
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Categories mode ────────────────────────────────────────────────────────
  const coverUrl = matched ? getCoverUrl(matched.cover_image_block_object) : null
  const seed = matched?.label || matched?.uuid || 'result'
  const gradient = getGradient(seed)

  return (
    <div className="w-full">
      {/* Cover image — full width, with title/subtitle overlay */}
      <div
        className="relative w-full"
        style={{ minHeight: 220, background: coverUrl ? undefined : gradient }}
      >
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className="w-full object-cover"
            style={{ maxHeight: 340, minHeight: 220 }}
          />
        ) : (
          <div className="w-full" style={{ minHeight: 220, background: gradient }} />
        )}

        {/* Gradient scrim so text is always readable */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.25) 50%, rgba(0,0,0,0) 100%)' }}
        />

        {/* Title + subtitle overlay, bottom-left */}
        {matched && (matched.title || matched.subtitle) && (
          <div className="absolute bottom-0 left-0 right-0 px-6 pb-5 sm:px-8 sm:pb-6">
            {matched.subtitle && (
              <p className="text-white/75 text-xs font-semibold uppercase tracking-widest mb-1 drop-shadow">
                {matched.subtitle}
              </p>
            )}
            {matched.title && (
              <h1 className="text-white text-2xl sm:text-3xl font-bold leading-tight drop-shadow">
                {matched.title}
              </h1>
            )}
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="px-6 py-6 sm:px-8 sm:py-8 space-y-6">
        {/* Rich content blocks */}
        {matched && (
          <QuizResultContentRenderer
            key={`${matched?.uuid || 'none'}:${JSON.stringify(scores)}:${vectors.map((vec: any) => vec.key).join(',')}`}
            template={activity?.details?.results_template ?? null}
            varOverrides={matched.var_overrides ?? null}
            activity={activity}
            org={org}
            course={course}
            scores={scores}
            vectors={vectors}
            fallbackBody={matched.body}
          />
        )}

        {!matched && (
          <p className="text-neutral-500 text-sm text-center py-4">Quiz completed!</p>
        )}
      </div>
    </div>
  )
}
