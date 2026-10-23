'use client'

import React from 'react'
import { ArrowLeft } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@components/ui/dialog'
import { Switch } from '@components/ui/switch'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  // eslint-disable-next-line no-unused-vars
  onOpenChange: (open: boolean) => void
  title: string
  /** Read by screen readers; the dialogs say what they're for in their bodies. */
  description?: string
  /** A back arrow before the title. */
  onBack?: () => void
  /** `wide` is the two-pane size (step editor), `md` a picker, `sm` a form. */
  size?: 'sm' | 'md' | 'wide'
  /** No title bar (the celebration). */
  bare?: boolean
  footer?: React.ReactNode
  bodyClassName?: string
  children: React.ReactNode
}

const WIDTH = { sm: 'max-w-[560px]', md: 'max-w-[760px]', wide: 'max-w-[1080px] sm:h-[min(720px,calc(100dvh-32px))]' }

/** The plan page's dialogs: a title bar, a scrolling body and a footer of actions. */
export default function PlanDialog({ open, onOpenChange, title, description, onBack, size = 'sm', bare = false, footer, bodyClassName, children }: Props) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className={cn('flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] flex-col overflow-hidden rounded-[22px] p-0 sm:rounded-[22px]', WIDTH[size], size === 'wide' && 'h-[calc(100dvh-32px)]')}>
      {bare ? <DialogTitle className="sr-only">{title}</DialogTitle> : <div className="flex items-center gap-3 border-b border-border px-[22px] py-4 pr-16">
        {onBack ? <button type="button" onClick={onBack} aria-label="Back" className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] border border-border bg-card hover:bg-muted"><ArrowLeft size={16} /></button> : null}
        <DialogTitle className="min-w-0 flex-1 truncate text-[19px] font-bold tracking-tight">{title}</DialogTitle>
      </div>}
      <DialogDescription className="sr-only">{description || title}</DialogDescription>
      <div className={cn('min-h-0 flex-1 overflow-y-auto', !bare && 'p-[22px]', bodyClassName)}>{children}</div>
      {footer ? <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-border px-[22px] py-3.5">{footer}</div> : null}
    </DialogContent>
  </Dialog>
}

/** A setting that's on or off, as a framed row: what it does on the left, the switch on the right. */
export function ToggleRow({ title, detail, checked, onChange, disabled }: { title: string; detail?: React.ReactNode; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) { // eslint-disable-line no-unused-vars
  const id = React.useId()
  return <label htmlFor={id} className="flex cursor-pointer items-center gap-3 rounded-[14px] border border-border bg-card px-3.5 py-3">
    <span className="min-w-0 flex-1"><b className="block text-sm">{title}</b>{detail ? <span className="text-[12.5px] text-muted-foreground">{detail}</span> : null}</span>
    <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} className="h-6 w-[42px] data-[state=checked]:bg-emerald-600 [&>span]:h-[18px] [&>span]:w-[18px] [&>span]:data-[state=checked]:translate-x-[18px]" />
  </label>
}
