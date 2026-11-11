'use client'
import { useEffect, useState } from 'react'
import { Button } from '@components/ui/button'
import { createLoginLink } from '@services/userTests/userTests'

/** Makes a one-use login link for a persona and offers to copy it or open it here. */
export function useLoginLink() {
  const [link, setLink] = useState<{ url: string; expiresAt: number; label: string } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  /** ``origin``: the host to sign in on, such as an org's own site for a link from its email. */
  async function make(userId: number, label: string, targetPath = '/', origin = '') {
    setBusy(true); setError('')
    try {
      const result = await createLoginLink(userId, targetPath)
      setLink({ url: `${origin || window.location.origin}${result.path}`, expiresAt: Date.parse(result.expires_at), label })
    } catch (failure) { setError((failure as Error).message) }
    finally { setBusy(false) }
  }

  return { link, error, busy, make, clear: () => setLink(null) }
}

export default function LoginLinkPanel({ link, error, onClose }: { link: { url: string; expiresAt: number; label: string } | null; error: string; onClose: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  const [copiedUrl, setCopiedUrl] = useState('')
  useEffect(() => {
    if (!link) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [link])

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>
  if (!link) return null
  const copied = copiedUrl === link.url
  const seconds = Math.max(0, Math.round((link.expiresAt - now) / 1000))
  async function copy() {
    try { await navigator.clipboard.writeText(link!.url); setCopiedUrl(link!.url) } catch { setCopiedUrl('') }
  }

  return <div role="region" aria-label="Login link" className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 text-sm dark:border-indigo-900 dark:bg-indigo-950/30">
    <div className="flex flex-wrap items-start gap-2">
      <p className="min-w-0 flex-1"><b>Login link for {link.label}</b><br /><span className="text-muted-foreground">{seconds > 0 ? `Works once, for the next ${seconds} seconds. Open it in a separate browser profile so you stay signed in here.` : 'This link has expired. Make a new one.'}</span></p>
      <Button type="button" size="sm" variant="ghost" onClick={onClose}>Close</Button>
    </div>
    <code className="block break-all rounded-lg border bg-background px-3 py-2 text-xs">{link.url}</code>
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" onClick={copy} disabled={seconds === 0}>{copied ? 'Copied' : 'Copy link'}</Button>
      <Button type="button" size="sm" variant="outline" disabled={seconds === 0} onClick={() => window.location.assign(link.url)}>Open in this browser (signs you out here)</Button>
    </div>
  </div>
}
