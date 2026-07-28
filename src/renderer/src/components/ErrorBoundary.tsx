import { Component, ReactNode } from 'react'
import { AlertTriangle, Copy, Check } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  // 'inline' (default) — the error card fills its slot in the layout, for
  // boundaries around a content pane.
  // 'overlay' — for boundaries around modals and pop-out panels, which render
  // as loose siblings at the root rather than inside a sized container. The
  // card is centered over a backdrop instead of stretching the root flex
  // column, and gets a Close button so a crashed modal can still be dismissed
  // (`onDismiss` should flip whatever store flag mounts it — without that the
  // card would sit over the app with no way out).
  variant?: 'inline' | 'overlay'
  onDismiss?: () => void
}
interface State { error: Error | null; copied: boolean }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, copied: false }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }): void {
    console.error('ErrorBoundary caught:', error, info)
  }

  private copyError = (): void => {
    const { error } = this.state
    if (!error) return
    const text = `${error.message}\n\n${error.stack ?? ''}`
    navigator.clipboard.writeText(text).then(() => {
      this.setState({ copied: true })
      setTimeout(() => this.setState({ copied: false }), 2000)
    }).catch(() => {/* ignore */})
  }

  private dismiss = (): void => {
    this.setState({ error: null })
    this.props.onDismiss?.()
  }

  render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback !== undefined) return this.props.fallback
      const overlay = this.props.variant === 'overlay'
      const card = (
          <div className={`flex flex-col items-center justify-center gap-3 p-8 text-center ${overlay ? 'w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl' : 'h-full flex-1'}`}>
            <AlertTriangle className="text-text-muted w-8 h-8" />
            <p className="text-text-primary text-sm font-semibold">Something went wrong</p>
            <p className="text-red-400 text-xs font-mono max-w-md break-all">
              {this.state.error.message}
            </p>
            <div className="relative w-full max-w-lg">
              <pre className="text-text-muted text-[10px] font-mono max-h-44 overflow-auto text-left bg-surface-overlay rounded-lg p-3 whitespace-pre-wrap">
                {this.state.error.stack}
              </pre>
              <button
                onClick={this.copyError}
                title="Copy error to clipboard"
                className="absolute top-2 right-2 p-1.5 rounded bg-surface-raised hover:bg-surface-highest text-text-muted hover:text-text-primary transition-colors"
              >
                {this.state.copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              </button>
            </div>
            <div className="flex items-center gap-4 mt-1">
              <button
                className="text-xs text-accent hover:text-accent-hover underline"
                onClick={() => this.setState({ error: null })}
              >
                Try again
              </button>
              {overlay && this.props.onDismiss && (
                <button className="text-xs text-text-muted hover:text-text-primary underline" onClick={this.dismiss}>
                  Close
                </button>
              )}
            </div>
          </div>
      )
      if (!overlay) return card
      return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
          {card}
        </div>
      )
    }
    return this.props.children
  }
}
