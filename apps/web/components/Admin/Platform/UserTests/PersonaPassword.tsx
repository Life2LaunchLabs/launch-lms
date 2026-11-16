'use client'
import { useState } from 'react'
import { Button } from '@components/ui/button'
import { revealPersonaPassword } from '@services/userTests/userTests'

/** Shows a persona's sign-in password, so a tester can sign out and back in on the Login form (DEV-126).
 *  The persona stays sealed in its run either way; the password only works while the run is open. */
export default function PersonaPassword({ userId, name, disabled }: { userId: number; name: string; disabled?: boolean }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function show() {
    setBusy(true); setError('')
    try { setPassword((await revealPersonaPassword(userId)).password) } catch (failure) { setError((failure as Error).message) }
    finally { setBusy(false) }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(password); setCopied(true); window.setTimeout(() => setCopied(false), 2000) } catch { setCopied(false) }
  }

  if (!password) return <div className="text-right">
    <Button size="sm" variant="ghost" disabled={disabled || busy} onClick={() => void show()} aria-label={`Show ${name}'s sign-in password`}>{busy ? 'Loading…' : 'Password'}</Button>
    {error ? <p role="alert" className="mt-1 text-xs text-destructive">{error}</p> : null}
  </div>
  return <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
    <span className="text-muted-foreground">Password</span>
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono" aria-label={`${name}'s sign-in password`}>{password}</code>
    <Button size="sm" variant="ghost" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</Button>
  </div>
}
