'use client'

import * as React from 'react'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { Input } from '@components/ui/input'

// In-app replacements for window.confirm and window.prompt. A component calls `useAsk()`, renders
// the returned `dialog` once, and awaits `confirm(...)` or `text(...)` where it used the browser's.

type ConfirmAsk = { title: string; body?: React.ReactNode; action: string; danger?: boolean; cancel?: string }
type TextAsk = { title: string; body?: React.ReactNode; label: string; initial?: string; placeholder?: string; action: string }
// eslint-disable-next-line no-unused-vars -- parameter names in function types
type Pending = ({ kind: 'confirm' } & ConfirmAsk & { resolve: (yes: boolean) => void }) | ({ kind: 'text' } & TextAsk & { resolve: (value: string | null) => void })

export function useAsk() {
  const [pending, setPending] = React.useState<Pending | null>(null)
  const [value, setValue] = React.useState('')

  const confirm = React.useCallback((ask: ConfirmAsk) => new Promise<boolean>((resolve) => setPending({ kind: 'confirm', ...ask, resolve })), [])
  const text = React.useCallback((ask: TextAsk) => new Promise<string | null>((resolve) => { setValue(ask.initial || ''); setPending({ kind: 'text', ...ask, resolve }) }), [])

  const finish = (answer: boolean) => {
    if (!pending) return
    if (pending.kind === 'confirm') pending.resolve(answer)
    else pending.resolve(answer && value.trim() ? value.trim() : null)
    setPending(null)
  }

  const dialog = <Dialog open={Boolean(pending)} onOpenChange={(open) => { if (!open) finish(false) }}>
    <DialogContent className="w-[calc(100vw-32px)] max-w-md rounded-3xl">
      {pending ? <form onSubmit={(event) => { event.preventDefault(); finish(true) }} className="grid gap-4">
        <DialogHeader><DialogTitle>{pending.title}</DialogTitle>{pending.body ? <DialogDescription>{pending.body}</DialogDescription> : null}</DialogHeader>
        {pending.kind === 'text' ? <label className="grid gap-1.5 text-sm font-bold">{pending.label}<Input autoFocus value={value} placeholder={pending.placeholder} onChange={(event) => setValue(event.target.value)} maxLength={120} /></label> : null}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={() => finish(false)}>{pending.kind === 'confirm' ? pending.cancel || 'Cancel' : 'Cancel'}</Button>
          <Button type="submit" variant={pending.kind === 'confirm' && pending.danger ? 'destructive' : 'default'} disabled={pending.kind === 'text' && !value.trim()} autoFocus={pending.kind === 'confirm'}>{pending.action}</Button>
        </DialogFooter>
      </form> : null}
    </DialogContent>
  </Dialog>

  return { confirm, text, dialog }
}
