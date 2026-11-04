'use client'

import { useState } from 'react'
import { Download, FileArchive } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { settingsCard, SettingsHeader } from '@components/Objects/Account/AccountPageShell'
import { downloadMyData } from '@services/users/users'

/** Download my data: one zip of everything the app keeps about you, to keep or take somewhere else. */
export default function AccountData() {
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token as string | undefined
  const [busy, setBusy] = useState(false)

  const download = async () => {
    if (!accessToken || busy) return
    setBusy(true)
    const loading = toast.loading('Getting your data ready…')
    try {
      await downloadMyData(accessToken)
      toast.success('Your data is downloading.', { id: loading })
    } catch (error: any) {
      toast.error(error?.message || 'Your data could not be downloaded. Try again in a minute.', { id: loading })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`${settingsCard} p-5 sm:p-6`}>
      <SettingsHeader icon={FileArchive} title="Your data"
        description="Download a copy of everything you've added: your profile, portfolio, plans, badges, answers, messages, Coach chats, saved resources and the files you uploaded. It comes as a zip you can keep or take with you." />
      <div className="mt-5 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Your school or program keeps its own records and can export those for you.</p>
        <Button type="button" onClick={() => void download()} disabled={!accessToken || busy} className="shrink-0 self-start sm:self-auto">
          <Download className="h-4 w-4" />{busy ? 'Preparing…' : 'Download my data'}
        </Button>
      </div>
    </section>
  )
}
