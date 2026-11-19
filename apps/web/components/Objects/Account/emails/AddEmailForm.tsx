'use client'

import React from 'react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { accountEmailsApi, type AccountEmails } from '@services/users/accountEmails'

/**
 * Add an email in two steps: type it and get a code there, then type the code (DEV-198). An email already on
 * another account is refused with the API's message. Used in Settings and in the add-a-personal-email prompt.
 */
export default function AddEmailForm({ token, onAdded, onCancel, submitLabel = 'Send code', idPrefix = 'add-email' }: {
  token: string
  // eslint-disable-next-line no-unused-vars -- parameter names in function types
  onAdded: (emails: AccountEmails) => void
  onCancel?: () => void
  submitLabel?: string
  idPrefix?: string
}) {
  const [email, setEmail] = React.useState('')
  const [code, setCode] = React.useState('')
  const [sentTo, setSentTo] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const codeRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => { if (sentTo) codeRef.current?.focus() }, [sentTo])

  const send = async (event?: React.FormEvent) => {
    event?.preventDefault()
    setBusy(true); setError('')
    try {
      const sent = await accountEmailsApi.sendCode(email.trim(), token)
      setSentTo(sent.email); setCode('')
    } catch (caught: any) {
      setError(caught?.message || 'That didn’t send. Try again.')
    } finally { setBusy(false) }
  }

  const confirm = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      onAdded(await accountEmailsApi.confirm(sentTo, code.trim(), token))
    } catch (caught: any) {
      setError(caught?.message || 'That didn’t work. Try again.')
    } finally { setBusy(false) }
  }

  const errorLine = error ? <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p> : null

  if (sentTo) {
    return <form onSubmit={confirm} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-code`}>Code</Label>
        <p id={`${idPrefix}-code-help`} className="text-sm text-muted-foreground">We sent a 6-digit code to <span className="font-semibold text-foreground">{sentTo}</span>. It works for 15 minutes.</p>
        <Input ref={codeRef} id={`${idPrefix}-code`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} aria-describedby={`${idPrefix}-code-help`}
          className="h-11 max-w-[12rem] text-base tracking-[0.3em]" required />
      </div>
      {errorLine}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Add email'}</Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => void send()}>Send a new code</Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => { setSentTo(''); setError('') }}>Use a different email</Button>
      </div>
    </form>
  }

  return <form onSubmit={send} className="space-y-3">
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-email`}>Email</Label>
      <Input id={`${idPrefix}-email`} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com" className="h-11 max-w-md text-base" required />
    </div>
    {errorLine}
    <div className="flex flex-wrap items-center gap-2">
      <Button type="submit" disabled={busy || !email.trim()}>{busy ? 'Sending…' : submitLabel}</Button>
      {onCancel ? <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button> : null}
    </div>
  </form>
}
