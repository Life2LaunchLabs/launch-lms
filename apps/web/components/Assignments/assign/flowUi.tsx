'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { FLOW_STEPS } from '@services/assignments/assignFlow'

/** The flow's buttons: pill shaped, in the prototype's three weights. */
export function FlowButton({ tone = 'default', size = 'md', className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'default' | 'primary' | 'brand' | 'ghost'; size?: 'sm' | 'md' | 'lg' }) {
  return <button type="button" {...props} className={cn(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border font-semibold transition-[transform,background,opacity] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:h-[17px] [&_svg]:w-[17px]',
    size === 'sm' ? 'h-8 px-3 text-[13px]' : size === 'lg' ? 'h-[50px] px-[22px] text-[15.5px]' : 'h-10 px-4 text-sm',
    tone === 'primary' ? 'border-transparent bg-primary text-primary-foreground' : tone === 'brand' ? 'border-transparent bg-brand text-white'
      : tone === 'ghost' ? 'border-transparent bg-transparent text-muted-foreground' : 'border-border bg-card text-foreground',
    className)} />
}

/** A step's heading: where you are, its title and what it's for. */
export function StepHead({ eyebrow, title, lede }: { eyebrow: string; title: string; lede: React.ReactNode }) {
  return <>
    <span className="text-xs font-bold uppercase tracking-[.06em] text-brand-ink">{eyebrow}</span>
    <h1 className="mt-2 text-[clamp(28px,3vw,40px)] font-extrabold leading-[1.06] tracking-[-.035em]">{title}</h1>
    <p className="mt-2.5 text-base leading-normal text-muted-foreground">{lede}</p>
  </>
}

/** Two or more choices in a pill track. */
export function Segmented<T extends string>({ value, options, onChange, label, big }: {
  value: T; options: Array<{ value: T; label: React.ReactNode }>; onChange: (value: T) => void; label: string; big?: boolean // eslint-disable-line no-unused-vars
}) {
  return <div role="radiogroup" aria-label={label} className={cn('flex-wrap gap-0.5 rounded-xl bg-muted p-[3px]', big ? 'flex w-full' : 'inline-flex')}>
    {options.map((option) => <button key={option.value} type="button" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)}
      className={cn('inline-flex items-center justify-center gap-2 rounded-[9px] font-semibold [&_svg]:h-[17px] [&_svg]:w-[17px]',
        big ? 'flex-1 px-3.5 py-[11px] text-sm' : 'px-3 py-[7px] text-[13px]',
        value === option.value ? 'bg-card text-foreground shadow-[0_1px_2px_hsl(200_30%_10%/0.06),0_8px_28px_hsl(200_30%_10%/0.08)]' : 'text-muted-foreground')}>{option.label}</button>)}
  </div>
}

/** A labelled field. */
export function Field({ label, optional, children, className }: { label: string; optional?: boolean; children: React.ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-1.5', className)}>
    <span className="text-[13px] font-bold">{label}{optional ? <em className="ml-1 font-medium not-italic text-muted-foreground">optional</em> : null}</span>
    {children}
  </div>
}

/** A browser window around a preview of a page. */
export function Frame({ url, children, className }: { url: string; children: React.ReactNode; className?: string }) {
  return <div className={cn('overflow-hidden rounded-2xl border border-border bg-background text-xs shadow-[0_2px_6px_hsl(210_40%_10%/0.06),0_30px_70px_-20px_hsl(215_50%_15%/0.28)]', className)}>
    <div className="flex h-8 items-center gap-1.5 border-b border-border bg-card px-3" aria-hidden="true">
      <i className="h-[9px] w-[9px] rounded-full bg-border" /><i className="h-[9px] w-[9px] rounded-full bg-border" /><i className="h-[9px] w-[9px] rounded-full bg-border" />
      <span className="ml-2.5 flex h-5 max-w-[320px] flex-1 items-center overflow-hidden whitespace-nowrap rounded-md bg-muted px-2.5 text-[10.5px] text-muted-foreground">{url}</span>
    </div>
    {children}
  </div>
}

/** Above a preview: what it shows. */
export function PreviewCaption({ children }: { children: React.ReactNode }) {
  return <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-bold uppercase tracking-[.06em] text-muted-foreground">{children}</div>
}

/** How far along the flow is: one bar per step. */
export function FlowProgress({ step }: { step: number }) {
  return <div className="flex gap-1 px-6" aria-hidden="true">{FLOW_STEPS.map((label, index) => <i key={label} className="relative h-1 flex-1 overflow-hidden rounded bg-muted">
    <span className={cn('absolute inset-0 origin-left transition-transform duration-500', index < step ? 'scale-x-100 bg-foreground' : index === step ? 'scale-x-100 bg-brand' : 'scale-x-0')} />
  </i>)}</div>
}

/** A step's page: the choices on the left with Back and Next under them, and on the right what they make. Review stands alone. */
export function FlowStage({ solo, step, left, right, nav }: { solo: boolean; step: number; left: React.ReactNode; right: React.ReactNode; nav: React.ReactNode }) {
  return <div className={cn('mx-auto grid w-full max-w-[1320px] flex-1 gap-11 px-6 pb-10 pt-[18px]', solo ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)]')}>
    <div className={cn('flex w-full min-w-0 flex-col justify-self-center pt-4', solo ? 'max-w-[760px]' : 'max-w-[480px]')}>
      {left}
      {step === 1 ? <div className="mt-6 lg:hidden">{right}</div> : null}
      <div className="mt-[26px] flex items-center justify-between gap-2.5">{nav}</div>
    </div>
    {solo ? null : <div className="relative hidden min-w-0 items-start justify-center pt-4 lg:flex"><div className="sticky top-4 w-full max-w-[640px]">{right}</div></div>}
  </div>
}
