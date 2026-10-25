import type { BadgeAward } from '@services/badges/badges'

/** The PDF's file name: the badge and who earned it, safe on every system. */
export function certificateFileName(award: BadgeAward): string {
  const learner = award.learner?.name || award.learner?.username || ''
  const base = [award.achievement.name, learner].filter(Boolean).join(' - ').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim()
  return `${base || 'Certificate'}.pdf`
}

// US Letter, landscape, in points: the certificate's own 11 x 8.5 shape.
const PAGE = { width: 792, height: 612 }
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

/**
 * The certificate, as shown on the page, saved as a one-page PDF. It is drawn from the same element the
 * page shows, so it always matches the badge's style; a font or image the browser can't read is left out
 * rather than failing the download.
 */
export async function downloadCertificatePdf(certificate: HTMLElement, fileName: string): Promise<void> {
  const [{ toPng }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')])
  const pixelRatio = Math.max(2, 2400 / Math.max(1, certificate.offsetWidth))
  const options = { pixelRatio, cacheBust: true, imagePlaceholder: BLANK, style: { boxShadow: 'none', borderRadius: '0' } }
  const image = await toPng(certificate, options).catch(() => toPng(certificate, { ...options, skipFonts: true }))
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' })
  pdf.addImage(image, 'PNG', 0, 0, PAGE.width, PAGE.height)
  pdf.save(fileName)
}
