'use client'
import React from 'react'
import QuizResultsView from './QuizResultsView'

interface Props {
  result: any
  activity: any
  org: any
  course: any
}

export default function QuizResultsPrintTemplate({ result, activity, org, course }: Props) {
  return (
    <div className="quiz-results-print-root" aria-hidden="true">
      <style>{`
        .quiz-results-print-root { display: none; }

        @media print {
          @page {
            size: letter;
            margin: 0.45in;
          }

          body > *:not(.quiz-results-print-root) {
            display: none !important;
          }

          html,
          body {
            background: #ffffff !important;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          .quiz-results-print-root {
            display: block !important;
            visibility: visible !important;
            width: 100%;
            background: #ffffff;
            border: 0 !important;
            box-shadow: none !important;
            color: #111827;
          }

          .quiz-results-print-root * {
            visibility: visible !important;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          .quiz-results-print-root .border,
          .quiz-results-print-root [class*="border-"] {
            box-shadow: none !important;
          }

          .quiz-results-print-root .quiz-result-content-renderer,
          .quiz-results-print-root .quiz-result-content-renderer > * {
            break-inside: auto;
            page-break-inside: auto;
          }

          .quiz-results-print-root .quiz-result-print-section {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .quiz-results-print-root img,
          .quiz-results-print-root .rounded-2xl,
          .quiz-results-print-root .rounded-3xl {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
      <QuizResultsView
        result={result}
        activity={activity}
        org={org}
        course={course}
        onRetake={() => {}}
        sectionedContent
      />
    </div>
  )
}
