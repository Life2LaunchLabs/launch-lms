import React from 'react'

export type QuizScoresSortOrder = 'none' | 'asc' | 'desc'

const MIN_BAR_RATIO = 0.05

function getDisplayRatio(vector: any, rawValue: number): number {
  if (vector?.type === 'bidirectional') {
    return Math.max(0, Math.min(1, (rawValue + 1) / 2))
  }
  return Math.max(0, Math.min(1, rawValue))
}

function getFillWidth(ratio: number, maxRatio: number, normalize: boolean): string {
  const normalizedRatio = normalize && maxRatio > 0 ? ratio / maxRatio : ratio
  const clampedRatio = Math.max(MIN_BAR_RATIO, Math.min(1, normalizedRatio))
  return `${(clampedRatio * 100).toFixed(1)}%`
}

function getTrackStyle(color: string) {
  return {
    backgroundColor: `${color}1A`,
    boxShadow: `inset 0 0 0 1px ${color}22`,
  }
}

interface QuizScoresDisplayProps {
  vectors: any[]
  scores: Record<string, number>
  sortOrder?: QuizScoresSortOrder
  normalize?: boolean
  emptyMessage: string
  className?: string
}

export default function QuizScoresDisplay({
  vectors,
  scores,
  sortOrder = 'none',
  normalize = true,
  emptyMessage,
  className = '',
}: QuizScoresDisplayProps) {
  if (vectors.length === 0) {
    return <p className="m-0 text-xs text-neutral-400">{emptyMessage}</p>
  }

  const items = vectors.map((vector: any, index: number) => {
    const rawValue = Number(scores?.[vector.key] ?? 0)
    return {
      vector,
      rawValue,
      ratio: getDisplayRatio(vector, rawValue),
      label: vector.label || vector.key,
      color: vector.color || '#7c3aed',
      index,
    }
  })

  const sortedItems = [...items]
  if (sortOrder === 'asc') {
    sortedItems.sort((a, b) => a.ratio - b.ratio || a.index - b.index)
  } else if (sortOrder === 'desc') {
    sortedItems.sort((a, b) => b.ratio - a.ratio || a.index - b.index)
  }

  const maxRatio = sortedItems.reduce((max, item) => Math.max(max, item.ratio), 0)

  return (
    <div className={`space-y-3 ${className}`.trim()}>
      {sortedItems.map((item) => (
        <div key={item.vector.key} className="grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)] items-center gap-3">
          <span className="truncate text-right text-sm font-medium leading-6 text-neutral-700">
            {item.label}
          </span>
          <div
            className="relative h-6 overflow-hidden rounded-full"
            style={getTrackStyle(item.color)}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
              style={{ width: getFillWidth(item.ratio, maxRatio, normalize), backgroundColor: item.color }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
