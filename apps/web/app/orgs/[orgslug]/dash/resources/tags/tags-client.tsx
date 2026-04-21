'use client'

import Link from 'next/link'
import { useState } from 'react'
import useSWR from 'swr'
import { FolderOpen, Plus, Tag, Trash2 } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import FeatureDisabledView from '@components/Dashboard/Shared/FeatureDisabled/FeatureDisabledView'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { getUriWithOrg } from '@services/config/config'
import {
  createResourceTag,
  deleteResourceTag,
  getResourceTags,
  updateResourceTag,
} from '@services/resources/resources'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { toast } from 'react-hot-toast'

export default function ResourcesTagsClient({ orgslug }: { orgslug: string }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const [newTagName, setNewTagName] = useState('')
  const [savingTagUuid, setSavingTagUuid] = useState<string | null>(null)
  const [deletingTagUuid, setDeletingTagUuid] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const { data: resourceTags = [], mutate } = useSWR(
    org?.id ? ['dash-resource-tags', org.id, accessToken || 'anon'] : null,
    () => getResourceTags(org.id, accessToken)
  )

  const handleCreateTag = async () => {
    if (!org?.id || !accessToken || !newTagName.trim()) return
    try {
      setSavingTagUuid('new')
      await createResourceTag(org.id, { name: newTagName.trim() }, accessToken)
      setNewTagName('')
      await mutate()
      toast.success('Tag created')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create tag')
    } finally {
      setSavingTagUuid(null)
    }
  }

  const handleSaveTag = async (tagUuid: string) => {
    if (!accessToken) return
    const nextName = (drafts[tagUuid] ?? '').trim()
    if (!nextName) return
    try {
      setSavingTagUuid(tagUuid)
      await updateResourceTag(tagUuid, { name: nextName }, accessToken)
      await mutate()
      toast.success('Tag updated')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update tag')
    } finally {
      setSavingTagUuid(null)
    }
  }

  const handleDeleteTag = async (tagUuid: string) => {
    if (!accessToken) return
    try {
      setDeletingTagUuid(tagUuid)
      const result = await deleteResourceTag(tagUuid, accessToken)
      if (!result.success) {
        toast.error(result.data?.detail || 'Failed to delete tag')
        return
      }
      await mutate()
      toast.success('Tag deleted')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete tag')
    } finally {
      setDeletingTagUuid(null)
    }
  }

  return (
    <FeatureDisabledView featureName="resources" orgslug={orgslug} context="dashboard">
      <div className="h-full w-full bg-[#f8f8f8] px-10">
        <div className="mb-6 pt-6">
          <Breadcrumbs
            items={[
              { label: 'Resources', href: '/dash/resources', icon: <FolderOpen size={14} /> },
              { label: 'Tags' },
            ]}
          />
          <div className="mt-4 flex items-center space-x-4">
            <h1 className="text-3xl font-bold">Resource Tags</h1>
          </div>
          <div className="mt-4 flex gap-1 border-b border-gray-200">
            <Link
              href={getUriWithOrg(orgslug, '/dash/resources')}
              className="border-b-2 border-transparent px-1 py-2 text-sm font-semibold text-gray-400 transition-colors hover:text-gray-700"
            >
              Channels
            </Link>
            <Link
              href={getUriWithOrg(orgslug, '/dash/resources/tags')}
              className="border-b-2 border-black px-1 py-2 text-sm font-semibold text-gray-900"
            >
              Tags
            </Link>
          </div>
        </div>

        <div className="rounded-xl bg-white nice-shadow">
          <div className="mx-3 my-3 rounded-md bg-gray-50 px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Manage Tags</h2>
            <p className="mt-1 text-sm text-gray-500">
              Create and maintain the organization-wide tags used when adding and filtering resources.
            </p>
          </div>

          <div className="mx-5 space-y-4 pb-5">
            <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center">
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Add a new tag"
                className="sm:flex-1"
              />
              <Button
                onClick={handleCreateTag}
                disabled={!newTagName.trim() || savingTagUuid === 'new'}
                className="bg-black text-white hover:bg-black/90"
              >
                <Plus size={14} />
                {savingTagUuid === 'new' ? 'Creating…' : 'Add Tag'}
              </Button>
            </div>

            {resourceTags.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
                <Tag size={26} className="mx-auto mb-2 text-gray-300" />
                No tags yet. Create your first one to organize resources.
              </div>
            ) : (
              <div className="space-y-2">
                {resourceTags.map((tag) => {
                  const value = drafts[tag.tag_uuid] ?? tag.name
                  return (
                    <div
                      key={tag.tag_uuid}
                      className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3 sm:flex-row sm:items-center"
                    >
                      <Input
                        value={value}
                        onChange={(e) =>
                          setDrafts((current) => ({
                            ...current,
                            [tag.tag_uuid]: e.target.value,
                          }))
                        }
                        className="bg-white sm:flex-1"
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          onClick={() => handleSaveTag(tag.tag_uuid)}
                          disabled={!value.trim() || value.trim() === tag.name || savingTagUuid === tag.tag_uuid}
                        >
                          {savingTagUuid === tag.tag_uuid ? 'Saving…' : 'Save'}
                        </Button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTag(tag.tag_uuid)}
                          disabled={deletingTagUuid === tag.tag_uuid}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 transition-colors hover:border-red-300 hover:text-red-700 disabled:opacity-50"
                          aria-label={`Delete ${tag.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </FeatureDisabledView>
  )
}
