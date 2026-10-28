import type { TemplateVersion } from '@services/goals/types'

/** Client mirror of apps/api/src/services/goals/drafts.py: versions are three numbers that only go up. */
export type Semver = [number, number, number]

export function parseSemver(text?: string | null): Semver | null {
  const match = String(text || '').trim().match(/^v?(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

const compare = (a: Semver, b: Semver) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

export function highestSemver(versions: TemplateVersion[] = []): Semver | null {
  const found = versions.map((version) => parseSemver(version.semver)).filter((value): value is Semver => !!value)
  return found.length ? found.sort(compare)[found.length - 1] : null
}

/** The next minor version: 2.1.0 after 2.0.3, 1.0.0 for a first version. */
export function suggestSemver(versions: TemplateVersion[] = []): string {
  const top = highestSemver(versions)
  return top ? `${top[0]}.${top[1] + 1}.0` : '1.0.0'
}

/** Why a version number won't do, or '' when it will. */
export function semverProblem(text: string, versions: TemplateVersion[] = []): string {
  const parsed = parseSemver(text)
  if (!parsed) return 'Use three numbers, like 2.1.0.'
  const top = highestSemver(versions)
  return top && compare(parsed, top) <= 0 ? `Has to be higher than v${top.join('.')}.` : ''
}

export const versionLabel = (version?: Pick<TemplateVersion, 'semver' | 'number'> | null) => (version ? `v${version.semver || `${version.number}.0.0`}` : '')

export const shortDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '')

export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`
