'use client'

import { Dispatch, useEffect, useMemo, useState } from 'react'
import { Library, Loader2, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import NewUserResourceChannelModal from '@components/Resources/NewUserResourceChannelModal'
import SaveDropdown from '@components/Resources/SaveDropdown'
import ResourceTypeVisual from '@components/Resources/ResourceTypeVisual'
import { getChannelIcon } from '@components/Resources/ResourceChannelStyle'
import { Button } from '@components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import { Input } from '@components/ui/input'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getResourceThumbnailMediaDirectory } from '@services/media/media'
import {
  deleteUserResourceChannel,
  getResourceChannels,
  getResources,
  Resource,
  ResourceType,
  UserResourceChannel,
} from '@services/resources/resources'

const RESOURCE_TYPES: Array<{ value: 'all' | ResourceType; label: string }> = [
  { value: 'all', label: 'All types' },
  { value: 'article', label: 'Articles' },
  { value: 'video', label: 'Videos' },
  { value: 'course', label: 'Courses' },
  { value: 'guide', label: 'Guides' },
  { value: 'tool', label: 'Tools' },
  { value: 'assessment', label: 'Assessments' },
  { value: 'other', label: 'Other' },
]

function requireSuccess(result: any, message: string) {
  if (!result?.success) throw new Error(result?.data?.detail || message)
}

export default function HubResourceLibrary({
  open,
  onClose,
  orgslug,
  orgId,
  accessToken,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  orgslug: string
  orgId?: number
  accessToken?: string
  onSelect: Dispatch<Resource>
}) {
  const [lists, setLists] = useState<UserResourceChannel[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [selectedList, setSelectedList] = useState<string>('library')
  const [query, setQuery] = useState('')
  const [resourceType, setResourceType] = useState<'all' | ResourceType>('all')
  const [loading, setLoading] = useState(true)
  const [listModalOpen, setListModalOpen] = useState(false)
  const [editingList, setEditingList] = useState<UserResourceChannel | null>(null)

  useEffect(() => {
    if (!open || !orgId || !accessToken) return
    let active = true
    Promise.all([
      getResourceChannels(orgId, accessToken),
      getResources(orgId, {
        saved_only: true,
        user_channel_uuid: selectedList === 'library' ? undefined : selectedList,
      }, accessToken),
    ])
      .then(([channels, nextResources]) => {
        if (!active) return
        setLists(channels.user_channels.filter((channel) => !channel.is_default))
        setResources(nextResources)
      })
      .catch((error: any) => active && toast.error(error?.message || 'Failed to load your library'))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [accessToken, open, orgId, selectedList])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !listModalOpen) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [listModalOpen, onClose, open])

  const visibleResources = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return resources.filter((resource) => {
      if (resourceType !== 'all' && resource.resource_type !== resourceType) return false
      if (!normalizedQuery) return true
      return [resource.title, resource.description, resource.provider_name, ...resource.tags.map((tag) => tag.name)]
        .some((value) => value?.toLowerCase().includes(normalizedQuery))
    })
  }, [query, resourceType, resources])

  if (!open) return null

  const selectedListDetails = lists.find((list) => list.user_channel_uuid === selectedList)
  const chooseList = (listUuid: string) => {
    setLoading(true)
    setSelectedList(listUuid)
  }
  const removeList = async (list: UserResourceChannel) => {
    if (!accessToken || !orgId || !window.confirm(`Delete “${list.name}”? Resources will stay in your Library.`)) return
    try {
      requireSuccess(await deleteUserResourceChannel(orgId, list.user_channel_uuid, accessToken), 'Failed to delete list')
      setLists((current) => current.filter((item) => item.user_channel_uuid !== list.user_channel_uuid))
      if (selectedList === list.user_channel_uuid) setSelectedList('library')
      toast.success('List deleted')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete list')
    }
  }

  return (
    <section className="pointer-events-auto mt-1.5" aria-labelledby="hub-library-title">
      <div className="flex h-[min(17.5rem,calc(100dvh-11rem))] min-h-[13rem] w-full flex-col overflow-hidden rounded-xl border border-border/50 bg-background/95 shadow-sm sm:flex-row">
        <aside className="flex w-full shrink-0 flex-col border-b border-border/50 bg-muted/10 p-1.5 sm:w-[9.5rem] sm:border-b-0 sm:border-r">
          <div className="flex h-9 items-center justify-between px-2">
            <h2 id="hub-library-title" className="text-xs font-semibold tracking-tight">Library</h2>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => { setEditingList(null); setListModalOpen(true) }}
              aria-label="Create list"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <nav className="flex min-h-0 flex-1 gap-1 overflow-x-auto sm:block sm:space-y-1 sm:overflow-x-hidden sm:overflow-y-auto" aria-label="Resource lists">
            <button
              type="button"
              onClick={() => chooseList('library')}
              className={`flex h-8 shrink-0 items-center gap-2 rounded-lg px-2 text-left text-xs transition-colors sm:w-full ${selectedList === 'library' ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'}`}
            >
              <Library className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">All resources</span>
            </button>
            {lists.map((list) => {
              const Icon = getChannelIcon(list.icon)
              const hasStyle = Boolean(list.color && list.icon_color)
              return (
                <div
                  key={list.user_channel_uuid}
                  className={`group flex h-8 shrink-0 items-center rounded-lg sm:w-full ${hasStyle ? '' : 'bg-muted text-muted-foreground'} ${selectedList === list.user_channel_uuid ? 'ring-1 ring-foreground/30 ring-inset' : 'opacity-80 hover:opacity-100'}`}
                  style={{ background: list.color || undefined, color: list.icon_color || undefined }}
                >
                  <button
                    type="button"
                    onClick={() => chooseList(list.user_channel_uuid)}
                    className={`flex min-w-0 flex-1 items-center gap-2 px-2 text-left text-xs ${selectedList === list.user_channel_uuid ? 'font-semibold' : 'font-medium'}`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{list.name}</span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="mr-0.5 h-6 w-6 opacity-60 sm:opacity-0 sm:group-hover:opacity-100" aria-label={`Actions for ${list.name}`}>
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={() => { setEditingList(list); setListModalOpen(true) }}>
                        <Pencil className="mr-2 h-4 w-4" /> Rename and edit
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => void removeList(list)}>
                        <Trash2 className="mr-2 h-4 w-4" /> Delete list
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )
            })}
          </nav>
          <Button type="button" variant="ghost" size="sm" className="mt-1 hidden h-8 justify-start gap-2 px-2 text-xs text-muted-foreground sm:flex" onClick={() => { setEditingList(null); setListModalOpen(true) }}>
            <Plus className="h-3.5 w-3.5" /> New list
          </Button>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
          <div className="flex h-10 items-center gap-1.5 border-b border-border/50 px-2">
            <div className="relative min-w-[8rem] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-8 rounded-lg border-0 bg-muted/45 pl-8 text-xs shadow-none" placeholder={`Filter ${selectedListDetails?.name || 'resources'}`} aria-label="Filter resources" />
            </div>
            <select
              value={resourceType}
              onChange={(event) => setResourceType(event.target.value as 'all' | ResourceType)}
              className="h-8 rounded-lg border-0 bg-muted/45 px-2 text-xs text-muted-foreground"
              aria-label="Filter by resource type"
            >
              {RESOURCE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </div>
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-1.5">
            {loading ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading library…</div>
            ) : visibleResources.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center text-center">
                <Library className="mb-3 h-8 w-8 text-muted-foreground/60" />
                <p className="text-sm font-medium">No resources here yet</p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">Open or save a resource to add it to your Library, then organize it into custom lists.</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {visibleResources.map((resource) => {
                  const imageSrc = resource.thumbnail_image && resource.owner_org_uuid
                    ? getResourceThumbnailMediaDirectory(resource.owner_org_uuid, resource.resource_uuid, resource.thumbnail_image)
                    : resource.cover_image_url
                  return (
                    <div
                      key={resource.resource_uuid}
                      className="group flex h-11 w-full min-w-0 items-center rounded-lg px-1.5 transition-colors hover:bg-muted/40 focus-within:bg-muted/40"
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(resource)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="h-9 w-10 shrink-0 overflow-hidden rounded-md">
                          <ResourceTypeVisual type={resource.resource_type} title={resource.title} imageSrc={imageSrc} iconClassName="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="truncate text-xs font-medium">{resource.title}</h4>
                          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{resource.provider_name || resource.resource_type}{resource.description ? ` · ${resource.description}` : ''}</p>
                        </div>
                      </button>
                      <SaveDropdown
                        resourceUuid={resource.resource_uuid}
                        isSaved={resource.is_saved}
                        savedUserChannelUuids={resource.user_channel_uuids ?? []}
                        onSaveChange={(isSaved) => setResources((current) => isSaved
                          ? current.map((item) => item.resource_uuid === resource.resource_uuid ? { ...item, is_saved: true } : item)
                          : current.filter((item) => item.resource_uuid !== resource.resource_uuid))}
                        onMembershipChange={(memberships) => setResources((current) => current.flatMap((item) => {
                          if (item.resource_uuid !== resource.resource_uuid) return [item]
                          if (selectedList !== 'library' && !memberships.includes(selectedList)) return []
                          return [{ ...item, is_saved: true, user_channel_uuids: memberships }]
                        }))}
                        variant="menu"
                        share={{
                          title: resource.title,
                          description: resource.description,
                          url: getUriWithOrg(orgslug, routePaths.org.resource(resource.resource_uuid.replace('resource_', ''))),
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      <NewUserResourceChannelModal
        open={listModalOpen}
        channel={editingList}
        onClose={() => { setListModalOpen(false); setEditingList(null) }}
        onCreated={(created) => {
          setLists((current) => [...current, created])
          chooseList(created.user_channel_uuid)
        }}
        onUpdated={(updated) => setLists((current) => current.map((list) => list.user_channel_uuid === updated.user_channel_uuid ? updated : list))}
      />
    </section>
  )
}
