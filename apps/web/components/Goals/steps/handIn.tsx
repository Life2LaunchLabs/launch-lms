'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { uploadMediaAsset, type MediaAsset, type MediaType } from '@services/media/library'

import { tr } from '@/lib/tr'

/**
 * The file types each kind takes. Listing image types (not image/*) lets an iPhone turn a HEIC photo into a
 * JPEG as it's picked, which is what the server keeps.
 */
export const HAND_IN_ACCEPT: Record<MediaType, string> = {
  image: 'image/jpeg,image/png,image/gif,image/webp',
  video: 'video/mp4,video/webm,video/quicktime',
  document: 'application/pdf',
}

type Uploaded = { token?: string; viewerUserId?: number; onUploaded: (asset: MediaAsset, file: File) => Promise<unknown> } // eslint-disable-line no-unused-vars

/**
 * Handing in a file on a step in one tap: a plain file input, so a phone offers its camera and photos (or files)
 * straight away, and the upload starts as soon as something is picked. No media library to find your way through,
 * no second button to press. Render `input` once; call `pick` from the step's own button.
 */
export function useHandIn({ token, viewerUserId, onUploaded }: Uploaded) {
  const ref = React.useRef<HTMLInputElement>(null)
  const [kind, setKind] = React.useState<MediaType>('image')
  const [uploading, setUploading] = React.useState(false)
  const pick = (next: MediaType) => {
    setKind(next)
    if (ref.current) {
      // Set straight away too: the click below happens before React re-renders.
      ref.current.accept = HAND_IN_ACCEPT[next]
      ref.current.click()
    }
  }
  const upload = async (file?: File) => {
    if (!file) return
    if (!token || viewerUserId === undefined) {
      toast.error(tr('goals.hand_in.sign_in_again', 'Sign in again to add a file'))
      return
    }
    setUploading(true)
    try {
      const asset = await uploadMediaAsset({ type: 'user', id: viewerUserId }, kind, file, token, file.name)
      await onUploaded(asset, file)
    } catch (failure: any) {
      toast.error(failure?.message || tr('goals.hand_in.didnt_upload', 'That didn’t upload. Try again.'))
    } finally {
      setUploading(false)
    }
  }
  const input = <input ref={ref} type="file" hidden accept={HAND_IN_ACCEPT[kind]} data-hand-in=""
    onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void upload(file) }} />
  return { input, pick, uploading, kind }
}
