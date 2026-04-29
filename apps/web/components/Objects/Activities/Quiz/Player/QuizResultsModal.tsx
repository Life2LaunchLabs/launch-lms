'use client'
import React, { useEffect } from 'react'
import { X } from 'lucide-react'
import QuizResultsView from './QuizResultsView'

interface Props {
  result: any
  activity: any
  org: any
  course: any
  onRetake: () => void
  onClose?: () => void
}

export default function QuizResultsModal({ result, activity, org, course, onRetake, onClose }: Props) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-stretch sm:items-center sm:justify-center sm:p-8 sm:bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) onClose?.() }}
    >
      {/* Modal panel — fullscreen on mobile, paper-width centered card on desktop */}
      <div className="relative flex flex-col w-full bg-white overflow-y-auto sm:max-w-[816px] sm:max-h-[92vh] sm:rounded-xl sm:shadow-2xl">
        {/* Close button — floats over the cover image */}
        <button
          onClick={onClose}
          aria-label="Close results"
          className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-black/30 hover:bg-black/50 text-white backdrop-blur-sm transition-colors outline-none"
        >
          <X size={18} />
        </button>

        {/* Scrollable content — no padding here; QuizResultsView handles its own layout */}
        <div className="flex-1">
          <QuizResultsView
            result={result}
            activity={activity}
            org={org}
            course={course}
            onRetake={onRetake}
            showRetakeButton
          />
        </div>
      </div>
    </div>
  )
}
