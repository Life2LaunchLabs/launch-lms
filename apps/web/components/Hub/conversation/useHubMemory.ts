'use client'

import { useCallback, useEffect, useState } from 'react'
import { getHubMemory, updateHubMemorySettings } from '@services/hub/advisor'

/** The learner's memory setting and whether the one-time memory notice still needs an answer. */
// eslint-disable-next-line no-unused-vars
export default function useHubMemory(orgId: number | undefined, accessToken: string | undefined, onError: (message: string) => void) {
  const [enabled, setEnabled] = useState(true)
  const [visible, setVisible] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!accessToken || !orgId) return
    let active = true
    getHubMemory(orgId, accessToken)
      .then((settings) => {
        if (!active) return
        setEnabled(settings.enabled)
        setVisible(!settings.notice_dismissed)
      })
      .catch(() => undefined)
      .finally(() => active && setLoaded(true))
    return () => { active = false }
  }, [accessToken, orgId])

  const onDismiss = useCallback(async () => {
    if (!visible) return
    setVisible(false)
    if (!accessToken || !orgId) return
    try {
      await updateHubMemorySettings(orgId, { notice_dismissed: true }, accessToken)
    } catch {
      setVisible(true)
      onError('The memory notice could not be dismissed. Please try again.')
    }
  }, [accessToken, onError, orgId, visible])

  const onSave = useCallback(async (next: boolean) => {
    if (!accessToken || !orgId || saving) return false
    setSaving(true)
    try {
      const settings = await updateHubMemorySettings(orgId, { enabled: next, notice_dismissed: true }, accessToken)
      setEnabled(settings.enabled)
      setVisible(false)
      return true
    } catch (error: any) {
      onError(error?.message || 'Your memory setting could not be saved.')
      return false
    } finally {
      setSaving(false)
    }
  }, [accessToken, onError, orgId, saving])

  return { enabled, visible, loaded, saving, onSave, onDismiss }
}
