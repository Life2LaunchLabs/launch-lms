'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { SiFacebook, SiReddit, SiWhatsapp, SiX } from '@icons-pack/react-simple-icons'
import { Check, Linkedin, Link2, Share2, X } from 'lucide-react'

export default function ResourceShareModal({
  open,
  onClose,
  title,
  description,
  url,
  eyebrow,
  visual,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string | null
  url: string
  eyebrow?: string
  visual?: ReactNode
}) {
  const [copied, setCopied] = useState(false)

  if (!open) return null
  const canNativeShare = typeof navigator !== 'undefined' && Boolean(navigator.share)

  const shareText = `Check out this ${eyebrow?.toLowerCase() || 'resource'}: ${title}`
  const encodedUrl = encodeURIComponent(url)
  const encodedText = encodeURIComponent(shareText)
  const shareLinks = [
    {
      name: 'LinkedIn',
      icon: Linkedin,
      color: 'hover:bg-[#0A66C2] hover:text-white',
      url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    },
    {
      name: 'X',
      icon: SiX,
      color: 'hover:bg-black hover:text-white',
      url: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`,
    },
    {
      name: 'Facebook',
      icon: SiFacebook,
      color: 'hover:bg-[#1877F2] hover:text-white',
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    },
    {
      name: 'WhatsApp',
      icon: SiWhatsapp,
      color: 'hover:bg-[#25D366] hover:text-white',
      url: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
    },
    {
      name: 'Reddit',
      icon: SiReddit,
      color: 'hover:bg-[#FF4500] hover:text-white',
      url: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedText}`,
    },
  ]

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  const nativeShare = async () => {
    if (!canNativeShare) return
    try {
      await navigator.share({ title, text: shareText, url })
      onClose()
    } catch {
      // User cancelled or platform rejected the share.
    }
  }

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-4 nice-shadow">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {visual && <div className="shrink-0">{visual}</div>}
            <div className="min-w-0">
              {eyebrow && <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{eyebrow}</div>}
              <h3 className="truncate text-base font-semibold text-foreground">{title}</h3>
              {description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{description}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-muted transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-1">
          {canNativeShare && (
            <button
              onClick={nativeShare}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              <Share2 size={16} />
              Share
            </button>
          )}
          {shareLinks.map((link) => {
            const Icon = link.icon
            return (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors ${link.color}`}
              >
                <Icon size={16} />
                {link.name}
              </a>
            )
          })}
          <div className="my-1 border-t border-border" />
          <button
            onClick={copyToClipboard}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              copied ? 'bg-green-500 text-white' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {copied ? <Check size={16} /> : <Link2 size={16} />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      </div>
    </div>
  )
}
