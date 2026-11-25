'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Globe, Globe2, Instagram, Linkedin, Youtube, X } from 'lucide-react'
import toast from 'react-hot-toast'

import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { changeEmailAndVerify, getMyPortfolio, resendVerificationEmail } from '@services/portfolio/portfolio'
import type { Shell, SetShell } from './portfolioTypes'

import { tr } from '@/lib/tr'
// The portfolio header's pieces: avatar, socials, the identity editor and email verification.

export function shellSocials(shell: Shell) {
  return Array.isArray(shell.portfolio.socials) ? shell.portfolio.socials.filter((social: any) => social?.type && social?.url).map((social: any) => ({ type: String(social.type), url: String(social.url) })) : []
}

export const SOCIAL_OPTIONS = [
  { type: 'website', get label() { return tr('portfolio.portfolio_header_parts.website', 'Website') } },
  { type: 'instagram', get label() { return tr('portfolio.portfolio_header_parts.instagram', 'Instagram') } },
  { type: 'linkedin', get label() { return tr('portfolio.portfolio_header_parts.linkedin', 'LinkedIn') } },
  { type: 'youtube', get label() { return tr('portfolio.portfolio_header_parts.youtube', 'YouTube') } },
  { type: 'x', label: 'X' },
]

export function socialHandle(type: string, value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
    const host = url.hostname.replace(/^www\./, '').toLowerCase()
    const parts = url.pathname.split('/').filter(Boolean)
    if (type === 'website') return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`.replace(/\/$/, '')
    if (type === 'linkedin' && host === 'linkedin.com') return (parts[0] === 'in' ? parts[1] : parts[0]) || ''
    if (type === 'instagram' && host === 'instagram.com') return parts[0] || ''
    if (type === 'youtube' && host === 'youtube.com') return ['channel', 'c', 'user'].includes(parts[0]) ? parts[1] || '' : parts[0] || ''
    if (type === 'youtube' && host === 'youtu.be') return parts[0] || ''
    if (type === 'x' && (host === 'x.com' || host === 'twitter.com')) return parts[0] || ''
  } catch { /* Parse handles below. */ }
  return trimmed.replace(/^@+/, '').replace(/^https?:\/\//i, '').replace(/^(www\.)?/, '').replace(/^(instagram\.com|x\.com|twitter\.com)\//i, '').replace(/^linkedin\.com\/in\//i, '').replace(/^youtube\.com\/(?:@|channel\/|c\/|user\/)?/i, '').split(/[/?#]/)[0]
}

export function normalizeSocialInput(type: string, value: string) {
  const handle = socialHandle(type, value)
  if (!handle) return ''
  if (type === 'website') return /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${handle}`
  if (type === 'linkedin') return `https://linkedin.com/in/${handle}`
  if (type === 'instagram') return `https://instagram.com/${handle}`
  if (type === 'youtube') return /^UC[a-zA-Z0-9_-]{20,}$/.test(handle) ? `https://youtube.com/channel/${handle}` : `https://youtube.com/@${handle.replace(/^@+/, '')}`
  return `https://x.com/${handle}`
}

export function VerificationMenu({ email, token, setShell, onPublish, busy }: { email: string; token?: string; setShell: SetShell; onPublish: () => void; busy: boolean }) {
  const session = useLHSession() as any
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [editing, setEditing] = useState(false)
  const [nextEmail, setNextEmail] = useState(email)
  const [changing, setChanging] = useState(false)
  const continuingPublishRef = useRef(false)
  useEffect(() => {
    if (!token) return
    const refresh = async () => {
      try {
        const next = await getMyPortfolio(token)
        if (next?.portfolio?.email_verified) {
          setShell(next)
          setOpen(false)
          if (sent && !continuingPublishRef.current) {
            continuingPublishRef.current = true
            onPublish()
          }
        }
      } catch {
        // Verification may still be pending or the tab may be offline.
      }
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [token, setShell, sent, onPublish])
  const resend = async () => {
    setSending(true)
    try {
      const data = await resendVerificationEmail(email)
      if (data?.verified && token) {
        setShell(await getMyPortfolio(token))
        setOpen(false)
        toast.success(tr('portfolio.portfolio_header_parts.email_verified', 'Email verified'))
        continuingPublishRef.current = true
        onPublish()
      } else {
        setSent(true)
        toast.success(tr('portfolio.portfolio_header_parts.verification_email_sent', 'Verification email sent'))
      }
    } catch { toast.error(tr('portfolio.portfolio_header_parts.could_not_resend_verification_email', 'Could not resend verification email')) }
    finally { setSending(false) }
  }
  const changeEmail = async () => {
    const normalized = nextEmail.trim().toLowerCase()
    if (!normalized || normalized === email) { setEditing(false); return }
    setChanging(true)
    try {
      await changeEmailAndVerify(normalized)
      await session?.update?.(true)
      window.location.reload()
    } catch (error: any) { toast.error(error?.message || tr('portfolio.portfolio_header_parts.could_not_change_email', 'Could not change email')); setChanging(false) }
  }
  return <><Button type="button" onClick={() => setOpen(true)} disabled={busy}><Globe2 className="mr-2 h-4 w-4" />{busy ? tr('portfolio.portfolio_header_parts.publishing', 'Publishing…') : tr('portfolio.portfolio_header_parts.publish', 'Publish')}</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-md">{editing ? <div><DialogHeader><DialogTitle>{tr('portfolio.portfolio_header_parts.change_email', 'Change email')}</DialogTitle><DialogDescription>{tr('portfolio.portfolio_header_parts.we_ll_send_the_verification', 'We’ll send the verification link to your new address.')}</DialogDescription></DialogHeader><input type="email" value={nextEmail} onChange={(event) => setNextEmail(event.target.value)} className="mt-5 h-11 w-full rounded-md border border-input bg-background px-3 text-sm" autoFocus /><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => { setEditing(false); setNextEmail(email) }}>{tr('portfolio.connect_request.cancel', 'Cancel')}</Button><Button onClick={changeEmail} disabled={changing}>{changing ? tr('portfolio.portfolio_header_parts.saving', 'Saving…') : tr('portfolio.portfolio_header_parts.save_send', 'Save & send')}</Button></div></div> : <div><DialogHeader><DialogTitle>{tr('portfolio.portfolio_header_parts.verify_your_email_to_publish', 'Verify your email to publish')}</DialogTitle><DialogDescription>{tr('portfolio.portfolio_header_parts.we_need_to_confirm_that', 'We need to confirm that')}{' '}<span className="font-semibold text-foreground">{email}</span>{' '}{tr('portfolio.portfolio_header_parts.belongs_to_you_your_portfolio', 'belongs to you. Your portfolio is ready and will publish as soon as verification finishes.')}</DialogDescription></DialogHeader>{sent ? <div className="mt-5 rounded-xl bg-muted p-4 text-sm"><p className="font-semibold">{tr('portfolio.portfolio_header_parts.check_your_inbox', 'Check your inbox')}</p><p className="mt-1 leading-6 text-muted-foreground">{tr('portfolio.portfolio_header_parts.open_the_verification_link_then', 'Open the verification link, then return here. We’ll continue publishing automatically.')}</p></div> : <Button type="button" className="mt-5 w-full" onClick={resend} disabled={sending}>{sending ? tr('portfolio.portfolio_header_parts.sending', 'Sending…') : tr('portfolio.portfolio_header_parts.send_verification_link', 'Send verification link')}</Button>}<button type="button" onClick={() => setEditing(true)} className="mt-4 w-full text-center text-sm font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground">{tr('portfolio.portfolio_header_parts.use_a_different_email', 'Use a different email')}</button></div>}</DialogContent></Dialog></>
}

const SOCIAL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = { website: Globe, instagram: Instagram, linkedin: Linkedin, youtube: Youtube, x: X }
export function SocialCircles({ socials }: { socials: Array<{ type: string; url: string }> }) {
  const visible = socials.filter((social) => social.url && SOCIAL_ICONS[social.type]).slice(0, 5)
  if (!visible.length) return null
  return <div className="mt-4 flex justify-center gap-2 sm:justify-start">{visible.map((social) => { const Icon = SOCIAL_ICONS[social.type]; const href = /^https?:\/\//i.test(social.url) ? social.url : `https://${social.url}`; return <a key={social.type} href={href} target="_blank" rel="noreferrer" aria-label={social.type} className="flex h-9 w-9 items-center justify-center rounded-full border border-border transition hover:border-foreground"><Icon className="h-4 w-4" /></a> })}</div>
}

export function Avatar({ url, name, compact }: { url?: string; name: string; compact: boolean }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
  return <motion.div layout className={`${compact ? 'h-10 w-10' : 'h-28 w-28 sm:h-36 sm:w-36'} shrink-0 overflow-hidden rounded-full border border-border bg-muted`} transition={{ type: 'spring', stiffness: 320, damping: 32 }}>{url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <span className={`${compact ? 'text-sm' : 'text-3xl'} flex h-full w-full items-center justify-center font-bold text-muted-foreground`}>{initials || 'P'}</span>}</motion.div>
}
