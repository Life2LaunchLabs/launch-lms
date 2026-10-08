'use client'

import React from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { getBadgeIssuingSettings, LearnerAccess, updateBadgeIssuingSettings } from '@services/learning/marketplace'

export const LEARNER_ACCESS_OPTIONS: Array<{ value: LearnerAccess; label: string; description: string }> = [
  { value: 'open', label: 'Open to everyone', description: 'Any learner can start right away.' },
  { value: 'request', label: 'Accepts requests', description: 'Learners ask to join and your team accepts them.' },
  { value: 'invite', label: 'Invited learners only', description: 'Only learners your team adds can choose you.' },
]

export function learnerAccessLabel(access?: string) {
  return LEARNER_ACCESS_OPTIONS.find((option) => option.value === access)?.label || 'Invited learners only'
}

// One control for how learners join an issuer, used by the creator and by outside issuers alike.
export function LearnerAccessSelect({ value, disabled, onChange, allowNone = false, label = 'Learner access' }: {
  value: LearnerAccess | 'none'
  disabled?: boolean
  onChange: React.Dispatch<LearnerAccess | 'none'>
  allowNone?: boolean
  label?: string
}) {
  const options = allowNone
    ? [...LEARNER_ACCESS_OPTIONS, { value: 'none' as const, label: 'Not issuing', description: 'Your organization does not issue this badge.' }]
    : LEARNER_ACCESS_OPTIONS
  const selected = options.find((option) => option.value === value)
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{selected?.description}</p>
      </div>
      <Select value={value} onValueChange={(next) => onChange(next as LearnerAccess | 'none')} disabled={disabled}>
        <SelectTrigger className="w-full bg-card sm:w-56" aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

// The creator's own issuing settings and which issuer learners see first.
export function CreatorIssuingCard({ badge, orgName, refreshKey = 0 }: { badge: any; orgName?: string; refreshKey?: number }) {
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const [settings, setSettings] = React.useState<any>(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    let active = true
    getBadgeIssuingSettings(badge.badge_uuid, accessToken)
      .then((data) => active && setSettings(data))
      .catch((error: any) => active && toast.error(error?.message || 'Failed to load issuing settings.'))
    return () => { active = false }
  }, [accessToken, badge.badge_uuid, refreshKey])

  const save = async (data: Parameters<typeof updateBadgeIssuingSettings>[1], message: string) => {
    setSaving(true)
    try {
      setSettings(await updateBadgeIssuingSettings(badge.badge_uuid, data, accessToken))
      toast.success(message)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update issuing settings.')
    } finally {
      setSaving(false)
    }
  }

  if (!settings) {
    return <div className="flex items-center justify-center rounded-xl border border-border py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
  }
  const issuers: any[] = settings.issuers || []
  return (
    <article className="space-y-4 rounded-xl border border-lime-200 bg-lime-50/40 p-4">
      <div>
        <p className="text-sm font-bold text-foreground">{orgName || 'Your organization'}</p>
        <p className="mt-1 text-xs text-muted-foreground">Badge creator · issues this badge like any other issuer</p>
      </div>
      <LearnerAccessSelect
        label="Your organization as an issuer"
        value={settings.creator_access}
        allowNone
        disabled={saving}
        onChange={(value) => void save({ creator_access: value }, value === 'none' ? 'Your organization no longer issues this badge.' : `Your organization is now ${learnerAccessLabel(value).toLowerCase()}.`)}
      />
      {issuers.length > 1 ? (
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Default issuer</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Shown first to learners. An open issuer is used when the default would make them wait.</p>
          </div>
          <Select
            value={settings.default_issuer_org_id ? String(settings.default_issuer_org_id) : 'auto'}
            onValueChange={(next) => void save(next === 'auto' ? { clear_default_issuer: true } : { default_issuer_org_id: Number(next) }, 'Default issuer updated.')}
            disabled={saving}
          >
            <SelectTrigger className="w-full bg-card sm:w-56" aria-label="Default issuer"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Automatic</SelectItem>
              {issuers.map((issuer) => <SelectItem key={issuer.org.id} value={String(issuer.org.id)}>{issuer.org.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </article>
  )
}
