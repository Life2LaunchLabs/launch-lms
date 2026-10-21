'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-hot-toast'
import { mutate } from 'swr'
import { Switch } from '@components/ui/switch'
import ImageMediaPicker from '@components/Objects/Media/ImageMediaPicker'
import { getOrgLogoMediaDirectory } from '@services/media/media'
import { getAPIUrl } from '@services/config/config'
import { revalidateTags } from '@services/utils/ts/requests'
import { updateOrgDarkLogoConfig, updateOrgHideOrgNameConfig } from '@services/settings/org'
import { cn } from '@/lib/utils'

type DarkLogo = { separate_dark_logo: boolean; dark_logo_image: string }

function SettingRow({ title, description, checked, disabled, onCheckedChange }: { title: string; description: string; checked: boolean; disabled: boolean; onCheckedChange: React.ComponentProps<typeof Switch>['onCheckedChange'] }) {
  return <div className="flex items-center justify-between gap-4 px-4 py-3 bg-gray-50 rounded-xl">
    <div className="flex flex-col space-y-0.5">
      <span className="text-sm font-medium text-gray-800">{title}</span>
      <span className="text-xs text-gray-500">{description}</span>
    </div>
    <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
  </div>
}

/** How the logo shows: one logo for both themes or a separate dark-mode one, and whether the org name sits beside it. */
export default function LogoDisplaySettings({ org, accessToken }: { org: any; accessToken: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const general = org?.config?.config?.customization?.general
  const [hideOrgName, setHideOrgName] = useState<boolean>(general?.hide_org_name || org?.config?.config?.general?.hide_org_name || false)
  const [darkLogo, setDarkLogo] = useState<DarkLogo>({ separate_dark_logo: Boolean(general?.separate_dark_logo), dark_logo_image: general?.dark_logo_image || '' })
  const [saving, setSaving] = useState(false)
  const hasLogo = Boolean(org?.logo_image)

  const save = async (apply: () => void, undo: () => void, request: () => Promise<unknown>) => {
    apply()
    setSaving(true)
    const loadingToast = toast.loading(t('dashboard.organization.settings.updating'))
    try {
      await request()
      await revalidateTags(['organizations'], org.slug)
      mutate(`${getAPIUrl()}orgs/slug/${org.slug}`)
      toast.success(t('dashboard.organization.settings.update_success'), { id: loadingToast })
      router.refresh()
    } catch {
      undo()
      toast.error(t('dashboard.organization.settings.update_error'), { id: loadingToast })
    } finally {
      setSaving(false)
    }
  }

  const saveDarkLogo = (next: DarkLogo) => {
    const before = darkLogo
    return save(() => setDarkLogo(next), () => setDarkLogo(before), () => updateOrgDarkLogoConfig(org.id, next, accessToken))
  }

  const saveHideOrgName = (checked: boolean) =>
    save(() => setHideOrgName(checked), () => setHideOrgName(!checked), () => updateOrgHideOrgNameConfig(org.id, checked, accessToken))

  return <div className="w-full border-t border-gray-100 pt-6 flex flex-col gap-4">
    <SettingRow
      title="Separate logo for dark mode"
      description="Off, the logo above shows in both themes. On, choose a version that reads on a dark background."
      checked={darkLogo.separate_dark_logo}
      disabled={saving || !hasLogo}
      onCheckedChange={(checked) => saveDarkLogo({ ...darkLogo, separate_dark_logo: checked })}
    />
    {darkLogo.separate_dark_logo ? (
      <div className="flex flex-col items-center gap-4 py-2">
        <span className="text-xs font-semibold text-gray-500">Dark mode</span>
        <div
          className={cn(
            'w-[200px] sm:w-[250px] h-[100px] sm:h-[125px] bg-contain bg-no-repeat bg-center rounded-lg shadow-md bg-gray-900',
            'border-2 border-gray-800 flex items-center justify-center',
            saving && 'opacity-50'
          )}
          style={darkLogo.dark_logo_image ? { backgroundImage: `url(${getOrgLogoMediaDirectory(org?.org_uuid, darkLogo.dark_logo_image)})` } : undefined}
        >
          {!darkLogo.dark_logo_image ? <span className="px-4 text-center text-xs text-gray-400">Uses the logo above until you choose one</span> : null}
        </div>
        <ImageMediaPicker
          owner={{ type: 'org', id: Number(org.id) }}
          title="Choose dark mode logo"
          buttonText={saving ? t('dashboard.organization.images.uploading') : 'Choose dark mode logo'}
          disabled={saving}
          onSelect={(url) => saveDarkLogo({ separate_dark_logo: true, dark_logo_image: url })}
        />
      </div>
    ) : null}
    <SettingRow
      title="Hide organization name"
      description="Show only the logo in the navigation bar, without the org name text"
      checked={hideOrgName}
      disabled={saving || !hasLogo}
      onCheckedChange={saveHideOrgName}
    />
    {!hasLogo ? <p className="text-xs text-gray-400 text-center">Upload a logo first to enable these options</p> : null}
  </div>
}
