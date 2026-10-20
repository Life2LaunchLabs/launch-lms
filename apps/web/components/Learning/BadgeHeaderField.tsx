import type { Dispatch } from 'react'
import { Check, Loader2, Pencil } from 'lucide-react'
import { Button } from '@components/ui/button'

/** The badge page's title (or description), with an inline pencil to edit it in place. */
export default function EditableHeaderField({
  field,
  isEditing,
  value,
  onChange,
  onEdit,
  onSave,
  isSaving,
  editable = true,
}: {
  field: 'name' | 'description'
  isEditing: boolean
  value: string
  onChange: Dispatch<string>
  onEdit: () => void
  onSave: () => void
  isSaving: boolean
  /** False hides the pencil (a badge the viewer can't change). */
  editable?: boolean
}) {
  const isTitle = field === 'name'

  return (
    <div className={`group flex min-w-0 items-start gap-2 ${isTitle ? 'mb-2' : ''}`}>
      {isEditing ? (
        isTitle ? (
          <input autoFocus value={value} maxLength={100} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-2 text-3xl font-bold tracking-tight text-foreground outline-none focus:ring-2 focus:ring-black" />
        ) : (
          <textarea autoFocus value={value} maxLength={1000} onChange={(event) => onChange(event.target.value)} rows={2} placeholder="Describe this badge..." className="min-w-0 flex-1 resize-none rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground outline-none focus:ring-2 focus:ring-black" />
        )
      ) : isTitle ? (
        <h1 className="min-w-0 break-words text-4xl font-bold tracking-tight text-foreground">{value}</h1>
      ) : (
        <p className="min-w-0 break-words text-sm font-medium text-muted-foreground">{value || 'No description yet.'}</p>
      )}

      {editable || isEditing ? <Button type="button" size="icon" variant={isEditing ? 'default' : 'ghost'} disabled={isSaving} className={`mt-1 h-7 w-7 shrink-0 ${isEditing ? 'bg-green-600 text-white hover:bg-green-700' : 'opacity-0 transition-opacity group-hover:opacity-100'}`} onClick={isEditing ? onSave : onEdit} title={isEditing ? 'Save' : 'Edit'}>
        {isSaving ? <Loader2 className="animate-spin" /> : isEditing ? <Check /> : <Pencil />}
      </Button> : null}
    </div>
  )
}
