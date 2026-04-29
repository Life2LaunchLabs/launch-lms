'use client'
import React from 'react'
import { getActivityBlockMediaDirectory } from '@services/media/media'
import { mergeContent } from './QuizResultContentEditor'
import QuizScoresDisplay, { QuizScoresSortOrder } from './QuizScoresDisplay'

interface Props {
  template: any | null
  varOverrides: Record<string, any> | null
  activity: any
  org?: any
  course?: any
  scores?: Record<string, number>
  vectors?: any[]
  fallbackBody?: string
  sectioned?: boolean
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
        <div key={key} className="my-3 py-1">
          <QuizScoresDisplay
            vectors={opts.vectors}
            scores={opts.scores}
            sortOrder={(node.attrs?.sortOrder || 'none') as QuizScoresSortOrder}
            normalize={node.attrs?.normalize !== false}
            emptyMessage="No scores available."
          />
        </div>
      )
    }

    return null
  })
}

function groupNodesIntoSections(nodes: any[] = []): any[][] {
  const sections: any[][] = []
  let currentSection: any[] = []

  nodes.forEach((node: any) => {
    if (node?.type === 'heading' && currentSection.length > 0) {
      sections.push(currentSection)
      currentSection = []
    }
    currentSection.push(node)
  })

  if (currentSection.length > 0) {
    sections.push(currentSection)
  }

  return sections
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
  sectioned = false,
}: Props) {
  const merged = mergeContent(template, varOverrides)
  const hasContent = hasRenderableNodes(merged)

  if (!hasContent) {
    if (!fallbackBody) return null
    return <p className="text-sm leading-relaxed text-neutral-700 whitespace-pre-line">{fallbackBody}</p>
  }

  const opts = { activity, org, course, scores, vectors }
  if (sectioned) {
    return (
      <div className="quiz-result-content-renderer">
        {groupNodesIntoSections(merged?.content || []).map((sectionNodes, index) => (
          <section key={`section-${index}`} className="quiz-result-print-section">
            {renderBlockNodes(sectionNodes, opts, `section-${index}`)}
          </section>
        ))}
      </div>
    )
  }

  return (
    <div className="quiz-result-content-renderer">
      {renderBlockNodes(merged?.content || [], opts)}
    </div>
  )
}
