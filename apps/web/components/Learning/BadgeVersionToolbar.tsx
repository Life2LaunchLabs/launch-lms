'use client'

import React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowUp, Check, ChevronDown, CircleOff, Loader2, Pencil, Plus, Rocket, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import toast from 'react-hot-toast'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Textarea } from '@components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import {
  activateLearningBadgeVersion,
  createLearningBadgeVersion,
  deactivateLearningBadgeVersion,
  deleteLearningBadgeVersion,
  getLearningBadgeVersionDiff,
  publishLearningBadgeVersion,
  updateLearningBadgeVersion,
} from '@services/learning/learning'

type SaveState = 'saved' | 'saving' | 'unsaved' | 'error'

export default function BadgeVersionToolbar({ badge, saveState = 'saved' }: { badge: any; saveState?: SaveState }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const selected = badge.selected_version
  const versions = badge.versions || []
  const [busy, setBusy] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [publishOpen, setPublishOpen] = React.useState(false)
  const [detailsOpen, setDetailsOpen] = React.useState(false)
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [semanticVersion, setSemanticVersion] = React.useState(nextVersion(versions))
  const [setActiveOnPublish, setSetActiveOnPublish] = React.useState(true)
  const [diff, setDiff] = React.useState<any>(null)

  const navigateTo = (versionUuid: string) => {
    if (saveState === 'unsaved' && !window.confirm('Discard unsaved changes and view another version?')) return
    const next = new URLSearchParams(searchParams.toString())
    next.set('version', versionUuid)
    router.replace(`${pathname}?${next.toString()}`)
  }

  const createDraft = async () => {
    if (!title.trim()) return toast.error('Give this draft a title.')
    setBusy(true)
    try {
      const source = selected?.state === 'published'
        ? selected
        : versions.find((version: any) => version.is_active && version.state === 'published')
      const draft = await createLearningBadgeVersion(badge.badge_uuid, {
        based_on_version_uuid: source?.version_uuid,
        title: title.trim(),
        description: description.trim(),
      }, accessToken)
      setCreateOpen(false)
      toast.success('Draft created. Changes now autosave to this version.')
      navigateTo(draft.version_uuid)
      router.refresh()
    } catch (error: any) {
      toast.error(error?.message || 'Could not create draft.')
    } finally {
      setBusy(false)
    }
  }

  const openPublish = async () => {
    if (!selected) return
    setBusy(true)
    try {
      setDiff(await getLearningBadgeVersionDiff(badge.badge_uuid, selected.version_uuid, accessToken))
      setTitle(displayVersionTitle(selected) || '')
      setDescription(selected.description || '')
      setSemanticVersion(nextVersion(versions))
      setSetActiveOnPublish(true)
      setPublishOpen(true)
    } catch (error: any) {
      toast.error(error?.message || 'Could not build release summary.')
    } finally {
      setBusy(false)
    }
  }

  const openDetails = () => {
    setTitle(displayVersionTitle(selected) || '')
    setDescription(selected.description || '')
    setDetailsOpen(true)
  }

  const saveDetails = async () => {
    if (!title.trim()) return toast.error('Give this version a name.')
    setBusy(true)
    try {
      await updateLearningBadgeVersion(badge.badge_uuid, selected.version_uuid, {
        title: title.trim(),
        description: description.trim(),
      }, accessToken)
      setDetailsOpen(false)
      toast.success('Version details updated.')
      router.refresh()
    } catch (error: any) {
      toast.error(error?.message || 'Could not update version details.')
    } finally { setBusy(false) }
  }

  const publish = async () => {
    setBusy(true)
    try {
      await publishLearningBadgeVersion(badge.badge_uuid, selected.version_uuid, {
        semantic_version: semanticVersion,
        title: title.trim(),
        description: description.trim(),
        set_active: setActiveOnPublish,
        expected_revision: diff?.revision,
      }, accessToken)
      setPublishOpen(false)
      toast.success(`Version ${semanticVersion} published${setActiveOnPublish ? ' and activated' : ''}.`)
      router.refresh()
    } catch (error: any) {
      toast.error(error?.message || 'Could not publish version.')
    } finally {
      setBusy(false)
    }
  }

  const activate = async () => {
    if (!selected || !window.confirm(`Make version ${selected.semantic_version} active for new learners and issuances?`)) return
    setBusy(true)
    try {
      await activateLearningBadgeVersion(badge.badge_uuid, selected.version_uuid, accessToken)
      toast.success('Active version updated.')
      router.refresh()
    } catch (error: any) {
      toast.error(error?.message || 'Could not activate version.')
    } finally { setBusy(false) }
  }

  const deactivate = async () => {
    if (!selected || !window.confirm('Deactivate this version? New learners and issuances will be paused until another version is activated.')) return
    setBusy(true)
    try {
      await deactivateLearningBadgeVersion(badge.badge_uuid, selected.version_uuid, accessToken)
      toast.success('Version deactivated.')
      router.refresh()
    } catch (error: any) {
      toast.error(error?.message || 'Could not deactivate version.')
    } finally { setBusy(false) }
  }

  const removeDraft = async () => {
    if (!selected || !window.confirm(`Delete the shared draft “${selected.title}”? This cannot be undone.`)) return
    setBusy(true)
    try {
      await deleteLearningBadgeVersion(badge.badge_uuid, selected.version_uuid, accessToken)
      const fallback = versions.find((item: any) => item.is_active) || versions.find((item: any) => item.version_uuid !== selected.version_uuid)
      toast.success('Draft deleted.')
      if (fallback) navigateTo(fallback.version_uuid)
      router.refresh()
    } catch (error: any) {
      toast.error(error?.message || 'Could not delete draft.')
    } finally { setBusy(false) }
  }

  if (!selected) return null
  const isDraft = selected.state === 'draft'
  const status = getDisplayStatus(selected, saveState)

  return (
    <>
      <div className="inline-flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" className="h-10 max-w-[280px] gap-2 bg-card px-3" disabled={busy}>
              <span className="truncate">{displayVersionTitle(selected)}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-80">
            <DropdownMenuItem onSelect={() => {
              setTitle(selected.state === 'published' ? `Version after ${selected.title}` : 'New Version')
              setDescription('')
              setCreateOpen(true)
            }}>
              <Plus />
              <span className="font-semibold">New version</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {versions.map((version: any) => (
              <DropdownMenuItem key={version.version_uuid} onSelect={() => navigateTo(version.version_uuid)} className="min-h-14 items-start py-2">
                <Check className={version.version_uuid === selected.version_uuid ? 'opacity-100' : 'opacity-0'} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-semibold">{displayVersionTitle(version)}</span>
                    <span className="flex shrink-0 gap-1">
                      {version.is_active ? <MenuChip tone="active">Active</MenuChip> : null}
                      {version.state === 'draft' ? <MenuChip tone="draft">Draft</MenuChip> : null}
                    </span>
                  </span>
                  <span className={`mt-0.5 block text-xs text-muted-foreground ${version.state === 'draft' ? 'italic' : ''}`}>
                    {version.state === 'draft' ? 'Draft' : `Version ${version.semantic_version}`}
                  </span>
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" className={`h-10 gap-2 rounded-full px-3.5 ${status.className}`} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {status.label}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {isDraft ? (
              <>
                <DropdownMenuItem onSelect={openDetails}><Pencil />Edit details</DropdownMenuItem>
                <DropdownMenuItem onSelect={openPublish} disabled={saveState !== 'saved'}><Rocket />Publish version</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={removeDraft} className="text-destructive focus:text-destructive"><Trash2 />Delete draft</DropdownMenuItem>
              </>
            ) : selected.is_active ? (
              <DropdownMenuItem onSelect={deactivate}><CircleOff />Deactivate</DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={activate}><Rocket />Activate</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Modal isDialogOpen={createOpen} onOpenChange={setCreateOpen} dialogTitle="New version" dialogDescription="Create an editable shared draft. Published versions stay unchanged." minWidth="sm" dialogContent={<VersionFields title={title} setTitle={setTitle} description={description} setDescription={setDescription} />} dialogClose={<><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={createDraft} disabled={busy}>{busy ? 'Creating…' : 'Create version'}</Button></>} />
      <Modal isDialogOpen={detailsOpen} onOpenChange={setDetailsOpen} dialogTitle="Edit version details" dialogDescription="Update the shared draft name and description." minWidth="sm" dialogContent={<VersionFields title={title} setTitle={setTitle} description={description} setDescription={setDescription} />} dialogClose={<><Button variant="outline" onClick={() => setDetailsOpen(false)}>Cancel</Button><Button onClick={saveDetails} disabled={busy}>{busy ? 'Saving…' : 'Save details'}</Button></>} />
      <Modal isDialogOpen={publishOpen} onOpenChange={setPublishOpen} dialogTitle="Publish new version" dialogDescription="Publishing makes this snapshot immutable for learners and issued credentials." minWidth="sm" dialogContent={<div className="space-y-4"><VersionFields title={title} setTitle={setTitle} description={description} setDescription={setDescription} semanticVersion={semanticVersion} setSemanticVersion={setSemanticVersion} previousSemanticVersion={latestPublishedVersion(versions)} /><DiffSummary diff={diff} /><label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4"><input type="checkbox" checked={setActiveOnPublish} onChange={(event) => setSetActiveOnPublish(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-input accent-black" /><span><span className="block text-sm font-semibold">Set as active version</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">Use this version for new learners and issuances immediately after publishing.</span></span></label></div>} dialogClose={<><Button variant="outline" onClick={() => setPublishOpen(false)}>Cancel</Button><Button onClick={publish} disabled={busy}>{busy ? 'Publishing…' : 'Publish version'}</Button></>} />
    </>
  )
}

function VersionFields({ title, setTitle, description, setDescription, semanticVersion, setSemanticVersion, previousSemanticVersion }: any) {
  return <div className="space-y-4"><label className="block text-base font-bold">Version title<Input className="mt-1.5 h-12 text-base font-semibold" value={title} onChange={(event) => setTitle(event.target.value)} /></label>{setSemanticVersion ? <SemverIncrementPicker value={semanticVersion} previous={previousSemanticVersion} onChange={setSemanticVersion} /> : null}<label className="block text-sm font-semibold">Release notes <span className="font-normal text-muted-foreground">(optional)</span><Textarea className="mt-1" value={description} onChange={(event) => setDescription(event.target.value)} /></label></div>
}

type SemverPart = 'major' | 'minor' | 'patch'

function SemverIncrementPicker({ value, previous, onChange }: { value: string; previous?: string; onChange: (value: string) => void }) {
  const base = parseSemver(previous || '0.0.0')
  const choices: Record<SemverPart, number[]> = {
    major: [base[0] + 1, 0, 0],
    minor: [base[0], base[1] + 1, 0],
    patch: [base[0], base[1], base[2] + 1],
  }
  const current = parseSemver(value)
  const active = (Object.keys(choices) as SemverPart[]).find((part) => choices[part].every((number, index) => number === current[index])) || 'patch'
  const guidance = {
    major: 'Marks earlier credentials as an older Achievement model and may prompt learners to re-earn it.',
    minor: 'Adds backward-compatible activities, criteria, or capabilities to the same Achievement model.',
    patch: 'For backward-compatible fixes, clarifications, and small presentation changes.',
  }[active]

  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold">Version</p>
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative grid h-9 w-44 grid-cols-3 overflow-hidden rounded-full border border-input bg-muted/40 p-0.5">
            {(Object.keys(choices) as SemverPart[]).map((part, index) => {
              const selected = active === part
              return (
                <button key={part} type="button" onClick={() => onChange(choices[part].join('.'))} className={`relative z-10 flex min-w-0 items-center justify-center text-sm font-bold transition-colors ${selected ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`} aria-pressed={selected} aria-label={`Increment ${part} version`} title={`${part[0].toUpperCase() + part.slice(1)} version`}>
                  {selected ? <motion.span layoutId="semver-active-part" transition={{ type: 'spring', stiffness: 480, damping: 36 }} className="absolute inset-0 -z-10 rounded-full bg-card shadow-sm" /> : null}
                  <RollingNumber value={current[index]} />
                  {index < 2 ? <span>.</span> : null}
                  <RollingArrow visible={selected} value={current[index]} />
                </button>
              )
            })}
        </div>
        <div className="shrink-0 rounded-full bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
          Previous: <span className="font-semibold text-foreground">{previous || 'None'}</span>
        </div>
      </div>
      <div className="relative mt-1.5 h-10 overflow-hidden sm:h-6">
        <AnimatePresence initial={false} mode="wait">
          <motion.p key={active} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.14 }} className={`absolute inset-x-0 top-0 flex gap-2 text-xs leading-5 ${active === 'major' ? 'text-amber-800' : 'text-muted-foreground'}`}>
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${active === 'major' ? 'bg-amber-500' : 'bg-blue-500'}`} />
            <span><strong>{active[0].toUpperCase() + active.slice(1)}</strong> — {guidance}</span>
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  )
}

function RollingNumber({ value }: { value: number }) {
  const prior = React.useRef(value)
  const direction = value >= prior.current ? 1 : -1
  React.useEffect(() => { prior.current = value }, [value])
  return (
    <span className="relative inline-grid h-5 items-center justify-center overflow-hidden tabular-nums" style={{ width: `${Math.max(1, String(value).length)}ch` }}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span key={value} initial={{ y: direction * 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: direction * -14, opacity: 0 }} transition={{ type: 'spring', stiffness: 520, damping: 34 }} className="col-start-1 row-start-1">
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

function RollingArrow({ visible, value }: { visible: boolean; value: number }) {
  const prior = React.useRef(value)
  const direction = value >= prior.current ? 1 : -1
  React.useEffect(() => { prior.current = value }, [value])
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {visible ? (
        <motion.span key="arrow" initial={{ y: direction * 14, opacity: 0, width: 0, marginLeft: 0 }} animate={{ y: 0, opacity: 1, width: 14, marginLeft: 2 }} exit={{ y: direction * -14, opacity: 0, width: 0, marginLeft: 0 }} transition={{ type: 'spring', stiffness: 520, damping: 34 }} className="inline-flex overflow-hidden">
          <ArrowUp className="h-3 w-3 shrink-0 text-blue-600" />
        </motion.span>
      ) : null}
    </AnimatePresence>
  )
}

function DiffSummary({ diff }: { diff: any }) {
  if (!diff) return null
  const sections = [
    ['Achievement definition', diff.change_sections?.achievement_definition],
    ['Activities added', diff.change_sections?.activities_added],
    ['Activities modified', diff.change_sections?.activities_modified],
    ['Settings changed', diff.change_sections?.settings_changed],
  ].filter(([, items]) => Array.isArray(items) && items.length) as [string, string[]][]
  return (
    <div>
      <h3 className="mb-1.5 text-sm font-semibold">Changes in this release</h3>
      <div className="rounded-xl border bg-muted/40 p-4 text-sm">
        {sections.length ? (
          <div className="space-y-4">
            {sections.map(([label, items]) => (
              <section key={label}>
                <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</h4>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-foreground">
                  {items.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </section>
            ))}
          </div>
        ) : <p className="text-muted-foreground">No changes from the source version.</p>}
      </div>
    </div>
  )
}

function nextVersion(versions: any[]) {
  const parsed = versions.filter((item) => item.semantic_version).map((item) => parseSemver(String(item.semantic_version))).sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2])[0]
  return parsed ? `${parsed[0]}.${parsed[1]}.${parsed[2] + 1}` : '1.0.0'
}

function latestPublishedVersion(versions: any[]) {
  const latest = versions
    .filter((item) => item.semantic_version)
    .map((item) => String(item.semantic_version))
    .sort((left, right) => {
      const a = parseSemver(left)
      const b = parseSemver(right)
      return b[0] - a[0] || b[1] - a[1] || b[2] - a[2]
    })[0]
  return latest
}

function parseSemver(value: string): number[] {
  const parts = value.split('.').map((part) => Number(part))
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0]
}

function MenuChip({ children, tone }: { children: React.ReactNode; tone: 'active' | 'draft' }) {
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tone === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{children}</span>
}

function displayVersionTitle(version: any) {
  return ['Initial draft', 'Initial release'].includes(version?.title) ? 'Initial Version' : version?.title
}

function getDisplayStatus(selected: any, saveState: SaveState) {
  if (saveState === 'unsaved') return { label: 'Unsaved', className: 'bg-orange-100 text-orange-900 hover:bg-orange-200' }
  if (saveState === 'saving') return { label: 'Saving', className: 'bg-blue-100 text-blue-900 hover:bg-blue-200' }
  if (saveState === 'error') return { label: 'Save failed', className: 'bg-red-100 text-red-900 hover:bg-red-200' }
  if (selected.state === 'draft') return { label: 'Draft', className: 'bg-amber-100 text-amber-900 hover:bg-amber-200' }
  if (selected.is_active) return { label: 'Active', className: 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200' }
  return { label: 'Inactive', className: 'bg-muted text-muted-foreground hover:bg-muted/80' }
}
