import { JWAPI_BASE } from './juicewrldApi'
import { resumeEffectsContext } from './audioEffects'
import type { RadioLiveState } from './radioLive'

const RECONNECT_MS = 3000
const LIVE_LAG_SEC = 6
const TRIM_KEEP_SEC = 30
const TRIM_FORCE_SEC = 2

const mseSupported = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.MediaSource !== 'undefined' &&
  window.MediaSource.isTypeSupported('audio/mpeg')

export interface RadioStreamClientOptions {
  onMeta?: (data: RadioLiveState) => void
  onOpen?: () => void
  onClose?: () => void
  onListening?: (active: boolean) => void
}

export class RadioStreamClient {
  private onMeta: (data: RadioLiveState) => void
  private onOpen: () => void
  private onClose: () => void
  private onListening: (active: boolean) => void
  private ws: WebSocket | null = null
  private shouldReconnect = true
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private audioEl: HTMLAudioElement | null = null
  private mediaSource: MediaSource | null = null
  private sourceBuffer: SourceBuffer | null = null
  private queue: Uint8Array[] = []
  private listening = false
  private objectUrl: string | null = null
  private supportsMse = mseSupported()

  constructor({ onMeta, onOpen, onClose, onListening }: RadioStreamClientOptions = {}) {
    this.onMeta = onMeta ?? (() => {})
    this.onOpen = onOpen ?? (() => {})
    this.onClose = onClose ?? (() => {})
    this.onListening = onListening ?? (() => {})
  }

  private get wsUrl(): string {
    const base = JWAPI_BASE.replace(/\/$/, '')
    const url = new URL(base)
    const proto = url.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${url.host}${url.pathname}/ws/radio/`
  }

  private get httpStreamUrl(): string {
    return `${JWAPI_BASE.replace(/\/$/, '')}/radio/stream.mp3`
  }

  attach(audioEl: HTMLAudioElement): void {
    this.audioEl = audioEl
  }

  isListening(): boolean {
    return this.listening
  }

  connect(): void {
    this.shouldReconnect = true
    this.open()
  }

  private open(): void {
    try {
      const ws = new WebSocket(this.wsUrl)
      ws.binaryType = 'arraybuffer'
      ws.onopen = () => {
        this.onOpen()
        if (this.listening) this.sendListening(true)
      }
      ws.onmessage = (event) => this.onMessage(event)
      ws.onclose = () => this.onCloseHandler()
      ws.onerror = () => {}
      this.ws = ws
    } catch {
      this.scheduleReconnect()
    }
  }

  private onMessage(event: MessageEvent): void {
    if (typeof event.data === 'string') {
      try {
        this.onMeta(JSON.parse(event.data) as RadioLiveState)
      } catch {}
      return
    }
    if (this.listening && this.supportsMse) {
      this.enqueue(event.data as ArrayBuffer)
    }
  }

  private onCloseHandler(): void {
    this.ws = null
    this.onClose()
    this.scheduleReconnect()
  }

  private sendListening(value: boolean): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    try {
      this.ws.send(JSON.stringify({
        type: 'listening',
        value,
        audio: this.supportsMse ? 'ws' : 'http',
      }))
    } catch {}
  }

  private send(payload: Record<string, unknown>): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false
    try {
      this.ws.send(JSON.stringify(payload))
      return true
    } catch {
      return false
    }
  }

  proposeSkip(): boolean {
    return this.send({ type: 'propose_skip' })
  }

  proposeQueue(songId: number | string): boolean {
    // The rest of the ecosystem (REST /plays/, /library/favorites/, and the
    // radio metadata's RadioTrack) all key songs as a numeric `song_id` — this
    // was the lone caller sending a stringified `track_id`, which the server
    // ignored (proposal "accepted" client-side but never queued). Send the
    // canonical `song_id` number; keep `track_id` too in case anything old
    // still reads it.
    const id = Number(songId)
    return this.send({ type: 'propose_queue', song_id: id, track_id: String(songId) })
  }

  castVote(value: 'yes' | 'no'): boolean {
    return this.send({ type: 'vote', value })
  }

  // Recovery nudge for mobile background tabs — browsers can silently close
  // the websocket and/or pause the audio element while hidden, without firing
  // the events this class normally reacts to. Safe to call repeatedly: it's a
  // no-op when the connection/audio are already healthy.
  checkHealth(): void {
    if (!this.shouldReconnect) return
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
      this.open()
    }
    if (this.listening && this.audioEl?.paused) {
      resumeEffectsContext()
      this.audioEl.play().catch(() => {})
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => this.open(), RECONNECT_MS)
  }

  disconnect(): void {
    this.shouldReconnect = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.stopListening()
    if (this.ws) {
      try {
        this.ws.close()
      } catch {}
      this.ws = null
    }
  }

  async startListening(): Promise<void> {
    if (!this.audioEl) return
    if (this.listening) {
      resumeEffectsContext()
      await this.audioEl.play().catch(() => {})
      return
    }
    this.listening = true
    this.onListening(true)
    this.sendListening(true)
    if (!this.supportsMse) {
      this.audioEl.src = `${this.httpStreamUrl}?_=${Date.now()}`
      resumeEffectsContext()
      await this.audioEl.play()
      return
    }
    this.queue = []
    this.mediaSource = new window.MediaSource()
    this.objectUrl = URL.createObjectURL(this.mediaSource)
    this.audioEl.src = this.objectUrl
    this.mediaSource.addEventListener(
      'sourceopen',
      () => {
        try {
          this.sourceBuffer = this.mediaSource!.addSourceBuffer('audio/mpeg')
          this.sourceBuffer.mode = 'sequence'
          this.sourceBuffer.addEventListener('updateend', () => this.afterAppend())
          this.pump()
        } catch {}
      },
      { once: true }
    )
  }

  stopListening(): void {
    this.sendListening(false)
    this.listening = false
    this.onListening(false)
    this.queue = []
    if (this.audioEl) {
      try {
        this.audioEl.pause()
      } catch {}
    }
    if (this.mediaSource && this.mediaSource.readyState === 'open') {
      try {
        this.mediaSource.endOfStream()
      } catch {}
    }
    this.sourceBuffer = null
    this.mediaSource = null
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }
    if (this.audioEl) {
      try {
        this.audioEl.removeAttribute('src')
        this.audioEl.load()
      } catch {}
    }
  }

  private enqueue(arrayBuffer: ArrayBuffer): void {
    this.queue.push(new Uint8Array(arrayBuffer))
    this.pump()
  }

  private pump(): void {
    const sb = this.sourceBuffer
    if (!sb || sb.updating || !this.queue.length) return
    const chunk = this.queue.shift()!
    const copy = new Uint8Array(chunk.length)
    copy.set(chunk)
    try {
      sb.appendBuffer(copy)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        this.queue.unshift(chunk)
        this.trim(true)
      }
    }
  }

  private afterAppend(): void {
    this.seekToLive()
    this.trim(false)
    this.pump()
    if (this.audioEl && this.audioEl.paused && this.listening) {
      resumeEffectsContext()
      this.audioEl.play().catch(() => {})
    }
  }

  private seekToLive(): void {
    const el = this.audioEl
    const sb = this.sourceBuffer
    if (!el || !sb || !sb.buffered.length) return
    const end = sb.buffered.end(sb.buffered.length - 1)
    if (end - el.currentTime > LIVE_LAG_SEC) {
      try {
        el.currentTime = end - 1
      } catch {}
    }
  }

  private trim(force: boolean): void {
    const sb = this.sourceBuffer
    const el = this.audioEl
    if (!sb || sb.updating || !sb.buffered.length || !el) return
    const start = sb.buffered.start(0)
    const keepFrom = el.currentTime - (force ? TRIM_FORCE_SEC : TRIM_KEEP_SEC)
    if (keepFrom > start + 1) {
      try {
        sb.remove(start, keepFrom)
      } catch {}
    }
  }
}

// Module-level singleton so non-React code can call client methods
let _activeRadioClient: RadioStreamClient | null = null
export function getActiveRadioClient(): RadioStreamClient | null { return _activeRadioClient }
export function setActiveRadioClient(c: RadioStreamClient | null): void { _activeRadioClient = c }
