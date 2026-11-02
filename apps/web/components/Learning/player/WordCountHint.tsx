'use client'

/** Says why Continue is still off when an answer is too short or too long, instead of failing silently. */
export default function WordCountHint({ text, rule }: { text: string; rule: any }) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length
  const min = Number(rule?.min_words || 0), max = Number(rule?.max_words || 0)
  if (!words) return min > 1 ? <p className="mt-1 text-xs text-muted-foreground">At least {min} words.</p> : null
  if (min > words) return <p className="mt-1 text-xs font-medium text-muted-foreground">Write at least {min} words ({words} so far).</p>
  if (max > 0 && words > max) return <p className="mt-1 text-xs font-medium text-red-600">Keep it to {max} words ({words} now).</p>
  return null
}
