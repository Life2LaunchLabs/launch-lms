'use client'

import React from 'react'
import dynamic from 'next/dynamic'
import { Loader2, Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@components/ui/dialog'
import { primaryActionClass } from '@components/Plans/shared/actions'

// The picker brings in every step type's look, so it loads when the modal first opens.
const NewPlanPicker = dynamic(() => import('./NewPlanPicker'), {
  ssr: false, loading: () => <div className="flex flex-1 items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>,
})

/** New plan: start from scratch or copy a starter plan; either opens ready to edit as draft v1.0.0. */
export default function NewPlanModal({ orgslug, trigger }: { orgslug: string; trigger?: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>{trigger || <button type="button" className={primaryActionClass}><Plus size={16} aria-hidden="true" />New plan</button>}</DialogTrigger>
    <DialogContent className="flex h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-[1080px] flex-col overflow-hidden rounded-[22px] p-0 sm:h-[min(720px,calc(100dvh-32px))] sm:rounded-[22px]">
      <div className="flex items-center gap-3 border-b border-border px-[22px] py-[18px] pr-16">
        <DialogTitle className="flex-1 text-[19px] font-bold tracking-tight">New plan</DialogTitle>
        <DialogDescription className="sr-only">Start from scratch or from a starter plan. Everything is editable.</DialogDescription>
      </div>
      {open ? <NewPlanPicker orgslug={orgslug} onDone={() => setOpen(false)} /> : null}
    </DialogContent>
  </Dialog>
}
