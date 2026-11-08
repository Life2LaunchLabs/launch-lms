'use client'

import React from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@components/ui/dialog'

/** A simple bottom sheet on phones (a small dialog on wider screens). */
export default function Sheet({ open, onClose, title, description, children }: { open: boolean; onClose: () => void; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bottom-0 left-0 top-auto max-h-[85dvh] max-w-none translate-x-0 translate-y-0 gap-3 overflow-y-auto rounded-b-none rounded-t-3xl border-x-0 border-b-0 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border">
        <DialogTitle className="pr-8 text-lg font-extrabold">{title}</DialogTitle>
        {description ? <DialogDescription className="-mt-2 text-sm">{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
        {children}
      </DialogContent>
    </Dialog>
  )
}
