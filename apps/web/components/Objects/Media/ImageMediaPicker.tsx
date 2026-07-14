'use client'

import React from 'react'
import { ImageIcon } from 'lucide-react'
import { Button } from '@components/ui/button'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import { MediaAsset, MediaOwner } from '@services/media/library'

type ImageMediaPickerProps = {
  owner: MediaOwner
  title?: string
  description?: string
  buttonText?: string
  buttonVariant?: React.ComponentProps<typeof Button>['variant']
  buttonSize?: React.ComponentProps<typeof Button>['size']
  className?: string
  disabled?: boolean
  onSelect: (url: string, asset: MediaAsset) => Promise<void> | void
}

export default function ImageMediaPicker({
  owner,
  title = 'Choose image',
  description = 'Upload, link, or select an image from the media library.',
  buttonText = 'Choose image',
  buttonVariant = 'outline',
  buttonSize = 'default',
  className,
  disabled,
  onSelect,
}: ImageMediaPickerProps) {
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <Button
        type="button"
        variant={buttonVariant}
        size={buttonSize}
        className={className}
        disabled={disabled || !accessToken}
        onClick={() => setOpen(true)}
      >
        <ImageIcon className="size-4" />
        {buttonText}
      </Button>
      <MediaPickerDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        owner={owner}
        mediaType="image"
        accessToken={accessToken}
        onSave={(asset) => onSelect(asset.url, asset)}
      />
    </>
  )
}
