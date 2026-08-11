'use client'

import React, { useRef, useEffect } from 'react'
import { PaperPlaneTilt, Sparkle, CircleNotch } from '@phosphor-icons/react'

interface Message {
  role: 'user' | 'model'
  content: string
}

interface PlaygroundChatPanelProps {
  messages: Message[]
  isGenerating: boolean
  iterationCount: number
  maxIterations: number
  onSend: (prompt: string) => void
  disabled?: boolean
}

const SUGGESTION_CHIPS = [
  'Interactive quiz with 5 questions',
  'Animated bar chart',
  'Physics simulation',
  'Flashcard deck',
  'Math explorer',
  'Mini memory game',
  'Timeline visualization',
  'Drag and drop sorting',
]

export default function PlaygroundChatPanel({
  messages,
  isGenerating,
  iterationCount,
  maxIterations,
  onSend,
  disabled,
}: PlaygroundChatPanelProps) {
  const [input, setInput] = React.useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed || isGenerating || disabled) return
    onSend(trimmed)
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleChipClick = (chip: string) => {
    setInput(chip)
    textareaRef.current?.focus()
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  const remaining = maxIterations - iterationCount
  const canSend = !!input.trim() && !isGenerating && !disabled && remaining > 0

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkle size={15} weight="fill" className="text-neutral-400" />
            <span className="text-sm font-bold text-neutral-700">AI Generator</span>
          </div>
          <span className="text-[11px] font-medium text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full">
            {remaining}/{maxIterations}
          </span>
        </div>

        {iterationCount > 0 && (
          <div className="flex items-center gap-0.5 mt-2.5">
            {Array.from({ length: maxIterations }).map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                  i < iterationCount ? 'bg-sky-500' : 'bg-gray-100'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 gap-2">
            <div className="w-10 h-10 rounded-xl bg-neutral-100 nice-shadow flex items-center justify-center">
              <Sparkle size={20} weight="fill" className="text-neutral-400" />
            </div>
            <p className="text-sm font-semibold text-neutral-600">Describe what to create</p>
            <p className="text-xs text-neutral-400">
              Type a prompt or pick a suggestion below
            </p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[88%] px-3 py-2 rounded-xl text-sm leading-relaxed nice-shadow ${
                  msg.role === 'user'
                    ? 'bg-neutral-800 text-white'
                    : 'bg-neutral-100 text-neutral-500'
                }`}
              >
                {msg.role === 'model' ? (
                  <span className="text-xs italic flex items-center gap-1.5">
                    <Sparkle size={11} weight="fill" />
                    Generated ({msg.content.length.toLocaleString()} chars)
                  </span>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))
        )}

        {isGenerating && (
          <div className="flex justify-start">
            <div className="bg-neutral-100 nice-shadow px-3 py-2 rounded-xl flex items-center gap-2">
              <CircleNotch size={13} weight="bold" className="animate-spin text-sky-500" />
              <span className="text-xs text-neutral-500 font-medium">Generating…</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions before the first prompt. */}
      {messages.length === 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5 flex-shrink-0">
          {SUGGESTION_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => handleChipClick(chip)}
              className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-neutral-100 nice-shadow text-neutral-500 hover:bg-neutral-200 hover:text-neutral-700 transition-all"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-gray-100 flex-shrink-0">
        <div
          className="nice-shadow rounded-xl bg-neutral-50 overflow-hidden flex flex-col"
          style={{ outline: input ? '1.5px solid #0ea5e9' : undefined }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder={
              remaining === 0
                ? 'Max iterations reached'
                : iterationCount === 0
                ? 'Describe your interactive experience…'
                : 'Request a change…'
            }
            disabled={isGenerating || disabled || remaining === 0}
            rows={2}
            className="w-full resize-none bg-transparent px-3 pt-3 pb-1 text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ minHeight: 56, maxHeight: 120 }}
          />
          <div className="flex items-center justify-between px-3 pb-2">
            <span className="text-[10px] text-neutral-400 font-medium">
              {remaining === 0 ? (
                <span className="text-red-400">No generations left</span>
              ) : (
                'Enter to send · Shift+Enter for newline'
              )}
            </span>
            <button
              onClick={handleSend}
              disabled={!canSend}
              className={`flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-black nice-shadow transition-all ease-linear ${
                canSend
                  ? 'bg-sky-600 hover:bg-sky-700 text-white cursor-pointer'
                  : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
              }`}
            >
              {isGenerating ? (
                <CircleNotch size={12} weight="bold" className="animate-spin" />
              ) : (
                <PaperPlaneTilt size={12} weight="bold" />
              )}
              {isGenerating ? 'Generating' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
