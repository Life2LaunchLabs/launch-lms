const ANCHOR = /<a\b([^>]*?)\bhref\s*=\s*(["'])([^"']*)\2/gi

function unescapeAttr(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * A captured email as the persona reads it: every link opens in the whole window (not inside the
 * email's frame), through ``hrefFor``, which carries the persona's session to the link's own site.
 * The first ``target`` on a tag wins, so ours goes first.
 */
// eslint-disable-next-line no-unused-vars -- parameter names in function types
type HrefFor = (link: string) => string

export function personaMailHtml(html: string, hrefFor: HrefFor): string {
  const body = (html || '').replace(ANCHOR, (...groups: string[]) =>
    `<a target="_top"${groups[1]}href="${escapeAttr(hrefFor(unescapeAttr(groups[3])))}"`)
  return `<base target="_top">${body}`
}
