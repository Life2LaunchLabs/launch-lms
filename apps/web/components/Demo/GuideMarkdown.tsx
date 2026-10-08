'use client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fillGuideText, type DemoGuidePage, type GuidePerson } from '@services/demo/demo'

const SECTION = /^\s*\{\{section:(.+?)\}\}\s*$/

/** First paragraph as plain text, for cards. */
export function pageSummary(page: DemoGuidePage, person: GuidePerson): string {
  const paragraph = fillGuideText(page.body, person).split(/\n\s*\n/).find((part) => part.trim() && !SECTION.test(part) && !/^\s*(#|\d+\.|[-*] )/.test(part)) || ''
  const plain = paragraph.replace(/[*_`#>]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim()
  return plain.length > 160 ? `${plain.slice(0, 157)}…` : plain
}

/**
 * A guide page body: markdown with person placeholders filled. A line holding
 * {{section:Title}} lists that section's pages as cards; [text](#page-id) opens a page.
 */
export default function GuideMarkdown({ body, person, pages, ratings = {}, onOpen }: {
  body: string
  person: GuidePerson
  pages: DemoGuidePage[]
  ratings?: Record<string, string>
  onOpen: React.Dispatch<string>
}) {
  const chunks: Array<{ text?: string; section?: string }> = []
  for (const line of fillGuideText(body, person).split('\n')) {
    const section = line.match(SECTION)?.[1]?.trim()
    if (section) chunks.push({ section })
    else if (chunks.length && chunks[chunks.length - 1].text !== undefined) chunks[chunks.length - 1].text += `\n${line}`
    else chunks.push({ text: line })
  }
  return <div className="text-[15px] leading-7 text-foreground">
    {chunks.map((chunk, index) => chunk.section !== undefined
      ? <SectionCards key={index} pages={pages.filter((page) => page.section.toLowerCase() === chunk.section!.toLowerCase())} person={person} ratings={ratings} onOpen={onOpen} />
      : <Markdown key={index} text={chunk.text || ''} onOpen={onOpen} />)}
  </div>
}

function SectionCards({ pages, person, ratings, onOpen }: { pages: DemoGuidePage[]; person: GuidePerson; ratings: Record<string, string>; onOpen: React.Dispatch<string> }) {
  if (!pages.length) return null
  return <div className="my-3 grid gap-2">{pages.map((page) => {
    const summary = pageSummary(page, person)
    const meta = ratings[page.id] ? `Rated ${ratings[page.id]}` : page.minutes ? `${page.minutes} min` : ''
    return <button key={page.id} type="button" onClick={() => onOpen(page.id)} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-xl border bg-card p-3 text-left hover:bg-muted/50">
      <span className="font-semibold">{fillGuideText(page.title, person)}</span><span className="text-xs text-muted-foreground">{meta}</span>
      {summary ? <span className="col-span-2 text-sm text-muted-foreground">{summary}</span> : null}
    </button>
  })}</div>
}

function Markdown({ text, onOpen }: { text: string; onOpen: React.Dispatch<string> }) {
  if (!text.trim()) return null
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    h1: ({ children }) => <h2 className="mb-2 mt-6 text-xl font-semibold tracking-tight first:mt-0">{children}</h2>,
    h2: ({ children }) => <h3 className="mb-2 mt-6 text-lg font-semibold first:mt-0">{children}</h3>,
    h3: ({ children }) => <h3 className="mb-1 mt-5 font-semibold first:mt-0">{children}</h3>,
    p: ({ children }) => <p className="my-3 first:mt-0 last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5 text-muted-foreground">{children}</ul>,
    ol: ({ children }) => <ol className="my-3 list-decimal space-y-1.5 pl-5">{children}</ol>,
    blockquote: ({ children }) => <blockquote className="my-4 border-l-2 border-indigo-300 pl-4 text-muted-foreground">{children}</blockquote>,
    a: ({ children, href = '' }) => href.startsWith('#')
      ? <button type="button" onClick={() => onOpen(href.slice(1))} className="font-medium text-indigo-600 underline underline-offset-4 dark:text-indigo-400">{children}</button>
      : <a href={href} {...(href.startsWith('/') ? {} : { target: '_blank', rel: 'noreferrer' })} className="font-medium underline decoration-border underline-offset-4 hover:decoration-foreground">{children}</a>,
    code: ({ children }) => <code className="rounded bg-muted px-1.5 py-0.5 text-[0.9em]">{children}</code>,
    table: ({ children }) => <div className="my-4 overflow-x-auto"><table className="w-full border-collapse text-sm">{children}</table></div>,
    th: ({ children }) => <th className="border-b px-3 py-2 text-left font-semibold">{children}</th>,
    td: ({ children }) => <td className="border-b px-3 py-2 align-top">{children}</td>,
  }}>{text}</ReactMarkdown>
}
