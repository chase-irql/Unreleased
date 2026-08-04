import { ReactEventHandler, useEffect, useState } from 'react'
import { hasSmallCoverVariant, smallCoverUrl } from '../lib/juicewrldApi'

interface Props {
  src: string | null | undefined
  alt?: string
  className?: string
  onError?: ReactEventHandler<HTMLImageElement>
}

// A cover drawn large enough to need the full-size image, but loaded in two
// steps: the API's degraded 128x128 variant paints almost immediately (~3KB),
// then the full ~1MB original replaces it once it arrives. The user sees art on
// the first frame after a track change instead of an empty box for as long as
// the big PNG takes.
//
// For URLs with no degraded variant (site assets, local files, data URLs) this
// is just an <img> — one load, no placeholder step.
export function ProgressiveCover({ src, alt = '', className = '', onError }: Props): JSX.Element | null {
  const placeholder = hasSmallCoverVariant(src) ? smallCoverUrl(src) : undefined
  const [fullLoaded, setFullLoaded] = useState(false)

  useEffect(() => {
    if (!src || !placeholder) { setFullLoaded(false); return }
    setFullLoaded(false)
    // Preloading in an off-DOM Image (rather than swapping the <img> src and
    // waiting) keeps the placeholder painted until the full copy is decoded —
    // swapping src directly blanks the element while the new one loads.
    const img = new Image()
    let cancelled = false
    img.onload = () => { if (!cancelled) setFullLoaded(true) }
    // A failed full load is not an error state: the placeholder is a perfectly
    // good cover, so leave it up and let the caller's onError stay unfired.
    img.src = src
    return () => { cancelled = true; img.onload = null }
  }, [src, placeholder])

  if (!src) return null
  const showing = placeholder && !fullLoaded ? placeholder : src
  return (
    <img
      src={showing}
      alt={alt}
      className={className}
      decoding="async"
      onError={onError}
    />
  )
}
