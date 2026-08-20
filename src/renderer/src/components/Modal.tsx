import { ReactNode, useRef } from 'react'
import { createPortal } from 'react-dom'

// Shared overlay for the app's modal dialogs. Handles the parts that were
// copy-pasted across every modal: the body portal, the backdrop, its
// click-outside-to-close, and the `floating` variant that pop-out windows use
// (FloatApp mounts the same modal component with floating=true, which drops
// the backdrop/positioning entirely so the dialog just fills the window).
//
// The panel itself (size, radius, header, content) stays with the caller —
// that part genuinely differs per modal and isn't worth forcing into one shape.
export function ModalOverlay({
  onClose,
  floating = false,
  zIndexClassName,
  sheet = false,
  children,
}: {
  onClose: () => void
  floating?: boolean
  /** Full Tailwind class, e.g. 'z-50' or 'z-[160]' — kept as one literal so Tailwind's scanner can find it. */
  zIndexClassName: string
  /** Bottom sheet on mobile / centered on desktop, vs. always centered. */
  sheet?: boolean
  children: ReactNode
}): JSX.Element {
  const overlayRef = useRef<HTMLDivElement>(null)
  return createPortal(
    <div
      ref={overlayRef}
      className={`fixed inset-0 ${zIndexClassName} flex ${
        floating
          ? ''
          : sheet
            ? 'items-end md:items-center justify-center bg-black/70 backdrop-blur-sm p-0 md:p-4'
            : 'items-center justify-center bg-black/60 backdrop-blur-sm px-4'
      }`}
      onClick={(e) => { if (!floating && e.target === overlayRef.current) onClose() }}
    >
      {children}
    </div>,
    document.body,
  )
}
