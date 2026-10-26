'use client'

import React from 'react'
import useSWR from 'swr'
import { Printer } from 'lucide-react'
import { insightsApi } from '@services/insights/insights'
import CapturedCards, { Attachments, capturedOn, rangeText } from './CapturedCards'
import { ScopeGlyph } from './shared'
import './insights.css'

/** A capture's read-only link: no sign-in, no names, numbers under ten hidden (the API does the hiding). */
export default function SharedCapture({ token }: { token: string }) {
  const { data: capture, error } = useSWR(['insights', 'shared', token], () => insightsApi.shared(token), { revalidateOnFocus: false, shouldRetryOnError: false })
  return <main className="insights-viz min-h-dvh bg-background">
    <div className="insights-print mx-auto w-full max-w-[1200px] space-y-5 px-4 pb-16 pt-8 sm:px-8">
      {error ? <div className="rounded-[22px] border-[1.5px] border-dashed border-border px-6 py-16 text-center">
        <h1 className="text-[20px] font-bold">This link has expired or been turned off</h1>
        <p className="mt-1 text-muted-foreground">Ask whoever sent it for a new one.</p>
      </div> : !capture ? <span className="block h-40 animate-pulse rounded-2xl bg-muted" /> : <>
        <header className="space-y-2">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{capture.org.name}</p>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <ScopeGlyph scope={capture.scope} size="lg" />
              <div className="min-w-0">
                <h1 className="text-[26px] font-extrabold leading-tight tracking-tight">{capture.object_label || capture.title}</h1>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{capture.object_label ? `${capture.title} · ` : ''}{rangeText(capture.range)}</p>
              </div>
            </div>
            <button type="button" onClick={() => window.print()} className="insights-print-hide inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold hover:bg-muted">
              <Printer size={14} aria-hidden="true" />Print</button>
          </div>
          {capture.note ? <p className="whitespace-pre-line text-[14px]">{capture.note}</p> : null}
          <p className="text-[12.5px] text-muted-foreground">Captured {capturedOn(capture.creation_date)}. These numbers don&apos;t change; any under ten are hidden.</p>
        </header>
        <CapturedCards cards={capture.cards} results={capture.results} />
        <Attachments attachments={capture.attachments} />
      </>}
    </div>
  </main>
}
