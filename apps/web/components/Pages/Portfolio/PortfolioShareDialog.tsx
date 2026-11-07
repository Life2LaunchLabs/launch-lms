'use client'

import { useState } from 'react'
import QRCode from 'qrcode'
import { SiFacebook, SiWhatsapp, SiX } from '@icons-pack/react-simple-icons'
import { Check, Copy, Download, Linkedin, Send, Share2 } from 'lucide-react'
import toast from 'react-hot-toast'

import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { getUriWithOrg } from '@services/config/config'

import { tr } from '@/lib/tr'
export function PortfolioShareButton({ orgslug, username, displayName, published, onPublish, busy, compact = false, className }: { orgslug: string; username?: string; displayName: string; published: boolean; onPublish: () => void; busy: boolean; compact?: boolean; className?: string }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copied, setCopied] = useState<'link' | 'qr' | null>(null)

  function openDialog() {
    const nextUrl = username ? new URL(getUriWithOrg(orgslug, `/user/${encodeURIComponent(username)}`), window.location.origin).toString() : ''
    setUrl(nextUrl)
    setQrDataUrl('')
    setOpen(true)
    if (nextUrl) QRCode.toDataURL(nextUrl, { width: 720, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#0f172a', light: '#ffffff' } }).then(setQrDataUrl).catch(() => toast.error(tr('portfolio.portfolio_share_dialog.could_not_generate_the_qr', 'Could not generate the QR code')))
  }

  async function copyLink() {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied('link'); toast.success(tr('portfolio.portfolio_share_dialog.portfolio_link_copied', 'Portfolio link copied')); window.setTimeout(() => setCopied(null), 1600)
  }

  async function copyQr() {
    if (!qrDataUrl) return
    try {
      const blob = await (await fetch(qrDataUrl)).blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setCopied('qr'); toast.success(tr('portfolio.portfolio_share_dialog.qr_code_copied', 'QR code copied')); window.setTimeout(() => setCopied(null), 1600)
    } catch { downloadQr(); toast.success(tr('portfolio.portfolio_share_dialog.qr_code_downloaded', 'QR code downloaded')) }
  }

  function downloadQr() {
    if (!qrDataUrl) return
    const link = document.createElement('a'); link.href = qrDataUrl; link.download = `${username || 'portfolio'}-qr-code.png`; link.click()
  }

  const shareText = `Take a look at ${displayName}'s portfolio`
  const encodedUrl = encodeURIComponent(url)
  const encodedText = encodeURIComponent(shareText)
  const socials = [
    { name: 'LinkedIn', icon: Linkedin, href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}` },
    { name: 'X', icon: SiX, href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}` },
    { name: 'Facebook', icon: SiFacebook, href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
    { name: 'WhatsApp', icon: SiWhatsapp, href: `https://wa.me/?text=${encodedText}%20${encodedUrl}` },
  ]

  return <>
    <Button type="button" size="sm" variant="surface" className={className} onClick={openDialog} aria-label={tr('portfolio.portfolio_share_dialog.share_portfolio', 'Share portfolio')}><Share2 className="h-4 w-4" />{!compact && tr('portfolio.portfolio_share_dialog.share', 'Share')}</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden p-0">
      <DialogHeader className="shrink-0 border-b border-border px-6 py-5 pr-12"><DialogTitle>{tr('portfolio.portfolio_share_dialog.share_your_portfolio', 'Share your portfolio')}</DialogTitle><DialogDescription>{tr('portfolio.portfolio_share_dialog.let_someone_scan_your_code', 'Let someone scan your code, or send them your link.')}</DialogDescription></DialogHeader>
      {!published ? <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-8 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted"><Send className="h-5 w-5 text-muted-foreground" /></div><div><h3 className="font-semibold">{tr('portfolio.portfolio_share_dialog.publish_before_sharing', 'Publish before sharing')}</h3><p className="mt-1 text-sm text-muted-foreground">{tr('portfolio.portfolio_share_dialog.your_public_link_will_work', 'Your public link will work for anyone once your portfolio is published.')}</p></div><Button onClick={() => { setOpen(false); onPublish() }} disabled={busy}>{busy ? tr('portfolio.portfolio_header_parts.publishing', 'Publishing…') : tr('portfolio.portfolio_share_dialog.publish_portfolio', 'Publish portfolio')}</Button></div> :
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-6 py-6">
        <div className="mx-auto w-full max-w-[260px] rounded-2xl border border-border bg-white p-4 shadow-sm"><div className="aspect-square w-full">{qrDataUrl ? <img src={qrDataUrl} alt={tr('portfolio.portfolio_share_dialog.qr_code_for_displayname_s', 'QR code for {{displayName}}\'s portfolio', { displayName })} className="h-full w-full" /> : <div className="flex h-full items-center justify-center text-sm text-slate-400">{tr('portfolio.portfolio_share_dialog.generating_qr_code', 'Generating QR code…')}</div>}</div><Button type="button" variant="ghost" size="sm" className="mt-2 w-full text-slate-700 hover:bg-slate-100" onClick={() => void copyQr()} disabled={!qrDataUrl}>{copied === 'qr' ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}{copied === 'qr' ? tr('portfolio.portfolio_share_dialog.qr_copied', 'QR copied') : tr('portfolio.portfolio_share_dialog.copy_qr_code', 'Copy QR code')}</Button></div>
        <div><label htmlFor="portfolio-share-url" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr('portfolio.portfolio_share_dialog.public_link', 'Public link')}</label><div className="flex min-w-0 gap-2"><input id="portfolio-share-url" readOnly value={url} onFocus={(event) => event.currentTarget.select()} className="h-10 min-w-0 flex-1 rounded-md border border-input bg-muted/40 px-3 text-sm" /><Button type="button" variant="outline" size="icon" onClick={() => void copyLink()} aria-label={tr('portfolio.portfolio_share_dialog.copy_portfolio_link', 'Copy portfolio link')}>{copied === 'link' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button></div></div>
        <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr('portfolio.portfolio_share_dialog.share_to', 'Share to')}</p><div className="grid grid-cols-4 gap-2">{socials.map(({ name, icon: Icon, href }) => <a key={name} href={href} target="_blank" rel="noopener noreferrer" aria-label={tr('portfolio.portfolio_share_dialog.share_on_name', 'Share on {{name}}', { name })} title={name} className="flex h-11 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Icon className="h-4 w-4" /></a>)}</div></div>
        {typeof navigator !== 'undefined' && navigator.share && <Button type="button" className="w-full" onClick={() => void navigator.share({ title: tr('portfolio.portfolio_share_dialog.displayname_s_portfolio', '{{displayName}}\'s portfolio', { displayName }), text: shareText, url }).catch(() => undefined)}><Share2 className="mr-2 h-4 w-4" />{tr('portfolio.portfolio_share_dialog.more_sharing_options', 'More sharing options')}</Button>}
        <button type="button" onClick={downloadQr} disabled={!qrDataUrl} className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"><Download className="h-3.5 w-3.5" />{tr('portfolio.portfolio_share_dialog.download_qr_code', 'Download QR code')}</button>
      </div>}
    </DialogContent></Dialog>
  </>
}
