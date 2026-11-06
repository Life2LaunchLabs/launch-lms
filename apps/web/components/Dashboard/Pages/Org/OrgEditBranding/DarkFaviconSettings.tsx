'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-hot-toast'
import { mutate } from 'swr'
import { Switch } from '@components/ui/switch'
import ImageMediaPicker from '@components/Objects/Media/ImageMediaPicker'
import { getOrgFaviconMediaDirectory } from '@services/media/media'
import { getAPIUrl } from '@services/config/config'
import { revalidateTags } from '@services/utils/ts/requests'
import { updateOrgDarkFaviconConfig } from '@services/settings/org'
import { cn } from '@/lib/utils'

type DarkFavicon = { separate_dark_favicon: boolean; dark_favicon_image: string }

/** An optional favicon for browsers in dark mode, so a dark mark doesn't vanish on a dark tab bar. */
export default function DarkFaviconSettings({ org, accessToken }: { org: any; accessToken: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const general = org?.config?.config?.customization?.general
  const [value, setValue] = useState<DarkFavicon>({ separate_dark_favicon: Boolean(general?.separate_dark_favicon), dark_favicon_image: general?.dark_favicon_image || '' })
  const [saving, setSaving] = useState(false)
  const light = general?.favicon_image || org?.config?.config?.general?.favicon_image

  const save = async (next: DarkFavicon) => {
    const before = value
    setValue(next)
    setSaving(true)
    const loadingToast = toast.loading(t('dashboard.organization.settings.updating'))
    try {
      await updateOrgDarkFaviconConfig(org.id, next, accessToken)
      await revalidateTags(['organizations'], org.slug)
      mutate(`${getAPIUrl()}orgs/slug/${org.slug}`)
      toast.success(t('dashboard.organization.settings.update_success'), { id: loadingToast })
      router.refresh()
    } catch {
      setValue(before)
      toast.error(t('dashboard.organization.settings.update_error'), { id: loadingToast })
    } finally {
      setSaving(false)
    }
  }

  const preview = (image: string | undefined, dark: boolean, label: string) => <div className="flex flex-col items-center gap-2">
    <div className={cn('flex h-14 w-14 items-center justify-center rounded-xl border-2', dark ? 'border-gray-800 bg-gray-900' : 'border-gray-100 bg-white', saving && 'opacity-50')}>
      {image ? <span className="h-8 w-8 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${getOrgFaviconMediaDirectory(org?.org_uuid, image)})` }} /> : <span className="text-[10px] text-gray-400">None</span>}
    </div>
    <span className="text-xs font-semibold text-gray-500">{label}</span>
  </div>

  return <div className="w-full flex flex-col gap-4">
    <div className="flex items-center justify-between gap-4 px-4 py-3 bg-gray-50 rounded-xl">
      <div className="flex flex-col space-y-0.5">
        <span className="text-sm font-medium text-gray-800">Separate favicon for dark mode</span>
        <span className="text-xs text-gray-500">Off, the favicon above shows in every browser tab. On, browsers in dark mode show this one instead.</span>
      </div>
      <Switch checked={value.separate_dark_favicon} disabled={saving} onCheckedChange={(checked) => save({ ...value, separate_dark_favicon: checked })} />
    </div>
    {value.separate_dark_favicon ? (
      <div className="flex flex-col items-center gap-4 py-2">
        <div className="flex items-end gap-6">
          {preview(light, false, 'Light mode')}
          {preview(value.dark_favicon_image || light, true, 'Dark mode')}
        </div>
        {!value.dark_favicon_image ? <span className="text-xs text-gray-400">Uses the favicon above until you choose one</span> : null}
        <ImageMediaPicker
          owner={{ type: 'org', id: Number(org.id) }}
          title="Choose dark mode favicon"
          buttonText={saving ? t('dashboard.organization.images.uploading') : 'Choose dark mode favicon'}
          disabled={saving}
          onSelect={(url) => save({ separate_dark_favicon: true, dark_favicon_image: url })}
        />
      </div>
    ) : null}
  </div>
}
