'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { uploadMediaAsset, type MediaAsset, type MediaType } from '@services/media/library'

import { tr } from '@/lib/tr'

/**
 * The file types each kind takes, the same ones the server keeps. Listing image types (not image/*) lets an iPhone
 * turn a HEIC photo into a JPEG as it's picked. A document lists Word and text files by type and by extension, so a
 * phone opens Files rather than the photo library and a Word resume can be picked (DEV-202).
 */
export const HAND_IN_ACCEPT: Record<MediaType, string> = {
  image: 'image/jpeg,image/png,image/gif,image/webp',
  video: 'video/mp4,video/webm,video/quicktime',
  document: 'application/pdf,.pdf,application/msword,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,text/plain,.txt',
}

const HAND_IN_EXTENSIONS: Record<MediaType, string[]> = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
  video: ['mp4', 'webm', 'mov'],
  document: ['pdf', 'doc', 'docx', 'txt'],
}

const handInTypes = (kind: MediaType) => ({
  image: tr('goals.hand_in.types_image', 'a JPG, PNG, GIF or WebP photo'),
  video: tr('goals.hand_in.types_video', 'an MP4, WebM or MOV video'),
  document: tr('goals.hand_in.types_document', 'a PDF, a Word file (.doc or .docx) or a text file'),
})[kind]

/** Why a picked file can't go in, naming the types that work, or null when it can. Some pickers let any file through. */
export function handInRefusal(kind: MediaType, file: Pick<File, 'name'>): string | null {
  const extension = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : ''
  if (HAND_IN_EXTENSIONS[kind].includes(extension)) return null
  return tr('goals.hand_in.wrong_type', 'That file can’t be added here. Choose {{types}}.', { types: handInTypes(kind) })
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
    const refusal = handInRefusal(kind, file)
    if (refusal) {
      toast.error(refusal)
      return
    }
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
