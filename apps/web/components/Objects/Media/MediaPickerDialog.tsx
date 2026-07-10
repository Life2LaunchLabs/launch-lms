'use client'

import React from 'react'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Edit2,
  FileImage,
  Film,
  Folder,
  ImageIcon,
  Link as LinkIcon,
  Loader2,
  Plus,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { Input } from '@components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  MediaAsset,
  MediaFolder,
  MediaOwner,
  MediaType,
  createMediaFolder,
  createMediaLinkAsset,
  deleteMediaFolder,
  listMediaFolders,
  listMediaAssets,
  updateMediaAssetFolder,
  updateMediaFolder,
  uploadMediaAsset,
} from '@services/media/library'

type CustomTab = {
  value: string
  label: string
  content: React.ReactNode
}

type MediaPickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  owner: MediaOwner
  mediaType: MediaType
  accessToken?: string
  initialTab?: 'upload' | 'library'
  onSave: (asset: MediaAsset) => Promise<void> | void
  onSelect?: (asset: MediaAsset) => void
  customTabs?: CustomTab[]
}

const MEDIA_ACCEPT: Record<MediaType, string> = {
  image: 'image/jpeg,image/png,image/gif,image/webp',
  video: 'video/mp4,video/webm,video/quicktime',
}

function isProbablyUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch (_error) {
    return false
  }
}

function assetPreview(asset: MediaAsset) {
  return asset.thumbnail_url || asset.url
}

function formatBytes(bytes?: number | null) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function defaultFolderForAsset(asset: MediaAsset) {
  return asset.source_type === 'link' ? 'Links' : 'Uploads'
}

export default function MediaPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  owner,
  mediaType,
  accessToken,
  initialTab = 'upload',
  onSave,
  onSelect,
  customTabs = [],
}: MediaPickerDialogProps) {
  const [tab, setTab] = React.useState<string>(initialTab)
  const [assets, setAssets] = React.useState<MediaAsset[]>([])
  const [folders, setFolders] = React.useState<MediaFolder[]>([])
  const [openFolderName, setOpenFolderName] = React.useState<string | null>(null)
  const [sortOrder, setSortOrder] = React.useState<'newest' | 'oldest'>('newest')
  const [editingFolderUuid, setEditingFolderUuid] = React.useState<string | null>(null)
  const [editingFolderName, setEditingFolderName] = React.useState('')
  const [selectedAsset, setSelectedAsset] = React.useState<MediaAsset | null>(null)
  const [pendingFolderName, setPendingFolderName] = React.useState<string | null>(null)
  const [folderActionFeedback, setFolderActionFeedback] = React.useState('')
  const [file, setFile] = React.useState<File | null>(null)
  const [linkUrl, setLinkUrl] = React.useState('')
  const [linkError, setLinkError] = React.useState('')
  const [isDragging, setIsDragging] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(false)
  const [isVerifyingLink, setIsVerifyingLink] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)
  const [error, setError] = React.useState('')
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const folderNameInputRef = React.useRef<HTMLInputElement | null>(null)
  const folderActionFeedbackTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const ownerType = owner.type
  const ownerId = owner.id

  const filePreviewUrl = React.useMemo(() => {
    if (!file) return ''
    return URL.createObjectURL(file)
  }, [file])

  React.useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl)
    }
  }, [filePreviewUrl])

  React.useEffect(() => {
    return () => {
      if (folderActionFeedbackTimerRef.current) clearTimeout(folderActionFeedbackTimerRef.current)
    }
  }, [])

  const showFolderActionFeedback = React.useCallback((message: string) => {
    setFolderActionFeedback(message)
    if (folderActionFeedbackTimerRef.current) clearTimeout(folderActionFeedbackTimerRef.current)
    folderActionFeedbackTimerRef.current = setTimeout(() => {
      setFolderActionFeedback('')
      folderActionFeedbackTimerRef.current = null
    }, 1800)
  }, [])

  const loadAssets = React.useCallback(async () => {
    if (!open || !accessToken) return
    try {
      setIsLoading(true)
      setError('')
      const [nextAssets, nextFolders] = await Promise.all([
        listMediaAssets({ type: ownerType, id: ownerId }, mediaType, accessToken),
        listMediaFolders({ type: ownerType, id: ownerId }, accessToken),
      ])
      setAssets(nextAssets)
      setFolders(nextFolders)
    } catch (err: any) {
      setError(err?.message || 'Unable to load media library')
    } finally {
      setIsLoading(false)
    }
  }, [accessToken, mediaType, open, ownerId, ownerType])

  React.useEffect(() => {
    if (open) {
      setTab(initialTab)
      setOpenFolderName(null)
      setEditingFolderUuid(null)
      setEditingFolderName('')
      setFolderActionFeedback('')
      loadAssets()
    }
  }, [initialTab, loadAssets, open])

  React.useEffect(() => {
    if (!editingFolderUuid) return
    requestAnimationFrame(() => {
      folderNameInputRef.current?.focus()
      folderNameInputRef.current?.select()
    })
  }, [editingFolderUuid])

  const sortedAssets = React.useMemo(() => {
    return [...assets].sort((a, b) => {
      const aTime = Date.parse(a.creation_date || '') || a.id
      const bTime = Date.parse(b.creation_date || '') || b.id
      return sortOrder === 'newest' ? bTime - aTime : aTime - bTime
    })
  }, [assets, sortOrder])

  const folderItems = React.useMemo(() => {
    const map = new Map<string, { name: string; folder?: MediaFolder; assets: MediaAsset[] }>()
    map.set('Uploads', { name: 'Uploads', assets: [] })
    map.set('Links', { name: 'Links', assets: [] })
    folders.forEach((folder) => {
      map.set(folder.name, { name: folder.name, folder, assets: [] })
    })
    assets.forEach((asset) => {
      const systemName = defaultFolderForAsset(asset)
      const systemItem = map.get(systemName) || { name: systemName, assets: [] }
      systemItem.assets.push(asset)
      map.set(systemName, systemItem)

      if (asset.folder && asset.folder !== 'Uploads' && asset.folder !== 'Links') {
        const customItem = map.get(asset.folder) || { name: asset.folder, assets: [] }
        customItem.assets.push(asset)
        map.set(asset.folder, customItem)
      }
    })
    return Array.from(map.values()).sort((a, b) => {
      if (a.name === 'Uploads') return -1
      if (b.name === 'Uploads') return 1
      if (a.name === 'Links') return -1
      if (b.name === 'Links') return 1
      return a.name.localeCompare(b.name)
    })
  }, [assets, folders])

  const openFolder = folderItems.find((folder) => folder.name === openFolderName) || null
  const visibleLibraryAssets = openFolder
    ? sortedAssets.filter((asset) => (
      openFolder.name === 'Uploads' || openFolder.name === 'Links'
        ? defaultFolderForAsset(asset) === openFolder.name
        : asset.folder === openFolder.name
    ))
    : sortedAssets

  const recentAssets = assets.slice(0, 5)
  const linkLooksValid = !linkUrl.trim() || isProbablyUrl(linkUrl.trim())
  const activeName = file?.name || selectedAsset?.title || ''
  const activeDetail = file ? formatBytes(file.size) : selectedAsset?.source_type === 'link' ? 'Linked media' : selectedAsset ? formatBytes(selectedAsset.size_bytes) || 'Uploaded media' : ''
  const canSave = Boolean(file || selectedAsset)
  const previewUrl = file ? filePreviewUrl : selectedAsset ? assetPreview(selectedAsset) : ''

  const handleFile = (nextFile?: File | null) => {
    if (!nextFile) return
    setFile(nextFile)
    setSelectedAsset(null)
    setPendingFolderName(null)
    setFolderActionFeedback('')
    setLinkUrl('')
    setLinkError('')
    setError('')
  }

  const clearSelection = () => {
    setFile(null)
    setSelectedAsset(null)
    setPendingFolderName(null)
    setFolderActionFeedback('')
    setLinkUrl('')
    setLinkError('')
    setError('')
  }

  const handleVerifyLink = async () => {
    if (!accessToken || !linkUrl.trim() || !linkLooksValid) return
    try {
      setIsVerifyingLink(true)
      setLinkError('')
      setError('')
      setFile(null)
      setSelectedAsset(null)
      const asset = await createMediaLinkAsset(owner, mediaType, linkUrl.trim(), accessToken)
      setSelectedAsset(asset)
      setPendingFolderName(null)
      setFolderActionFeedback('')
      setLinkUrl('')
      await loadAssets()
    } catch (err: any) {
      setSelectedAsset(null)
      setLinkError(err?.message || `Could not verify this ${mediaNoun} link`)
    } finally {
      setIsVerifyingLink(false)
    }
  }

  const handleCreateFolder = async () => {
    if (!accessToken) return
    try {
      setError('')
      const folder = await createUniqueFolder()
      if (!folder) return
      setOpenFolderName(folder.name)
      setEditingFolderUuid(folder.folder_uuid)
      setEditingFolderName(folder.name)
    } catch (err: any) {
      setError(err?.message || 'Unable to create folder')
    }
  }

  const createUniqueFolder = async () => {
    if (!accessToken) return null
    const existingNames = new Set(folderItems.map((folder) => folder.name.toLowerCase()))
    let name = 'New folder'
    let suffix = 2
    while (existingNames.has(name.toLowerCase())) {
      name = `New folder ${suffix}`
      suffix += 1
    }
    const folder = await createMediaFolder(owner, name, accessToken)
    setFolders((current) => [...current, folder])
    return folder
  }

  const assignActiveMediaToFolder = async (folderName: string | null) => {
    if (!accessToken) return
    if (file) {
      const previousFolder = pendingFolderName || 'folder'
      setPendingFolderName(folderName)
      showFolderActionFeedback(folderName ? `Added to ${folderName}` : `Removed from ${previousFolder}`)
      return
    }
    if (!selectedAsset) return
    const previousFolder = selectedAsset.folder || defaultFolderForAsset(selectedAsset)
    try {
      setError('')
      const updated = await updateMediaAssetFolder(selectedAsset.asset_uuid, folderName, accessToken)
      setSelectedAsset(updated)
      setAssets((current) => current.map((asset) => asset.asset_uuid === updated.asset_uuid ? updated : asset))
      showFolderActionFeedback(folderName ? `Added to ${updated.folder}` : `Removed from ${previousFolder}`)
    } catch (err: any) {
      setError(err?.message || 'Unable to move media')
    }
  }

  const createFolderForActiveMedia = async () => {
    try {
      setError('')
      const folder = await createUniqueFolder()
      if (!folder) return
      await assignActiveMediaToFolder(folder.name)
      setOpenFolderName(folder.name)
      setEditingFolderUuid(folder.folder_uuid)
      setEditingFolderName(folder.name)
    } catch (err: any) {
      setError(err?.message || 'Unable to create folder')
    }
  }

  const startRenameFolder = (folder: MediaFolder) => {
    setEditingFolderUuid(folder.folder_uuid)
    setEditingFolderName(folder.name)
  }

  const confirmRenameFolder = async (folder: MediaFolder) => {
    if (!accessToken) return
    const name = editingFolderName.trim()
    if (!name) {
      setError('Folder name is required')
      return
    }
    if (name === folder.name) {
      setEditingFolderUuid(null)
      setEditingFolderName('')
      return
    }
    try {
      setError('')
      const updated = await updateMediaFolder(folder.folder_uuid, name, accessToken)
      setFolders((current) => current.map((item) => item.folder_uuid === folder.folder_uuid ? updated : item))
      setAssets((current) => current.map((asset) => asset.folder === folder.name ? { ...asset, folder: updated.name } : asset))
      setOpenFolderName(updated.name)
      setEditingFolderUuid(null)
      setEditingFolderName('')
    } catch (err: any) {
      setError(err?.message || 'Unable to rename folder')
    }
  }

  const handleDeleteFolder = async (folder: MediaFolder) => {
    if (!accessToken) return
    const confirmed = window.confirm(`Delete "${folder.name}"? Media in this folder will move to Uploads.`)
    if (!confirmed) return
    try {
      setError('')
      await deleteMediaFolder(folder.folder_uuid, accessToken)
      setFolders((current) => current.filter((item) => item.folder_uuid !== folder.folder_uuid))
      setAssets((current) => current.map((asset) => asset.folder === folder.name ? { ...asset, folder: defaultFolderForAsset(asset) } : asset))
      setOpenFolderName(null)
    } catch (err: any) {
      setError(err?.message || 'Unable to delete folder')
    }
  }

  const handleSave = async () => {
    if (!accessToken) return
    try {
      setIsSaving(true)
      setError('')
      let asset = selectedAsset
      if (file) {
        asset = await uploadMediaAsset(owner, mediaType, file, accessToken, file.name, pendingFolderName || undefined)
      }
      if (!asset) return
      await onSave(asset)
      setSelectedAsset(asset)
      onOpenChange(false)
      setFile(null)
      setLinkUrl('')
      setLinkError('')
      setPendingFolderName(null)
      setFolderActionFeedback('')
      await loadAssets()
    } catch (err: any) {
      setError(err?.message || 'Unable to save media')
    } finally {
      setIsSaving(false)
    }
  }

  const mediaNoun = mediaType === 'image' ? 'image' : 'video'
  const UploadIcon = mediaType === 'image' ? FileImage : Film
  const canAssignToFolder = Boolean(file || selectedAsset)
  const folderDropdownItems = folders.filter((folder) => folder.name !== openFolderName)
  const currentFolderLabel = file ? pendingFolderName : selectedAsset?.folder
  const folderChipLabel = folderActionFeedback || (currentFolderLabel ? `Saved to ${currentFolderLabel}` : 'Save to folder')

  const renderFolderDropdown = (compact = false) => (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={compact ? 'sm' : 'default'}
          disabled={!canAssignToFolder || !accessToken}
          onPointerDown={(event) => {
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.stopPropagation()
          }}
          className={cn('bg-background/95', compact && folderActionFeedback && 'max-w-[11rem]')}
          aria-label="Save media to folder"
        >
          <Folder className="size-4" />
          {(!compact || folderActionFeedback) && <span className="truncate">{folderChipLabel}</span>}
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-[10000]" style={{ zIndex: 10000 }} onClick={(event) => event.stopPropagation()}>
        {folderDropdownItems.map((folder) => (
          <DropdownMenuItem key={folder.folder_uuid} onSelect={() => assignActiveMediaToFolder(folder.name)}>
            {folder.name}
          </DropdownMenuItem>
        ))}
        {folderDropdownItems.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem onSelect={createFolderForActiveMedia}>
          <Plus className="size-4" />
          New folder
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] w-[calc(100vw-1.5rem)] max-w-3xl flex-col overflow-hidden rounded-2xl border-border bg-card p-0 text-card-foreground shadow-2xl sm:rounded-2xl">
        <DialogHeader className="border-b border-border px-5 py-5 text-center sm:px-8">
          <DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-border px-5 sm:px-8">
            <TabsList className="h-12 w-full justify-start rounded-none bg-transparent p-0">
              <TabsTrigger
                value="upload"
                className="h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 data-[state=active]:border-[var(--org-primary-color)] data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Upload New
              </TabsTrigger>
              <TabsTrigger
                value="library"
                className="h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 data-[state=active]:border-[var(--org-primary-color)] data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Media Library
              </TabsTrigger>
              {customTabs.map((customTab) => (
                <TabsTrigger
                  key={customTab.value}
                  value={customTab.value}
                  className="h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 data-[state=active]:border-[var(--org-primary-color)] data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  {customTab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8">
            {error && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <TabsContent value="upload" className="m-0 space-y-5">
              <div
                className={cn(
                  'relative flex min-h-56 flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center transition-colors',
                  !file && !selectedAsset && !isVerifyingLink && 'cursor-pointer',
                  isDragging && 'border-[var(--org-primary-color)] bg-[var(--org-primary-color)]/10'
                )}
                onClick={() => {
                  if (!file && !selectedAsset && !isVerifyingLink) {
                    fileInputRef.current?.click()
                  }
                }}
                onDragEnter={(event) => {
                  event.preventDefault()
                  setIsDragging(true)
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                  event.preventDefault()
                  setIsDragging(false)
                  handleFile(event.dataTransfer.files?.[0])
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept={MEDIA_ACCEPT[mediaType]}
                  onChange={(event) => handleFile(event.target.files?.[0])}
                />
                {(file || selectedAsset || isVerifyingLink) && (
                  <button
                    type="button"
                    className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm ring-1 ring-border hover:bg-background"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      clearSelection()
                    }}
                    aria-label="Clear selected media"
                  >
                    <X className="size-4" />
                  </button>
                )}
                {(file || selectedAsset) && (
                  <div
                    className="absolute left-3 top-3 z-10"
                    onPointerDown={(event) => {
                      event.stopPropagation()
                    }}
                    onClick={(event) => {
                      event.stopPropagation()
                    }}
                  >
                    {renderFolderDropdown(true)}
                  </div>
                )}
                {isVerifyingLink ? (
                  <>
                    <Loader2 className="size-9 animate-spin text-muted-foreground" />
                    <span className="text-sm font-semibold">Verifying media link</span>
                  </>
                ) : previewUrl && mediaType === 'image' ? (
                  <img src={previewUrl} alt="" className="absolute inset-0 size-full object-contain" />
                ) : previewUrl ? (
                  <div className="flex flex-col items-center gap-3">
                    <Film className="size-10 text-muted-foreground" />
                    <span className="max-w-sm truncate text-sm font-semibold">{activeName}</span>
                  </div>
                ) : (
                  <>
                    <span className="flex size-14 items-center justify-center rounded-full bg-[var(--org-primary-color)] text-primary-foreground">
                      <UploadCloud className="size-7" />
                    </span>
                    <span className="text-sm font-semibold">
                      Drag and drop {mediaType === 'image' ? 'an image' : 'a video'} or choose a file
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {mediaType === 'image' ? 'JPG, PNG, GIF, or WebP' : 'MP4, WebM, or MOV'}
                    </span>
                  </>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <div className="relative">
                  <LinkIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={linkUrl}
                    onChange={(event) => {
                      setLinkUrl(event.target.value)
                      setFile(null)
                      setError('')
                      setLinkError('')
                      setFolderActionFeedback('')
                    }}
                    placeholder={`Paste ${mediaNoun} link`}
                    className={cn('pl-9', ((linkUrl.trim() && !linkLooksValid) || linkError) && 'border-destructive')}
                  />
                </div>
                <Button type="button" variant="outline" disabled={!linkUrl.trim() || !linkLooksValid || isVerifyingLink || !accessToken} onClick={handleVerifyLink}>
                  {isVerifyingLink && <Loader2 className="size-4 animate-spin" />}
                  Add
                </Button>
              </div>
              {linkError && (
                <p className="text-sm text-destructive">{linkError}</p>
              )}

              {recentAssets.length > 0 && (
                <div>
                  <div className="mb-3 text-sm font-semibold">Recent uploads</div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {recentAssets.map((asset) => (
                      <button
                        key={asset.asset_uuid}
                        type="button"
                        onClick={() => {
                          const isSelected = selectedAsset?.asset_uuid === asset.asset_uuid
                          setSelectedAsset(isSelected ? null : asset)
                          setFile(null)
                          setFolderActionFeedback('')
                          setLinkUrl('')
                          setLinkError('')
                        }}
                        className={cn(
                          'relative size-16 shrink-0 overflow-hidden rounded-lg border bg-muted',
                          selectedAsset?.asset_uuid === asset.asset_uuid ? 'border-[var(--org-primary-color)] ring-2 ring-[var(--org-primary-color)]/30' : 'border-border'
                        )}
                      >
                        {mediaType === 'image' ? (
                          <img src={assetPreview(asset)} alt="" className="size-full object-cover" />
                        ) : (
                          <Film className="m-auto mt-5 size-6 text-muted-foreground" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="library" className="m-0 space-y-5">
              {isLoading ? (
                <div className="flex h-48 items-center justify-center text-muted-foreground">
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Loading media
                </div>
              ) : assets.length === 0 && folderItems.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
                  <ImageIcon className="mb-2 size-8 text-muted-foreground" />
                  <p className="text-sm font-medium">No {mediaNoun}s yet</p>
                  <p className="mb-4 text-xs text-muted-foreground">Upload a file, save a link, or create a folder to start your library.</p>
                  <Button type="button" variant="outline" size="sm" onClick={handleCreateFolder}>
                    <Plus className="size-4" />
                    New folder
                  </Button>
                </div>
              ) : (
                <>
                  {openFolder ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <Button type="button" variant="ghost" size="icon" onClick={() => setOpenFolderName(null)}>
                          <ArrowLeft className="size-4" />
                        </Button>
                        <div className="min-w-0">
                          {openFolder.folder && editingFolderUuid === openFolder.folder.folder_uuid ? (
                            <Input
                              ref={folderNameInputRef}
                              value={editingFolderName}
                              onChange={(event) => setEditingFolderName(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') confirmRenameFolder(openFolder.folder!)
                                if (event.key === 'Escape') {
                                  setEditingFolderUuid(null)
                                  setEditingFolderName('')
                                }
                              }}
                              className="h-8 max-w-56 px-2 text-sm font-semibold"
                            />
                          ) : (
                            <div className="truncate text-sm font-semibold">{openFolder.name}</div>
                          )}
                          <div className="text-xs text-muted-foreground">{openFolder.assets.length} items</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {openFolder.folder && (
                          <>
                            {editingFolderUuid === openFolder.folder.folder_uuid ? (
                              <Button type="button" variant="ghost" size="icon" onClick={() => confirmRenameFolder(openFolder.folder!)} className="text-green-600 hover:text-green-700">
                                <Check className="size-4" />
                              </Button>
                            ) : (
                              <Button type="button" variant="ghost" size="icon" onClick={() => startRenameFolder(openFolder.folder!)}>
                                <Edit2 className="size-4" />
                              </Button>
                            )}
                            <Button type="button" variant="ghost" size="icon" onClick={() => handleDeleteFolder(openFolder.folder!)}>
                              <Trash2 className="size-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold">Your folders</div>
                        <Button type="button" variant="outline" size="sm" onClick={handleCreateFolder}>
                          <Plus className="size-4" />
                          New folder
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {folderItems.map((folder) => {
                          const previews = [...folder.assets]
                            .sort((a, b) => (Date.parse(b.creation_date || '') || b.id) - (Date.parse(a.creation_date || '') || a.id))
                            .slice(0, 4)
                          return (
                            <button
                              key={folder.name}
                              type="button"
                              onClick={() => setOpenFolderName(folder.name)}
                              className="rounded-xl border border-border bg-card p-3 text-left transition hover:border-foreground/30"
                            >
                              <div className="grid aspect-square w-full grid-cols-2 gap-1 rounded-lg bg-muted/40 p-1">
                                {[0, 1, 2, 3].map((index) => {
                                  const previewAsset = previews[index]
                                  return (
                                    <div key={index} className="aspect-square overflow-hidden rounded-md bg-muted/60">
                                      {previewAsset && mediaType === 'image' ? (
                                        <img src={assetPreview(previewAsset)} alt="" className="size-full object-cover" />
                                      ) : previewAsset ? (
                                        <div className="flex size-full items-center justify-center">
                                          <Film className="size-4 text-muted-foreground" />
                                        </div>
                                      ) : (
                                        <div className="size-full" />
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                              <div className="mt-4 truncate text-sm font-semibold">{folder.name}</div>
                              <div className="text-xs text-muted-foreground">{folder.assets.length} items</div>
                            </button>
                          )
                        })}
                      </div>
                    </>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">{openFolder ? 'Folder media' : 'All media'}</div>
                    <div className="flex items-center gap-2">
                      {openFolder && selectedAsset?.folder === openFolder.name && (
                        <Button type="button" variant="outline" size="sm" onClick={() => assignActiveMediaToFolder(null)}>
                          Remove from folder
                        </Button>
                      )}
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        Sort
                        <select
                          value={sortOrder}
                          onChange={(event) => setSortOrder(event.target.value as 'newest' | 'oldest')}
                          className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                        >
                          <option value="newest">Newest</option>
                          <option value="oldest">Oldest</option>
                        </select>
                      </label>
                    </div>
                  </div>

                  {visibleLibraryAssets.length === 0 ? (
                    <div className="flex h-36 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                      No media in this folder yet
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
	                      {visibleLibraryAssets.map((asset) => {
	                        const selected = selectedAsset?.asset_uuid === asset.asset_uuid
	                        return (
                            <div key={asset.asset_uuid} className="relative">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedAsset(asset)
                                  setFile(null)
                                  setPendingFolderName(null)
                                  setFolderActionFeedback('')
                                  setLinkError('')
                                  onSelect?.(asset)
                                }}
                                className={cn(
                                  'group relative aspect-square w-full overflow-hidden rounded-xl border bg-muted text-left transition',
                                  selected ? 'border-[var(--org-primary-color)] ring-2 ring-[var(--org-primary-color)]/30' : 'border-border hover:border-foreground/30'
                                )}
                              >
                                {mediaType === 'image' ? (
                                  <img src={assetPreview(asset)} alt="" className="size-full object-cover" />
                                ) : (
                                  <div className="flex size-full items-center justify-center">
                                    <Film className="size-8 text-muted-foreground" />
                                  </div>
                                )}
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-xs font-medium text-white">
                                  <span className="line-clamp-1">{asset.title}</span>
                                </div>
                                {asset.source_type === 'link' && (
                                  <span className="absolute left-2 top-2 rounded-full bg-background/90 p-1 text-foreground">
                                    <LinkIcon className="size-3" />
                                  </span>
                                )}
                                {selected && (
                                  <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-[var(--org-primary-color)] text-primary-foreground">
                                    <Check className="size-4" />
                                  </span>
                                )}
                              </button>
                              {selected && (
                                <div
                                  className="absolute left-2 top-2 z-10"
                                  onPointerDown={(event) => event.stopPropagation()}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  {renderFolderDropdown(true)}
                                </div>
                              )}
                            </div>
	                        )
	                      })}
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            {customTabs.map((customTab) => (
              <TabsContent key={customTab.value} value={customTab.value} className="m-0">
                {customTab.content}
              </TabsContent>
            ))}
          </div>
        </Tabs>

        <DialogFooter className="items-center justify-between gap-3 border-t border-border px-5 py-4 sm:flex-row sm:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
              {previewUrl && mediaType === 'image' ? (
                <img src={previewUrl} alt="" className="size-full object-cover" />
              ) : previewUrl ? (
                <Film className="size-5 text-muted-foreground" />
              ) : (
                <UploadIcon className="size-5 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 text-left">
              <p className="truncate text-sm font-medium">{activeName || 'No media selected'}</p>
              <p className="truncate text-xs text-muted-foreground">{activeDetail || `Choose a ${mediaNoun} to continue`}</p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={!canSave || isSaving || !accessToken}>
            {isSaving && <Loader2 className="size-4 animate-spin" />}
            Confirm
          </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
