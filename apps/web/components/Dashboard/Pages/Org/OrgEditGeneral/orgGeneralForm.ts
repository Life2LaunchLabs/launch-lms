import * as Yup from 'yup'

// Settings > General. The short description is optional: orgs made through /start
// have none, and a required rule there left Save doing nothing visible.
export const orgGeneralSchema = Yup.object().shape({
  name: Yup.string()
    .required('Name is required')
    .max(60, 'Organization name must be 60 characters or less'),
  description: Yup.string()
    .optional()
    .max(100, 'Short description must be 100 characters or less'),
  about: Yup.string()
    .optional()
    .max(1500, 'About text must be 1,500 characters or less'),
  label: Yup.string().optional(),
  email: Yup.string()
    .optional()
    .email('Must be a valid email address'),
})

const FIELD_NAMES: Record<string, string> = {
  name: 'Name',
  description: 'Short description',
  about: 'About',
  email: 'Contact email',
}

// Shown next to Save when a submit was blocked, so the reason is never off-screen.
export function blockedSaveMessage(errors: Record<string, unknown>): string | null {
  const fields = Object.keys(errors).filter((key) => errors[key]).map((key) => FIELD_NAMES[key] || key)
  if (!fields.length) return null
  return `Not saved. Check ${fields.join(', ')} above.`
}
