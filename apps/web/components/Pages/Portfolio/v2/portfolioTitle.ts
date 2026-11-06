/** The tab's name on someone's portfolio: "Maya’s portfolio". */
export function portfolioTitle(name?: string | null) {
  const clean = String(name || '').trim()
  return clean ? `${clean}’s portfolio` : 'Portfolio'
}
