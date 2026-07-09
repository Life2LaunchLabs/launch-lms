'use client'

import React from 'react'
import QRCode from 'qrcode'
import toast from 'react-hot-toast'
import { Copy, Download, ExternalLink, UserSquare } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@components/ui/dialog'
import dayjs from 'dayjs'

type InviteDetails = {
  invite_code: string
  display_name?: string
  expires_at?: string
  created_at: string
  usergroup_id?: number
  usergroup_name?: string
}

export default function SignupQrDialog({
  invite,
  url,
  open,
  onOpenChange,
}: {
  invite: InviteDetails | null
  url: string
  open: boolean
  onOpenChange: React.Dispatch<React.SetStateAction<boolean>>
}) {
  const [dataUrl, setDataUrl] = React.useState('')

  React.useEffect(() => {
    if (!open || !url) return
    setDataUrl('')
    QRCode.toDataURL(url, {
      width: 640,
      margin: 2,
      color: { dark: '#111827', light: '#ffffff' },
    }).then(setDataUrl)
  }, [open, url])

  if (!invite) return null

  const copy = async (text: string, message: string) => {
    await navigator.clipboard.writeText(text)
    toast.success(message)
  }

  const download = () => {
    if (!dataUrl) return
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `${invite.display_name || invite.invite_code}-qr-code.png`
    link.click()
  }

  const expiry = dayjs(invite.expires_at || invite.created_at)
    .add(invite.expires_at ? 0 : 1, 'year')
    .format('MMM D, YYYY')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg overflow-hidden p-6">
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle className="truncate">{invite.display_name || invite.invite_code}</DialogTitle>
          <DialogDescription>Invite code details and shareable signup QR code.</DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 gap-5 py-2 sm:grid-cols-[1fr_180px]">
          <div className="min-w-0 space-y-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Invite code</div>
              <div className="mt-1 flex min-w-0 items-center gap-2">
                <code className="min-w-0 truncate rounded-md bg-gray-50 px-2 py-1 text-sm text-gray-700">{invite.invite_code}</code>
                <button type="button" onClick={() => void copy(invite.invite_code, 'Invite code copied')} className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Copy invite code">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Expires</div>
              <div className="mt-1 text-sm font-medium text-gray-700">{expiry}</div>
            </div>
            {invite.usergroup_id && (
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-gray-400">User group</div>
                <div className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                  <UserSquare className="h-3 w-3 shrink-0" />
                  <span className="truncate">{invite.usergroup_name || 'Linked user group'}</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex aspect-square w-full max-w-[180px] items-center justify-center justify-self-center rounded-xl border border-gray-200 bg-white p-3">
            {dataUrl ? <img src={dataUrl} alt="QR code for signup link" className="h-full w-full" /> : <span className="text-center text-xs text-gray-400">Generating QR code…</span>}
          </div>
        </div>

        <div className="min-w-0 rounded-lg bg-gray-50 px-3 py-2">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Signup link</div>
          <p className="mt-1 break-all text-xs leading-5 text-gray-600">{url}</p>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
          <button type="button" onClick={() => void copy(url, 'Signup link copied')} className="inline-flex min-w-0 items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Copy className="h-4 w-4 shrink-0" />
            <span className="truncate">Copy link</span>
          </button>
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <ExternalLink className="h-4 w-4 shrink-0" />
            <span className="truncate">Open link</span>
          </a>
          <button type="button" onClick={download} disabled={!dataUrl} className="inline-flex min-w-0 items-center justify-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50">
            <Download className="h-4 w-4 shrink-0" />
            <span className="truncate">Download QR</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
