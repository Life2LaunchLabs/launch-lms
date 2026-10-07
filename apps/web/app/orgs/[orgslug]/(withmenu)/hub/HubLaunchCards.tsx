'use client'

import { Compass, GraduationCap, Hammer, Route, Sparkles } from 'lucide-react'
import type { ComponentType } from 'react'

type LaunchCard = {
  key: string
  label: string
  hint: string
  firstMessage: string
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
}

// Seeds for a coach conversation. The first message is what the learner "says".
export const LAUNCH_CARDS: LaunchCard[] = [
  { key: 'unsure', label: 'Not sure what comes next', hint: 'Figure out a first step together', icon: Compass, firstMessage: "I'm not sure what to do after high school. Can you help me find one small thing to try first?" },
  { key: 'career', label: 'I have a career in mind', hint: 'See what it would take to get there', icon: Route, firstMessage: "I have a career in mind and want to know what a good first step would be." },
  { key: 'experience', label: 'Build real experience', hint: 'Projects, jobs and ways to try things', icon: Hammer, firstMessage: 'I want to build experience that shows what I can do. Where could I start?' },
  { key: 'graduate', label: 'Stay on track to graduate', hint: 'Check what you still need', icon: GraduationCap, firstMessage: 'I want to stay on track to graduate. What should I focus on right now?' },
]

export default function HubLaunchCards({
  disabled,
  onPick,
}: {
  disabled: boolean
  // eslint-disable-next-line no-unused-vars
  onPick: (_message: string) => void
}) {
  return (
    <section aria-label="Ways to get started" className="pb-1">
      <div className="mb-3 flex items-center gap-2 px-2">
        <Sparkles className="size-4 text-primary" aria-hidden />
        <h2 className="text-sm font-medium text-foreground">Where do you want to start?</h2>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {LAUNCH_CARDS.map(({ key, label, hint, firstMessage, icon: Icon }) => (
          <li key={key}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(firstMessage)}
              className="group flex h-full w-full items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-xs transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{label}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
