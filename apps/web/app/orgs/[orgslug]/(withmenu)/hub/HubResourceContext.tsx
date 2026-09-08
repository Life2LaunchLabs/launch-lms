'use client'

import { Dispatch, useMemo, useState } from 'react'
import { Loader2, Star, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import useSWR from 'swr'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import ResourceNotes from '@components/Resources/ResourceNotes'
import ResourceComments from '@components/Resources/ResourceComments'
import SaveDropdown from '@components/Resources/SaveDropdown'
import { getChannelIcon } from '@components/Resources/ResourceChannelStyle'
import ResourceTypeVisual from '@components/Resources/ResourceTypeVisual'
import { Card } from '@components/ui/card'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { HubAdvisorResource } from '@services/hub/advisor'
import { getResourceThumbnailMediaDirectory } from '@services/media/media'
import { getResource, getResourceChannels, getResourceReviews, Resource, saveResource } from '@services/resources/resources'
import { toggleHubContextResource } from './hubInteraction'

function resourceImage(resource: HubAdvisorResource) {
  return resource.thumbnail_image && resource.owner_org_uuid
    ? getResourceThumbnailMediaDirectory(resource.owner_org_uuid, resource.resource_uuid, resource.thumbnail_image)
    : resource.cover_image_url
}

function ResourceListMembership({ resourceUuid }: { resourceUuid: string }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const [membershipOverride, setMembershipOverride] = useState<string[] | null>(null)
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null)
  const { data: resource, mutate } = useSWR(
    accessToken ? ['hub-context-resource', resourceUuid, accessToken] : null,
    () => getResource(resourceUuid, accessToken)
  )
  const { data: channelData } = useSWR(
    org?.id && accessToken ? ['resource-channels', org.id, accessToken] : null,
    () => getResourceChannels(org.id, accessToken)
  )
  const membershipUuids = membershipOverride ?? resource?.user_channel_uuids ?? []
  const lists = (channelData?.user_channels || []).filter((channel) => (
    !channel.is_default && membershipUuids.includes(channel.user_channel_uuid)
  ))
  const removeFromList = async (listUuid: string) => {
    if (!accessToken || pendingRemoval) return
    const nextMemberships = membershipUuids.filter((uuid) => uuid !== listUuid)
    setPendingRemoval(listUuid)
    try {
      const result = await saveResource(resourceUuid, {
        add_to_default_channel: false,
        user_channel_uuids: nextMemberships,
      }, accessToken)
      if (!result.success) throw new Error(result.data?.detail || 'Failed to remove from list')
      const updated = result.data as Resource
      setMembershipOverride(updated.user_channel_uuids ?? nextMemberships)
      await mutate(updated, false)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to remove from list')
    } finally {
      setPendingRemoval(null)
    }
  }

  return (
    <div className="mt-3 flex min-h-7 flex-wrap items-center gap-1.5">
      {lists.map((list) => {
        const Icon = getChannelIcon(list.icon)
        return (
          <button
            type="button"
            key={list.user_channel_uuid}
            onClick={() => void removeFromList(list.user_channel_uuid)}
            disabled={pendingRemoval !== null}
            className={`group inline-flex h-7 max-w-44 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium transition-opacity disabled:cursor-wait ${list.color && list.icon_color ? '' : 'bg-muted text-muted-foreground'}`}
            style={{ background: list.color || undefined, color: list.icon_color || undefined }}
            aria-label={`Remove from ${list.name}`}
          >
            <Icon className="h-3 w-3 shrink-0" />
            <span className="truncate">{list.name}</span>
            <span className="flex max-w-0 items-center overflow-hidden opacity-0 transition-all group-hover:max-w-4 group-hover:opacity-100 group-focus-visible:max-w-4 group-focus-visible:opacity-100">
              {pendingRemoval === list.user_channel_uuid ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
            </span>
          </button>
        )
      })}
      <SaveDropdown
        resourceUuid={resourceUuid}
        isSaved={resource?.is_saved ?? false}
        savedUserChannelUuids={membershipUuids}
        onSaveChange={() => undefined}
        onMembershipChange={setMembershipOverride}
        variant="chips"
      />
    </div>
  )
}

function ActiveResourceWorkspace({ resource, orgslug }: { resource: HubAdvisorResource; orgslug: string }) {
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const [section, setSection] = useState<'notes' | 'reviews'>('notes')
  const [reviewComposeRequest, setReviewComposeRequest] = useState(0)
  const { data: fullResource, mutate } = useSWR(
    accessToken ? ['hub-context-resource', resource.resource_uuid, accessToken] : null,
    () => getResource(resource.resource_uuid, accessToken)
  )
  const { data: reviews = [] } = useSWR(
    ['resource-reviews', resource.resource_uuid, accessToken || 'anon'],
    () => getResourceReviews(resource.resource_uuid, accessToken)
  )
  const ratedReviews = useMemo(() => reviews.filter((review) => review.rating !== null), [reviews])
  const averageRating = ratedReviews.length > 0
    ? ratedReviews.reduce((total, review) => total + (review.rating || 0), 0) / ratedReviews.length
    : null
  const displayedRating = averageRating ?? 0

  const openResource = async () => {
    if (accessToken) {
      try {
        await saveResource(resource.resource_uuid, { open_count_increment: 1 }, accessToken)
        void mutate()
      } catch {
        // Tracking should never prevent the user from opening the resource.
      }
    }
    window.open(resource.external_url, '_blank', 'noopener,noreferrer')
  }

  return (
    <Card size="none" className="overflow-hidden rounded-2xl border border-border/60 shadow-sm">
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl sm:h-28 sm:w-28">
            <ResourceTypeVisual
              type={resource.resource_type}
              title={resource.title}
              imageSrc={resourceImage(resource)}
              iconClassName="h-7 w-7"
            />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{resource.provider_name || resource.resource_type}</p>
            <button type="button" onClick={() => void openResource()} className="group mt-1 block max-w-full rounded-lg text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Open ${resource.title}`}>
              <span className="mt-1 line-clamp-2 text-base font-semibold leading-5 tracking-tight group-hover:underline">{resource.title}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSection('reviews')
                setReviewComposeRequest((current) => current + 1)
              }}
              className="mt-2 flex min-h-5 items-center gap-2 rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Rate and review this resource"
            >
                <span className="flex items-center gap-0.5" aria-label={`${displayedRating.toFixed(1)} out of 5 stars`}>
                  {[1, 2, 3, 4, 5].map((star) => <Star key={star} className={`h-3.5 w-3.5 ${star <= Math.round(displayedRating) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/25'}`} />)}
                </span>
                <span className="font-medium text-foreground">{displayedRating.toFixed(1)}</span>
                <span>({fullResource?.comment_count ?? reviews.length} reviews)</span>
            </button>
            {resource.description && <p className="mt-3 line-clamp-3 text-xs leading-5 text-muted-foreground">{resource.description}</p>}
            <ResourceListMembership resourceUuid={resource.resource_uuid} />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <SaveDropdown
              resourceUuid={resource.resource_uuid}
              isSaved={fullResource?.is_saved ?? false}
              savedUserChannelUuids={fullResource?.user_channel_uuids ?? []}
              onSaveChange={() => void mutate()}
              onMembershipChange={() => void mutate()}
              variant="menu"
              share={{
                title: resource.title,
                description: resource.description,
                url: getUriWithOrg(orgslug, routePaths.org.resource(resource.resource_uuid.replace('resource_', ''))),
              }}
            />
          </div>
        </div>
      </div>

      <div>
        <div className="flex h-11 items-end gap-6 border-b border-border/60 px-4 sm:px-5">
          <button type="button" onClick={() => setSection('notes')} className={`relative flex h-full items-center pt-1 text-xs font-medium transition-colors ${section === 'notes' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            Notes
            {section === 'notes' && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground" />}
          </button>
          <button type="button" onClick={() => setSection('reviews')} className={`relative flex h-full items-center gap-1.5 pt-1 text-xs font-medium transition-colors ${section === 'reviews' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            Reviews <span className="font-normal text-muted-foreground">{fullResource?.comment_count ?? reviews.length}</span>
            {section === 'reviews' && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground" />}
          </button>
        </div>
        <div key={section} className={`animate-in fade-in duration-200 ${section === 'reviews' ? 'slide-in-from-right-2' : 'slide-in-from-left-2'}`}>
          {section === 'notes'
            ? <ResourceNotes resourceUuid={resource.resource_uuid} compact onNotesChange={() => void mutate()} />
            : <ResourceComments key={reviewComposeRequest} resourceUuid={resource.resource_uuid} compact composeOnMount={reviewComposeRequest > 0} onReviewsChange={() => void mutate()} />}
        </div>
      </div>
    </Card>
  )
}

export default function HubResourceContext({
  resources,
  activeResourceUuid,
  onActiveChange,
  onRemove,
  orgslug,
  label,
}: {
  resources: HubAdvisorResource[]
  activeResourceUuid: string | null
  onActiveChange: Dispatch<string | null>
  onRemove: Dispatch<string>
  orgslug: string
  label?: string
}) {
  if (resources.length === 0) return null
  const activeResource = resources.find((resource) => resource.resource_uuid === activeResourceUuid)

  return (
    <section aria-label="Resources in this conversation">
      {label && <p className="mb-1.5 px-1 text-[10px] italic text-muted-foreground">{label}</p>}
      <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-3">
        {resources.map((resource) => {
          const active = resource.resource_uuid === activeResourceUuid
          return (
            <div
              key={resource.resource_uuid}
              className={`group relative flex h-16 w-[13rem] shrink-0 snap-start items-center gap-2 rounded-2xl border p-2 pr-8 text-left transition-colors ${active ? 'border-border bg-card shadow-sm' : 'border-transparent bg-muted/45 hover:bg-muted/70'}`}
            >
              <button
                type="button"
                onClick={() => onActiveChange(toggleHubContextResource(activeResourceUuid, resource.resource_uuid))}
                className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-hidden"
                aria-expanded={active}
              >
                <span className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-muted">
                  <ResourceTypeVisual
                    type={resource.resource_type}
                    title={resource.title}
                    imageSrc={resourceImage(resource)}
                    iconClassName="h-4 w-4"
                  />
                </span>
                <span className="min-w-0">
                  <span className="line-clamp-2 text-xs font-medium leading-4">{resource.title}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onRemove(resource.resource_uuid)}
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
                aria-label={`Remove ${resource.title} from conversation`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )
        })}
      </div>

      {activeResource && (
        <ActiveResourceWorkspace key={activeResource.resource_uuid} resource={activeResource} orgslug={orgslug} />
      )}
    </section>
  )
}
