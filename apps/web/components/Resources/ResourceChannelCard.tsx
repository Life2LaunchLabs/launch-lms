'use client'

import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import ConfirmationModal from '@components/Objects/StyledElements/ConfirmationModal/ConfirmationModal'
import { deleteResourceChannel, ResourceChannel } from '@services/resources/resources'
import { getResourceChannelThumbnailMediaDirectory } from '@services/media/media'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { ExternalLink, FolderOpen, MoreVertical, Star, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'

type ResourceChannelCardProps = {
  channel: ResourceChannel
  orgslug: string
  onDelete?: () => void | Promise<void>
}

export default function ResourceChannelCard({
  channel,
  orgslug,
  onDelete,
}: ResourceChannelCardProps) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const router = useRouter()
  const accessToken = session?.data?.tokens?.access_token

  const settingsHref = getUriWithOrg(orgslug, routePaths.org.dash.resourceChannelSettings(channel.channel_uuid, 'general'))
  const thumbnailSrc =
    channel.thumbnail_image && org?.org_uuid
      ? getResourceChannelThumbnailMediaDirectory(
          org.org_uuid,
          channel.channel_uuid,
          channel.thumbnail_image
        )
      : null

  const handleDelete = async () => {
    try {
      const result = await deleteResourceChannel(channel.channel_uuid, accessToken)
      if (result.success) {
        await onDelete?.()
        router.refresh()
        toast.success('Channel deleted')
        return
      }
      toast.error('Failed to delete channel')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete channel')
    }
  }

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl bg-card nice-shadow transition-all duration-300 hover:scale-[1.01]">
      <div className="absolute right-2 top-2 z-20">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Channel actions"
              className="rounded-full bg-card/90 p-1.5 shadow-md backdrop-blur-sm transition-all hover:bg-card"
            >
              <MoreVertical size={18} className="text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link
                href={settingsHref}
                className="flex items-center rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <ConfirmationModal
                confirmationMessage={`Delete "${channel.name}"? This will remove the channel but keep the underlying resources.`}
                confirmationButtonText="Delete channel"
                dialogTitle="Delete Resource Channel?"
                dialogTrigger={
                  <button className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm text-red-600 transition-colors hover:bg-red-50">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete channel
                  </button>
                }
                functionToExecute={handleDelete}
                status="warning"
              />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Link href={settingsHref} className="relative block aspect-video overflow-hidden bg-muted">
        {thumbnailSrc ? (
          <img
            src={thumbnailSrc}
            alt={channel.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center gap-2 text-gray-300">
            <FolderOpen size={40} strokeWidth={1.5} />
          </div>
        )}
      </Link>

      <div className="flex flex-col space-y-1.5 p-3">
        <Link
          href={settingsHref}
          className="line-clamp-1 text-base font-bold leading-tight text-foreground transition-colors hover:text-foreground"
        >
          {channel.name}
        </Link>

        {channel.description ? (
          <p className="min-h-[1.5rem] line-clamp-2 text-[11px] text-muted-foreground">
            {channel.description}
          </p>
        ) : (
          <p className="min-h-[1.5rem] text-[11px] text-muted-foreground">
            Curate resources for a focused destination.
          </p>
        )}

        <div className="flex items-center justify-between border-t border-border pt-1.5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="text-[10px] font-bold uppercase tracking-wider">
              {channel.public ? 'Public' : 'Restricted'}
            </span>
            {channel.is_starred && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-600">
                <Star size={11} className="fill-current" />
                Starred
              </span>
            )}
          </div>

          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {channel.resource_count} resources
          </span>
        </div>
      </div>
    </div>
  )
}
