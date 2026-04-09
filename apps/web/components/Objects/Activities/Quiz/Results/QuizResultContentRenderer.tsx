'use client'
import React from 'react'
import { BarChart3 } from 'lucide-react'
import { getActivityBlockMediaDirectory } from '@services/media/media'
import { mergeContent } from './QuizResultContentEditor'

interface Props {
  template: any | null
  varOverrides: Record<string, any> | null
  activity: any
  org?: any
  course?: any
  scores?: Record<string, number>
  vectors?: any[]
  fallbackBody?: string
}

function getScorePercent(vector: any, rawValue: number): number {
  if (vector?.type === 'bidirectional') {
    return Math.round(((rawValue + 1) / 2) * 100)
  }
  return Math.round(rawValue * 100)
}

function hasRenderableNodes(doc: any): boolean {
  return !!doc?.content?.some((node: any) =>
    node?.type === 'quizScoresBlock' ||
    node?.type === 'blockImage' ||
    !!node?.content?.length
  )
}

function renderInlineNodes(nodes: any[] = [], keyPrefix: string): React.ReactNode {
  return nodes.map((node: any, index: number) => {
    const key = `${keyPrefix}-${index}`
    if (node.type === 'text') {
      let content: React.ReactNode = node.text || ''
      const marks = node.marks || []
      marks.forEach((mark: any, markIndex: number) => {
        if (mark.type === 'bold') content = <strong key={`${key}-b-${markIndex}`}>{content}</strong>
        if (mark.type === 'italic') content = <em key={`${key}-i-${markIndex}`}>{content}</em>
      })
      return <React.Fragment key={key}>{content}</React.Fragment>
    }
    if (node.type === 'hardBreak') {
      return <br key={key} />
    }
    return <React.Fragment key={key}>{renderInlineNodes(node.content || [], key)}</React.Fragment>
  })
}

function renderBlockNodes(
  nodes: any[] = [],
  opts: { activity: any; org?: any; course?: any; scores: Record<string, number>; vectors: any[] },
  keyPrefix = 'node'
): React.ReactNode {
  return nodes.map((node: any, index: number) => {
    const key = `${keyPrefix}-${index}`

    if (node.type === 'paragraph') {
      return (
        <p key={key} className="mb-3 text-sm leading-relaxed text-neutral-700 last:mb-0">
          {renderInlineNodes(node.content || [], key)}
        </p>
      )
    }

    if (node.type === 'heading') {
      const level = node.attrs?.level || 2
      if (level === 3) {
        return (
          <h3 key={key} className="mb-2 mt-5 text-lg font-semibold text-neutral-900 first:mt-0">
            {renderInlineNodes(node.content || [], key)}
          </h3>
        )
      }
      return (
        <h2 key={key} className="mb-3 mt-6 text-2xl font-bold text-neutral-900 first:mt-0">
          {renderInlineNodes(node.content || [], key)}
        </h2>
      )
    }

    if (node.type === 'bulletList') {
      return (
        <ul key={key} className="mb-3 list-disc space-y-1 pl-5 text-sm text-neutral-700">
          {renderBlockNodes(node.content || [], opts, key)}
        </ul>
      )
    }

    if (node.type === 'orderedList') {
      return (
        <ol key={key} className="mb-3 list-decimal space-y-1 pl-5 text-sm text-neutral-700">
          {renderBlockNodes(node.content || [], opts, key)}
        </ol>
      )
    }

    if (node.type === 'listItem') {
      return (
        <li key={key}>
          {renderBlockNodes(node.content || [], opts, key)}
        </li>
      )
    }

    if (node.type === 'blockImage') {
      const blockObject = node.attrs?.blockObject
      if (!blockObject?.content?.file_id) return null
      const fileId = `${blockObject.content.file_id}.${blockObject.content.file_format}`
      const courseUuid = opts.course?.courseStructure?.course_uuid || opts.course?.course_uuid
      const imageUrl = getActivityBlockMediaDirectory(
        opts.org?.org_uuid,
        courseUuid,
        blockObject.content.activity_uuid || opts.activity?.activity_uuid,
        blockObject.block_uuid,
        fileId,
        'imageBlock'
      )
      if (!imageUrl) return null

      const width = node.attrs?.size?.width || 600
      const alignment = node.attrs?.alignment || 'center'
      const justifyClass = alignment === 'left' ? 'justify-start' : alignment === 'right' ? 'justify-end' : 'justify-center'

      return (
        <div key={key} className={`my-4 flex w-full ${justifyClass}`}>
          <img
            src={imageUrl}
            alt=""
            className="h-auto max-w-full rounded-lg"
            style={{ width, maxWidth: '100%' }}
          />
        </div>
      )
    }

    if (node.type === 'quizScoresBlock') {
      return (
        <div key={key} className="my-4 rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 size={16} className="text-neutral-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Your scores</h3>
          </div>
          {opts.vectors.length === 0 ? (
            <p className="m-0 text-xs text-neutral-400">No scores available.</p>
          ) : (
            <div className="space-y-3">
              {opts.vectors.map((vector: any) => {
                const rawValue = Number(opts.scores?.[vector.key] ?? 0)
                const pct = getScorePercent(vector, rawValue)
                return (
                  <div key={`${key}-${vector.key}`} className="space-y-1">
                    <div className="flex justify-between text-xs text-neutral-600">
                      <span className="font-medium">{vector.label || vector.key}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-neutral-200">
                      <div className="h-full rounded-full bg-violet-500" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-neutral-400">
                      <span>{vector.low_label || 'Low'}</span>
                      <span>{vector.type === 'binary' ? (rawValue >= 0.5 ? 'True' : 'False') : `${pct}%`}</span>
                      <span>{vector.high_label || 'High'}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    return null
  })
}

export default function QuizResultContentRenderer({
  template,
  varOverrides,
  activity,
  org,
  course,
  scores = {},
  vectors = [],
  fallbackBody,
}: Props) {
  const merged = mergeContent(template, varOverrides)
  const hasContent = hasRenderableNodes(merged)

  if (!hasContent) {
    if (!fallbackBody) return null
    return <p className="text-sm leading-relaxed text-neutral-700 whitespace-pre-line">{fallbackBody}</p>
  }

  return (
    <div className="quiz-result-content-renderer">
      {renderBlockNodes(merged?.content || [], { activity, org, course, scores, vectors })}
    </div>
  )
}
