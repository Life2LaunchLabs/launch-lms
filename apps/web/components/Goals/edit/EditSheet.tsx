'use client'

import React from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@components/ui/dialog'
import { planVars } from '@components/Goals/planColors'

/**
 * One goal object edited at a time, over the goal rather than in it: a tray from the bottom
 * on phones, a centred panel on wider screens. It carries the goal's colour, since it opens
 * outside the goal's own coloured wrapper.
 */
export default function EditSheet({ open, onOpenChange, color, title, description, children, footer }: {
  open: boolean
  // eslint-disable-next-line no-unused-vars
  onOpenChange: (open: boolean) => void
  color: string
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent data-plan="" style={planVars(color)}
      className="bottom-0 left-0 top-auto flex max-h-[92dvh] max-w-none translate-x-0 translate-y-0 flex-col gap-4 overflow-y-auto rounded-t-3xl border-b-0 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 data-[state=open]:slide-in-from-bottom-8 sm:bottom-auto sm:left-[50%] sm:top-[50%] sm:max-w-lg sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-2xl sm:border-b sm:data-[state=open]:slide-in-from-bottom-0">
      <span className="mx-auto -mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/25 sm:hidden" aria-hidden="true" />
      <div className="flex flex-col gap-1 pr-10">
        <DialogTitle className="text-lg font-extrabold tracking-tight">{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : <DialogDescription className="sr-only">Changes save when you press the button below.</DialogDescription>}
      </div>
      {children}
      {footer ? <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t border-border/60 bg-popover px-5 py-3 sm:static sm:m-0 sm:border-0 sm:p-0 sm:pt-1">{footer}</div> : null}
    </DialogContent>
  </Dialog>
}
