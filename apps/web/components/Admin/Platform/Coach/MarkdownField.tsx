'use client'

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Textarea } from '@components/ui/textarea'

// A markdown document the coaching team writes, with a preview of how it reads.
export default function MarkdownField({ id, label, value, onChange, rows = 18, maxLength, placeholder }: {
  id: string
  label: string
  value: string
  onChange: React.Dispatch<string>
  rows?: number
  maxLength?: number
  placeholder?: string
}) {
  const [preview, setPreview] = React.useState(false)
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-bold text-gray-900">{label}</label>
        <div className="flex rounded-lg border border-black/10 p-0.5 text-xs font-semibold" role="group" aria-label={`${label} view`}>
          {(['Write', 'Preview'] as const).map((mode) => {
            const active = (mode === 'Preview') === preview
            return <button key={mode} type="button" aria-pressed={active} onClick={() => setPreview(mode === 'Preview')} className={`rounded-md px-2.5 py-1 ${active ? 'bg-gray-950 text-white' : 'text-gray-600 hover:text-gray-950'}`}>{mode}</button>
          })}
        </div>
      </div>
      {preview ? (
        <div className="mt-2 min-h-40 rounded-xl border border-black/10 bg-gray-50/60 p-4 text-sm leading-6 text-gray-800">
          {value.trim() ? <Markdown text={value} /> : <p className="text-gray-500">Nothing written yet.</p>}
        </div>
      ) : (
        <Textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} rows={rows} maxLength={maxLength} placeholder={placeholder} className="mt-2 resize-y rounded-xl font-mono text-[13px] leading-6" />
      )}
    </div>
  )
}

function Markdown({ text }: { text: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    h1: ({ children }) => <h3 className="mb-2 mt-5 text-lg font-black first:mt-0">{children}</h3>,
    h2: ({ children }) => <h4 className="mb-2 mt-5 font-bold first:mt-0">{children}</h4>,
    h3: ({ children }) => <h5 className="mb-1 mt-4 font-semibold first:mt-0">{children}</h5>,
    p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
    ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
    blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-violet-300 pl-4 text-gray-600">{children}</blockquote>,
    code: ({ children }) => <code className="rounded bg-white px-1.5 py-0.5 text-[0.9em]">{children}</code>,
    a: ({ children, href = '' }) => <a href={href} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4">{children}</a>,
  }}>{text}</ReactMarkdown>
}
