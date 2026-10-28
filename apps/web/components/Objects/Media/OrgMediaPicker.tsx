'use client'

import React from 'react'
import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import StockMediaTab from '@components/Objects/Media/StockMediaTab'
import type { MediaAsset, MediaType } from '@services/media/library'

type Props = {
  open: boolean
  // eslint-disable-next-line no-unused-vars
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  orgId: number
  mediaType: MediaType
  accessToken?: string
  initialTab?: 'stock' | 'upload' | 'library'
  // eslint-disable-next-line no-unused-vars
  onSave: (asset: MediaAsset) => Promise<void> | void
}

/**
 * The media picker for an organization's own content (plan covers, badge images, activity media):
 * upload, its media library, and free stock photos and videos for images and videos.
 */
export default function OrgMediaPicker({ orgId, mediaType, accessToken, onSave, onOpenChange, initialTab = 'upload', ...rest }: Props) {
  const stock = mediaType === 'image' || mediaType === 'video'
  const pick = async (asset: MediaAsset) => {
    await onSave(asset)
    onOpenChange(false)
  }
  const customTabs = stock
    ? [{ value: 'stock', label: mediaType === 'video' ? 'Stock videos' : 'Stock photos', content: <StockMediaTab orgId={orgId} kind={mediaType === 'video' ? 'video' : 'photo'} accessToken={accessToken} onPick={pick} /> }]
    : []
  return <MediaPickerDialog {...rest} owner={{ type: 'org', id: orgId }} mediaType={mediaType} accessToken={accessToken} onSave={onSave} onOpenChange={onOpenChange}
    customTabs={customTabs} initialTab={stock ? initialTab : initialTab === 'stock' ? 'upload' : initialTab} />
}
