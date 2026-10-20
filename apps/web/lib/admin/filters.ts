/**
 * List filters for the admin tabs: one search box, a Filter popover and a row of removable chips.
 *
 * A tab describes its filters as a list of specs. A choice filter picks one option (its default
 * shows nothing applied); a yes/no filter ("Only show: Earns a badge") is on or off. Values live
 * in the URL query under each spec's key, with the search under `q`, and a value equal to its
 * default stays out of the URL. Filtering itself is up to each tab, over the list it loads.
 */

export type FilterOption = { value: string; label: string }

export type ChoiceFilterSpec = {
  key: string
  label: string
  options: FilterOption[]
  /** The value that means "no filter"; '' when left out. */
  default?: string
  bool?: undefined
}

export type BoolFilterSpec = { key: string; label: string; bool: true; options?: undefined; default?: undefined }

export type FilterSpec = ChoiceFilterSpec | BoolFilterSpec

/** Every spec's value by key, plus the search under `q`. A yes/no filter is '1' when on and '' when off. */
export type FilterValues = Record<string, string>

export type FilterParams = URLSearchParams | Record<string, string | string[] | undefined>

export const SEARCH_KEY = 'q'
const ON = '1'

export function filterDefault(spec: FilterSpec): string {
  return spec.bool ? '' : spec.default ?? ''
}

export function filterDefaults(specs: readonly FilterSpec[]): FilterValues {
  return Object.fromEntries([[SEARCH_KEY, ''], ...specs.map((spec) => [spec.key, filterDefault(spec)])])
}

function param(params: FilterParams, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined
  const value = params[key]
  return Array.isArray(value) ? value[0] : value
}

/**
 * The values in a URL query. Choice values are kept as given even when no option matches yet,
 * because some option lists (learners, groups) load after the page.
 */
export function readFilters(specs: readonly FilterSpec[], params: FilterParams): FilterValues {
  const values = filterDefaults(specs)
  values[SEARCH_KEY] = param(params, SEARCH_KEY)?.trim() ?? ''
  for (const spec of specs) {
    const raw = param(params, spec.key)
    if (raw === undefined) continue
    values[spec.key] = spec.bool ? (raw === ON || raw === 'true' ? ON : '') : raw
  }
  return values
}

/**
 * The URL query for these values (without the "?"): non-default values only. Other parameters
 * in `base` (a tab's own `view`, say) are kept.
 */
export function filterQuery(specs: readonly FilterSpec[], values: FilterValues, base?: URLSearchParams | string): string {
  const search = new URLSearchParams(base)
  for (const key of [SEARCH_KEY, ...specs.map((spec) => spec.key)]) search.delete(key)
  const q = (values[SEARCH_KEY] || '').trim()
  if (q) search.set(SEARCH_KEY, q)
  for (const spec of specs) {
    const value = values[spec.key] ?? filterDefault(spec)
    if (value !== filterDefault(spec)) search.set(spec.key, spec.bool ? ON : value)
  }
  return search.toString()
}

export function isApplied(spec: FilterSpec, values: FilterValues): boolean {
  return (values[spec.key] ?? filterDefault(spec)) !== filterDefault(spec)
}

export function isOn(values: FilterValues, key: string): boolean {
  return values[key] === ON
}

export type AppliedFilter = { key: string; label: string }

/** The chips: one per applied filter, "Group: Advisory B" for a choice, the label alone for yes/no. */
export function appliedFilters(specs: readonly FilterSpec[], values: FilterValues): AppliedFilter[] {
  return specs.filter((spec) => isApplied(spec, values)).map((spec) => {
    if (spec.bool) return { key: spec.key, label: spec.label }
    const value = values[spec.key]
    const option = spec.options.find((item) => item.value === value)
    return { key: spec.key, label: `${spec.label}: ${option?.label ?? value}` }
  })
}

export function appliedCount(specs: readonly FilterSpec[], values: FilterValues): number {
  return specs.filter((spec) => isApplied(spec, values)).length
}

/** Sets one value; for a yes/no filter any truthy value turns it on. */
export function setFilter(specs: readonly FilterSpec[], values: FilterValues, key: string, value: string | boolean): FilterValues {
  const spec = specs.find((item) => item.key === key)
  if (key === SEARCH_KEY) return { ...values, [SEARCH_KEY]: String(value) }
  if (!spec) return values
  return { ...values, [key]: spec.bool ? (value && value !== '0' ? ON : '') : String(value) }
}

export function toggleFilter(specs: readonly FilterSpec[], values: FilterValues, key: string): FilterValues {
  return setFilter(specs, values, key, !isOn(values, key))
}

export function clearFilter(specs: readonly FilterSpec[], values: FilterValues, key: string): FilterValues {
  if (key === SEARCH_KEY) return { ...values, [SEARCH_KEY]: '' }
  const spec = specs.find((item) => item.key === key)
  return spec ? { ...values, [key]: filterDefault(spec) } : values
}

/** "Clear all" resets every filter and keeps the search. */
export function clearFilters(specs: readonly FilterSpec[], values: FilterValues): FilterValues {
  return { ...filterDefaults(specs), [SEARCH_KEY]: values[SEARCH_KEY] || '' }
}

/** Whether every word of the search appears in one of the fields (case- and accent-insensitive). */
export function matchesSearch(query: string | null | undefined, ...fields: Array<string | number | null | undefined | false>): boolean {
  const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const words = fold(query || '').split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const haystack = fold(fields.filter((field) => field !== null && field !== undefined && field !== false).join(' \u0000 '))
  return words.every((word) => haystack.includes(word))
}
