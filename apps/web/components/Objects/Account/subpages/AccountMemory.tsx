'use client'

import { useEffect, useMemo, useState } from 'react'
import { BrainCircuit, Search, Trash2 } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@components/ui/dialog'
import { Input } from '@components/ui/input'
import { Switch } from '@components/ui/switch'
import { settingsCard, SettingsHeader } from '@components/Objects/Account/AccountPageShell'
import { clearHubMemory, getHubMemory, HubMemory, setHubMemoryEnabled } from '@services/hub/advisor'
import HubMemoryItems from '@components/Hub/conversation/HubMemoryItems'
import { useTranslation } from 'react-i18next'

export default function AccountMemory() {
  const org = useOrg() as any
  const { t } = useTranslation()
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token as string | undefined
  const [enabled, setEnabled] = useState(true)
  const [memories, setMemories] = useState<HubMemory[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!org?.id || !accessToken) return
    setLoading(true)
    getHubMemory(org.id, accessToken)
      .then((result) => {
        setEnabled(result.enabled)
        setMemories(result.memories.map((memory) => ({ ...memory, editable: true })))
      })
      .catch((requestError: any) => setError(requestError?.message || t('settings.memory.load_failed')))
      .finally(() => setLoading(false))
  }, [accessToken, org?.id, t])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return memories
    return memories.filter((memory) => `${memory.category} ${memory.content}`.toLowerCase().includes(normalized))
  }, [memories, query])

  const toggle = async (next: boolean) => {
    if (!org?.id || !accessToken) return
    setSaving(true)
    setError('')
    try {
      await setHubMemoryEnabled(org.id, next, accessToken)
      setEnabled(next)
    } catch (requestError: any) {
      setError(requestError?.message || t('settings.memory.save_failed'))
    } finally {
      setSaving(false)
    }
  }

  const clearAll = async () => {
    if (!org?.id || !accessToken) return
    setSaving(true)
    setError('')
    try {
      await clearHubMemory(org.id, accessToken)
      setMemories([])
    } catch (requestError: any) {
      setError(requestError?.message || t('settings.memory.clear_failed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    // One card: whether Coach remembers, then what it remembers.
    <section className={`${settingsCard} p-5 sm:p-6`}>
      <SettingsHeader icon={BrainCircuit} title={t('settings.memory.title')} description={t('settings.memory.description')}>
        <Switch checked={enabled} onCheckedChange={(checked) => void toggle(checked)} disabled={loading || saving} aria-label={t('settings.memory.enable')} />
      </SettingsHeader>
      {!enabled && memories.length > 0 && (
        <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          {t('settings.memory.off')}
        </p>
      )}
      {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}

      <div className="mt-6 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-bold text-foreground">{t('settings.memory.what')}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('settings.memory.edit_any')}</p>
        </div>
        {memories.length > 0 && (
          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="self-start text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" />{t('settings.memory.clear_all')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('settings.memory.clear_title')}</DialogTitle>
                <DialogDescription>{t('settings.memory.clear_description')}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="ghost">{t('settings.cancel')}</Button></DialogClose>
                <DialogClose asChild><Button type="button" variant="destructive" disabled={saving} onClick={() => void clearAll()}>{t('settings.memory.clear_all')}</Button></DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
      {memories.length > 0 ? <div className="relative mt-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('settings.memory.search')} className="pl-9" />
      </div> : null}
      <div className="mt-4">
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('settings.memory.loading')}</p>
        ) : filtered.length > 0 && org?.id && accessToken ? (
          <HubMemoryItems memories={filtered} orgId={org.id} accessToken={accessToken} onChange={(nextFiltered) => {
            const visible = new Map(nextFiltered.map((memory) => [memory.memory_uuid, memory]))
            setMemories((current) => current
              .filter((memory) => !filtered.some((item) => item.memory_uuid === memory.memory_uuid) || visible.has(memory.memory_uuid))
              .map((memory) => visible.get(memory.memory_uuid) || memory))
          }} />
        ) : (
          <p className={query ? 'py-8 text-center text-sm text-muted-foreground' : 'rounded-xl border-2 border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground'}>{query ? t('settings.memory.no_match') : t('settings.memory.none')}</p>
        )}
      </div>
    </section>
  )
}
