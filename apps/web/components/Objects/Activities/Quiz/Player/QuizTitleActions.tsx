'use client'
import React, { useEffect, useMemo, useState } from 'react'
import { FileDown, MoreVertical, RotateCcw } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getMyQuizResult } from '@services/quiz/quiz'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'

interface Props {
  activity: any
}

export default function QuizTitleActions({ activity }: Props) {
  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token
  const [result, setResult] = useState<any>(undefined)

  useEffect(() => {
    let mounted = true
    getMyQuizResult(activity.activity_uuid, access_token)
      .then(r => { if (mounted) setResult(r ?? null) })
      .catch(() => { if (mounted) setResult(null) })
    return () => { mounted = false }
  }, [activity.activity_uuid, access_token])

  useEffect(() => {
    const handleResultUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail?.activity_uuid === activity.activity_uuid) {
        setResult(detail.result ?? null)
      }
    }

    window.addEventListener('lh:quiz-result-updated', handleResultUpdated)
    return () => window.removeEventListener('lh:quiz-result-updated', handleResultUpdated)
  }, [activity.activity_uuid])

  const canRetake = useMemo(() => {
    const gradedResult = result?.result_json?.graded_result
    const attemptsRemaining = gradedResult?.attempts_remaining
    return attemptsRemaining === null || attemptsRemaining === undefined || attemptsRemaining > 0
  }, [result])

  if (!result) return null

  const requestRetake = () => {
    if (!canRetake) return
    window.dispatchEvent(new CustomEvent('lh:quiz-retake-requested', {
      detail: { activity_uuid: activity.activity_uuid },
    }))
  }

  const requestPrint = () => {
    window.dispatchEvent(new CustomEvent('lh:quiz-print-requested', {
      detail: { activity_uuid: activity.activity_uuid },
    }))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Quiz actions"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <MoreVertical size={18} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          onClick={requestPrint}
          className="cursor-pointer"
        >
          <FileDown className="mr-2 h-4 w-4" />
          Print to PDF
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={requestRetake}
          disabled={!canRetake}
          className="cursor-pointer"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          {canRetake ? 'Retake quiz' : 'No retakes left'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
