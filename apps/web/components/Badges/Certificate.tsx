'use client'

import React from 'react'
import { ShieldCheck } from 'lucide-react'
import { badgeKindLabel, type CertificateStyle } from '@services/badges/badges'
import { BadgeMedal, medalColor, type MedalSource } from './BadgeMedal'

export type CertificateProps = {
  badge: MedalSource & { name: string; description?: string; kind?: string | null }
  style: CertificateStyle
  learner: string
  /** The organization that ran the plan with the learner (or awarded it directly). */
  awardedBy: { name: string; logo_url?: string | null } | null
  date: string
  /** Shown under "Scan to verify", and encoded in the QR code with ``verifyUrl``. */
  code: string
  verifyUrl?: string
  /** False for a revoked award: the modern style's band then doesn't say it's verified. */
  verified?: boolean
}

function useQrCode(value: string) {
  const [src, setSrc] = React.useState('')
  React.useEffect(() => {
    let live = true
    import('qrcode').then(({ default: QRCode }) => QRCode.toDataURL(value, { width: 240, margin: 1, errorCorrectionLevel: 'M' }))
      .then((url) => { if (live) setSrc(url) }).catch(() => undefined)
    return () => { live = false }
  }, [value])
  return src
}

/** Shrinks text that would overflow its box until it fits, down to a floor, so long names never spill. */
function useFit(ref: React.RefObject<HTMLDivElement | null>, deps: unknown[]) {
  React.useLayoutEffect(() => {
    const cert = ref.current
    if (!cert) return
    const fit = () => {
      const width = cert.getBoundingClientRect().width
      if (!width) return
      cert.querySelectorAll<HTMLElement>('[data-fit]').forEach((element) => {
        element.style.fontSize = ''
        const floor = (parseFloat(element.dataset.fit || '1') * width) / 100
        let size = parseFloat(getComputedStyle(element).fontSize)
        for (let guard = 0; element.scrollHeight > element.clientHeight + 1 && size > floor && guard < 40; guard += 1) {
          size = Math.max(floor, size * 0.93)
          element.style.fontSize = `${size}px`
        }
      })
    }
    fit()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
    observer?.observe(cert)
    return () => observer?.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/** A badge's certificate as one learner gets it, in the style the plan's badge chose. */
export default function Certificate({ badge, style, learner, awardedBy, date, code, verifyUrl, verified = true }: CertificateProps) {
  const ref = React.useRef<HTMLDivElement>(null)
  const qr = useQrCode(verifyUrl || code)
  useFit(ref, [badge.name, badge.description, learner, style])
  const eyebrow = <p className="cert-eyebrow">{badgeKindLabel(badge.kind)}</p>
  const body = <>
    <p className="cert-label cert-mid">This certifies that</p>
    <p className="cert-learner" data-fit="2.6">{learner}</p>
    <p className="cert-label cert-gap">has earned</p>
    <p className="cert-name" data-fit="1.6">{badge.name || 'Untitled badge'}</p>
    {badge.description ? <p className="cert-description" data-fit="1.15">{badge.description}</p> : null}
  </>
  const foot = <div className="cert-foot">
    <div className="cert-col cert-who">
      <span className="cert-label">Awarded by</span>
      <span className="cert-org">
        {awardedBy?.logo_url ? <img src={awardedBy.logo_url} alt="" /> : <i>{(awardedBy?.name || '?').slice(0, 2).toUpperCase()}</i>}
        <b>{awardedBy?.name || ''}</b>
      </span>
    </div>
    <div className="cert-col cert-date"><span className="cert-label">On</span><b>{date}</b></div>
    <div className="cert-qr-col">
      <div className="cert-col"><span className="cert-label">Scan to verify</span><span className="cert-code">{code}</span></div>
      {qr ? <img className="cert-qr" src={qr} alt="QR code to verify this badge" /> : <span className="cert-qr" />}
    </div>
  </div>
  let inner: React.ReactNode
  if (style === 'classic') inner = <><div className="cert-frame" /><div className="cert-content"><BadgeMedal badge={badge} />{eyebrow}{body}{foot}</div></>
  else if (style === 'minimal') inner = <><div className="cert-rule" /><div className="cert-content"><div className="cert-row"><div className="min-w-0">{eyebrow}</div><BadgeMedal badge={badge} /></div>{body}{foot}</div></>
  else inner = <><div className="cert-band"><BadgeMedal badge={badge} /><span className="cert-verified">{verified ? <><ShieldCheck aria-hidden="true" />Verified Open Badge</> : 'Open Badge'}</span></div><div className="cert-content">{eyebrow}{body}{foot}</div></>
  return <div className="cert-wrap"><div ref={ref} className={`cert cert-${style}`} style={{ '--cc': medalColor(badge) } as React.CSSProperties}>{inner}</div></div>
}
