'use client'
import React from 'react'
import { RotateCcw, Trophy } from 'lucide-react'
import { getActivityBlockMediaDirectory } from '@services/media/media'

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
  const matched: any = resultJson?.matched_result || null

  const hasScoring = vectors.length > 0

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

  return (
    <div className="w-full max-w-sm mx-auto space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col items-center pt-4 gap-2">
        <div className="w-16 h-16 rounded-full bg-violet-100 flex items-center justify-center">
          <Trophy size={32} className="text-violet-600" />
        </div>
        <h2 className="text-neutral-800 font-bold text-xl">Your Results</h2>
        <p className="text-neutral-500 text-sm text-center">
          Here's what your answers reveal
        </p>
      </div>

      {/* Matched result card */}
      {matched && (() => {
        const coverUrl = getCoverUrl(matched.cover_image_block_object)
        const seed = matched.label || matched.uuid || 'result'
        return (
          <div className="rounded-2xl overflow-hidden" style={{ background: coverUrl ? undefined : getGradient(seed) }}>
            {/* Cover image area */}
            <div className="relative w-full h-52">
              {coverUrl ? (
                <img src={coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0" style={{ background: getGradient(seed) }} />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <p className="text-white text-2xl font-bold drop-shadow">{matched.title}</p>
              </div>
            </div>

            {/* Body */}
            {matched.body && (
              <div className="bg-white px-4 py-4">
                <p className="text-neutral-700 text-sm leading-relaxed">{matched.body}</p>
              </div>
            )}
          </div>
        )
      })()}

      {/* Score bars per vector */}
      {hasScoring && (
        <div className="bg-neutral-50 rounded-2xl p-4 space-y-3 border border-neutral-100">
          <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Your scores</h3>
          {vectors.map((vec: any) => {
            const raw = scores[vec.key] ?? 0
            const isBi = vec.type === 'bidirectional'
            const pct = isBi
              ? Math.round(((raw + 1) / 2) * 100)
              : Math.round(raw * 100)
            return (
              <div key={vec.key} className="space-y-1">
                <div className="flex justify-between text-xs text-neutral-600">
                  <span className="font-medium">{vec.label || vec.key}</span>
                </div>
                <div className="h-2.5 bg-neutral-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-500 rounded-full transition-all duration-1000"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-neutral-400">
                  <span>{vec.low_label}</span>
                  <span>{pct}%</span>
                  <span>{vec.high_label}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* If nothing to show */}
      {!matched && !hasScoring && (
        <div className="text-center py-4 text-neutral-500 text-sm">
          Quiz completed!
        </div>
      )}

      {/* Retake */}
      <button
        onClick={onRetake}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-sm font-semibold transition-colors outline-none"
      >
        <RotateCcw size={15} />
        Retake quiz
      </button>
    </div>
  )
}
