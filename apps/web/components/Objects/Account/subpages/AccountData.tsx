'use client'

import { useState } from 'react'
import { Download, FileArchive } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { settingsCard, SettingsHeader } from '@components/Objects/Account/AccountPageShell'
import { downloadMyData } from '@services/users/users'
import { useTranslation } from 'react-i18next'

/** Download my data: one zip of everything the app keeps about you, to keep or take somewhere else. */
export default function AccountData() {
  const session = useLHSession() as any
  const { t } = useTranslation()
  const accessToken = session?.data?.tokens?.access_token as string | undefined
  const [busy, setBusy] = useState(false)

  const download = async () => {
    if (!accessToken || busy) return
    setBusy(true)
    const loading = toast.loading(t('settings.data.preparing_toast'))
    try {
      await downloadMyData(accessToken)
      toast.success(t('settings.data.downloading'), { id: loading })
    } catch (error: any) {
      toast.error(error?.message || t('settings.data.failed'), { id: loading })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`${settingsCard} p-5 sm:p-6`}>
      <SettingsHeader icon={FileArchive} title={t('settings.data.title')}
        description={t('settings.data.description')} />
      <div className="mt-5 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{t('settings.data.school_records')}</p>
        <Button type="button" onClick={() => void download()} disabled={!accessToken || busy} className="shrink-0 self-start sm:self-auto">
          <Download className="h-4 w-4" />{busy ? t('settings.data.preparing') : t('settings.data.download')}
        </Button>
      </div>
    </section>
  )
}
