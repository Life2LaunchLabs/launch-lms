'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Camera, Globe, Globe2, Instagram, Linkedin, Plus, Trash2, Youtube, X } from 'lucide-react'
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

export function HeaderEditor({ open, onOpenChange, shell, avatarUrl, displayName, socials, setSocials, onAvatarClick, onSubmit, busy }: any) {
  const missing = SOCIAL_OPTIONS.filter((option) => !socials.some((social: any) => social.type === option.type))
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="bottom-0 left-0 top-auto h-[92dvh] max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-t-3xl border-x-0 border-b-0 p-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:h-[88dvh] sm:max-h-[760px] sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border"><form onSubmit={onSubmit} className="flex h-full min-h-0 flex-col overflow-hidden"><DialogHeader className="shrink-0 border-b border-border px-6 py-5"><DialogTitle>{tr('portfolio.portfolio_header_parts.edit_portfolio_header', 'Edit portfolio header')}</DialogTitle><DialogDescription>{tr('portfolio.portfolio_header_parts.update_the_identity_shown_at', 'Update the identity shown at the top of your portfolio.')}</DialogDescription></DialogHeader><div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-6 py-6"><div className="flex justify-center"><button type="button" onClick={onAvatarClick} className="group relative h-28 w-28 overflow-hidden rounded-full border border-border bg-muted" aria-label={tr('portfolio.portfolio_header_parts.change_profile_image', 'Change profile image')}>{avatarUrl ? <img src={avatarUrl} alt={tr('portfolio.portfolio_header_parts.profile_preview', 'Profile preview')} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-2xl font-bold text-muted-foreground">{displayName.slice(0, 1)}</span>}<span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white transition group-hover:bg-black/45"><Camera className="h-6 w-6 opacity-0 transition group-hover:opacity-100" /></span></button></div><div className="grid gap-4"><label className="grid gap-2 text-sm font-semibold">{tr('portfolio.portfolio_header_parts.name', 'Name')}<input name="display_name" defaultValue={shell.portfolio.display_name} placeholder={displayName || tr('portfolio.portfolio_header_parts.first_name_last_name', 'First name Last name')} className="h-11 rounded-md border border-input bg-background px-3 font-normal" /></label><label className="grid gap-2 text-sm font-semibold">{tr('portfolio.portfolio_header_parts.tagline', 'Tagline')}<input name="headline" defaultValue={shell.portfolio.headline} placeholder={tr('portfolio.portfolio_header_parts.what_do_you_want_people', 'What do you want people to know first?')} className="h-11 rounded-md border border-input bg-background px-3 font-normal" /></label><label className="grid gap-2 text-sm font-semibold">{tr('portfolio.portfolio_header_parts.location', 'Location')}<input name="location_label" defaultValue={shell.portfolio.location_label} placeholder={tr('portfolio.portfolio_header_parts.city_region', 'City, region')} className="h-11 rounded-md border border-input bg-background px-3 font-normal" /></label></div><section><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">{tr('portfolio.portfolio_header_parts.social_links', 'Social links')}</h3>{missing.length > 0 && <Button type="button" size="sm" variant="outline" onClick={() => setSocials((current: any[]) => [...current, { type: missing[0].type, url: '' }])}><Plus className="mr-1.5 h-4 w-4" />{tr('portfolio.portfolio_header_parts.add', 'Add')}</Button>}</div><div className="space-y-3">{socials.map((social: any, index: number) => <div key={`${social.type}-${index}`} className="flex gap-2"><select aria-label={tr('portfolio.portfolio_header_parts.social_platform', 'Social platform')} value={social.type} onChange={(event) => setSocials((current: any[]) => current.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value } : item))} className="h-11 w-32 rounded-md border border-input bg-background px-2 text-sm">{SOCIAL_OPTIONS.filter((option) => option.type === social.type || !socials.some((item: any) => item.type === option.type)).map((option) => <option key={option.type} value={option.type}>{option.label}</option>)}</select><input aria-label={`${social.type} URL`} value={social.url} onChange={(event) => setSocials((current: any[]) => current.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item))} placeholder="https://" className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm" /><Button type="button" size="icon" variant="ghost" aria-label={`Remove ${social.type}`} onClick={() => setSocials((current: any[]) => current.filter((_: any, itemIndex: number) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button></div>)}{!socials.length && <p className="py-3 text-sm text-muted-foreground">{tr('portfolio.portfolio_header_parts.add_links_so_visitors_can', 'Add links so visitors can find you elsewhere.')}</p>}</div></section></div><div className="shrink-0 flex justify-end gap-2 border-t border-border bg-popover px-6 py-4"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{tr('portfolio.connect_request.cancel', 'Cancel')}</Button><Button disabled={busy}>{busy ? tr('portfolio.portfolio_header_parts.saving', 'Saving…') : tr('portfolio.portfolio_header_parts.save_header', 'Save header')}</Button></div></form></DialogContent></Dialog>
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
