'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { Download, FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { downloadCourseSummary, downloadRequirementEvidence, type EvidenceExportScope } from '@services/goals/requirements'

/** Downloads the evidence CSV, or the SB 3 course summary PDF, for the learners in view, with optional course context. */
export default function RequirementEvidenceExport({ orgId, token, scope }: { orgId: number; token?: string; scope: EvidenceExportScope }) {
  const [saving, setSaving] = React.useState<'csv' | 'pdf' | null>(null)
  const [open, setOpen] = React.useState(false)
  const [context, setContext] = React.useState({ course_name: '', course_code: '', section: '', term: '' })
  const formId = React.useId()
  const count = new Set(scope.user_ids).size
  const download = async (kind: 'csv' | 'pdf') => {
    setSaving(kind)
    try {
      await (kind === 'csv' ? downloadRequirementEvidence : downloadCourseSummary)(orgId, { ...scope, ...context }, token)
      toast.success(kind === 'csv' ? `Exported evidence for ${count} learner${count === 1 ? '' : 's'}.` : `Made the course summary for ${count} learner${count === 1 ? '' : 's'}.`)
      setOpen(false)
    } catch (error: any) {
      toast.error(error?.message || 'Could not export requirement evidence.')
    } finally { setSaving(null) }
  }
  return <Dialog open={open} onOpenChange={(next) => { if (!saving) setOpen(next) }}><DialogTrigger asChild><Button variant="outline" size="sm" disabled={Boolean(saving) || !count} aria-label={`Export evidence for ${count} filtered learner${count === 1 ? '' : 's'}`}>
    {saving ? <Loader2 className="animate-spin" /> : <Download />}Export evidence ({count})
  </Button></DialogTrigger><DialogContent className="left-4 max-h-[90dvh] w-[calc(100vw-2rem)] min-w-0 translate-x-0 overflow-y-auto sm:left-1/2 sm:-translate-x-1/2 [&>*]:min-w-0"><DialogHeader><DialogTitle>Export requirement evidence</DialogTitle><DialogDescription>
    Evidence, approval records and gaps for {count} learner{count === 1 ? '' : 's'} in the current filter, as a spreadsheet or as an SB 3 course summary (a class grid, then a page per learner). Add optional course context for your school’s records.
  </DialogDescription></DialogHeader><form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); void download('csv') }}>
    {([['course_name', 'Course name'], ['course_code', 'Course code'], ['section', 'Section'], ['term', 'Term']] as const).map(([key, label]) => <div key={key} className="space-y-1.5"><Label htmlFor={`${formId}-${key}`}>{label} (optional)</Label><Input id={`${formId}-${key}`} value={context[key]} maxLength={key === 'course_code' ? 50 : 250} disabled={Boolean(saving)} onChange={(event) => setContext({ ...context, [key]: event.target.value })} /></div>)}
    <p className="text-xs text-muted-foreground">The school determines academic credit. Course details here are supplied by the person exporting.</p>
    <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" disabled={Boolean(saving)} onClick={() => setOpen(false)}>Cancel</Button>
      <Button type="button" variant="outline" disabled={Boolean(saving) || !count} onClick={() => void download('pdf')}>{saving === 'pdf' ? <Loader2 className="animate-spin" /> : <FileText />}Course summary PDF</Button>
      <Button type="submit" disabled={Boolean(saving) || !count}>{saving === 'csv' ? <Loader2 className="animate-spin" /> : <Download />}Download CSV</Button></div>
  </form></DialogContent></Dialog>
}
