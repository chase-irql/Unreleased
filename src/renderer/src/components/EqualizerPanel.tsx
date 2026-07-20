import { RotateCcw } from 'lucide-react'
import { useStorePick } from '../store/useStore'
import { EQ_BANDS, EQ_GAIN_LIMIT, EQ_PRESETS } from '../lib/audioEffects'

// Short axis labels for the band sliders (32 … 16K).
function bandLabel(freq: number): string {
  return freq >= 1000 ? `${freq / 1000}K` : String(freq)
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`relative w-10 h-5 rounded-full shrink-0 transition-colors appearance-none border-0 p-0 leading-none ${on ? 'bg-accent' : 'bg-[var(--surface-overlay)]'}`}
    >
      <span className={`absolute inset-y-0 my-auto w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

// The equalizer popover's contents. Positioning (portal + backdrop) is owned
// by the caller (Player), matching how the output-device picker works.
export default function EqualizerPanel(): JSX.Element {
  const {
    eqEnabled, setEqEnabled,
    eqGains, setEqBand,
    eqPreset, setEqPreset,
    eqBalance, setEqBalance,
    eqMono, setEqMono,
    skipSilence, setSkipSilence,
    playbackSpeed, setPlaybackSpeed,
    speedActive, setSpeedActive,
    pitchShift, setPitchShift,
    reverbEnabled, setReverbEnabled,
    reverbMix, setReverbMix,
    reverbDecay, setReverbDecay,
    communityEdits, applyCommunityEdit,
    radioFmActive,
  } = useStorePick('eqEnabled', 'setEqEnabled', 'eqGains', 'setEqBand', 'eqPreset', 'setEqPreset', 'eqBalance', 'setEqBalance', 'eqMono', 'setEqMono', 'skipSilence', 'setSkipSilence', 'playbackSpeed', 'setPlaybackSpeed', 'speedActive', 'setSpeedActive', 'pitchShift', 'setPitchShift', 'reverbEnabled', 'setReverbEnabled', 'reverbMix', 'setReverbMix', 'reverbDecay', 'setReverbDecay', 'communityEdits', 'applyCommunityEdit', 'radioFmActive')

  const balancePct = Math.round(eqBalance * 100)
  const balanceLabel = balancePct === 0 ? 'C' : balancePct < 0 ? `L ${-balancePct}` : `R ${balancePct}`

  return (
    <div className="w-[340px] select-none">
      {/* Header: title + enable toggle */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">Equalizer</p>
        <Toggle on={eqEnabled} onClick={() => setEqEnabled(!eqEnabled)} />
      </div>

      {/* Preset picker */}
      <div className="px-4 pb-3">
        <select
          value={eqPreset}
          onChange={(e) => setEqPreset(e.target.value)}
          disabled={!eqEnabled}
          className="w-full bg-[var(--surface-overlay)] text-text-primary text-xs rounded-lg px-2 py-1.5 border border-[var(--border)] disabled:opacity-50"
        >
          {eqPreset === 'custom' && <option value="custom">Custom</option>}
          {EQ_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Community edits — shared effect configs, applied like presets but
          able to set anything in this panel. The API endpoints for them
          don't exist yet, so the store list stays empty and only the empty
          state renders for now. Not gated by the EQ toggle: an edit can
          enable whatever it needs itself. */}
      <div className="px-4 pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted pb-1.5">Community edits</p>
        {communityEdits.length === 0 ? (
          <p className="text-[11px] text-text-muted bg-[var(--surface-overlay)] border border-[var(--border)] rounded-lg px-3 py-2">
            Nothing here yet — community-shared edits will appear once they go live.
          </p>
        ) : (
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {communityEdits.map((edit) => (
              <button
                key={edit.id}
                onClick={() => applyCommunityEdit(edit)}
                className="w-full flex items-baseline gap-2 px-3 py-1.5 rounded-lg text-left bg-[var(--surface-overlay)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
              >
                <span className="text-xs text-text-primary truncate">{edit.name}</span>
                {edit.author && <span className="text-[10px] text-text-muted truncate shrink-0">by {edit.author}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Band sliders */}
      <div className={`px-4 pb-2 transition-opacity ${eqEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
        <div className="flex justify-between">
          {EQ_BANDS.map((freq, i) => (
            <div key={freq} className="flex flex-col items-center gap-1">
              <span className="text-[9px] text-text-muted tabular-nums h-3">
                {eqGains[i] !== 0 ? `${eqGains[i] > 0 ? '+' : ''}${eqGains[i]}` : ''}
              </span>
              {/* Vertical slider: a rotated horizontal range input */}
              <div className="relative h-24 w-6 flex items-center justify-center">
                <input
                  type="range"
                  min={-EQ_GAIN_LIMIT} max={EQ_GAIN_LIMIT} step={1}
                  value={eqGains[i]}
                  onChange={(e) => setEqBand(i, parseInt(e.target.value, 10))}
                  onDoubleClick={() => setEqBand(i, 0)}
                  disabled={!eqEnabled}
                  className="absolute w-24 accent-[var(--accent)]"
                  style={{ transform: 'rotate(-90deg)' }}
                  title={`${bandLabel(freq)} Hz — double-click to reset`}
                />
              </div>
              <span className="text-[9px] text-text-muted">{bandLabel(freq)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-[var(--border)] mx-4" />

      {/* Balance */}
      <div className="flex items-center gap-3 px-4 py-2.5">
        <span className="text-xs text-text-secondary w-24 shrink-0">Balance</span>
        <span className="text-[10px] text-text-muted">L</span>
        <input
          type="range" min={-1} max={1} step={0.05}
          value={eqBalance}
          onChange={(e) => setEqBalance(parseFloat(e.target.value))}
          onDoubleClick={() => setEqBalance(0)}
          className="flex-1 accent-[var(--accent)]"
          title="Left/right balance — double-click to center"
        />
        <span className="text-[10px] text-text-muted">R</span>
        <span className="text-xs text-text-muted tabular-nums w-8 text-right">{balanceLabel}</span>
      </div>

      {/* Mono */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <div>
          <p className="text-xs text-text-secondary">Mono audio</p>
          <p className="text-[10px] text-text-muted">Play both channels as one</p>
        </div>
        <Toggle on={eqMono} onClick={() => setEqMono(!eqMono)} />
      </div>

      {/* Skip silence */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <div>
          <p className="text-xs text-text-secondary">Skip silence</p>
          <p className="text-[10px] text-text-muted">Jump over silent parts</p>
        </div>
        <Toggle on={skipSilence} onClick={() => setSkipSilence(!skipSilence)} />
      </div>

      {/* Reverb */}
      <div className="border-t border-[var(--border)] mx-4" />
      <div className="flex items-center justify-between px-4 pt-2.5 pb-1">
        <div>
          <p className="text-xs text-text-secondary">Reverb</p>
          <p className="text-[10px] text-text-muted">Add space and echo</p>
        </div>
        <Toggle on={reverbEnabled} onClick={() => setReverbEnabled(!reverbEnabled)} />
      </div>
      <div className={`pb-1 transition-opacity ${reverbEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
        <div className="flex items-center gap-3 px-4 py-1.5">
          <span className="text-xs text-text-secondary w-24 shrink-0">Amount</span>
          <input
            type="range" min={0} max={1} step={0.05}
            value={reverbMix}
            onChange={(e) => setReverbMix(parseFloat(e.target.value))}
            onDoubleClick={() => setReverbMix(0.4)}
            disabled={!reverbEnabled}
            className="flex-1 accent-[var(--accent)]"
            title="Reverb amount (dry/wet mix) — double-click to reset"
          />
          <span className="text-xs text-text-muted tabular-nums w-12 text-right">{Math.round(reverbMix * 100)}%</span>
        </div>
        <div className="flex items-center gap-3 px-4 py-1.5">
          <span className="text-xs text-text-secondary w-24 shrink-0">Decay</span>
          <input
            type="range" min={1} max={8} step={0.5}
            value={reverbDecay}
            onChange={(e) => setReverbDecay(parseFloat(e.target.value))}
            onDoubleClick={() => setReverbDecay(3)}
            disabled={!reverbEnabled}
            className="flex-1 accent-[var(--accent)]"
            title="Reverb tail length — double-click to reset"
          />
          <span className="text-xs text-text-muted tabular-nums w-12 text-right">{reverbDecay.toFixed(1)}s</span>
        </div>
      </div>

      {/* Speed — one control for slowed AND sped-up; with pitch shift on,
          below 1x is the slowed feel, above 1x goes nightcore. Hidden during
          FM: a live stream has no meaningful playback rate. */}
      {!radioFmActive && (
        <>
          <div className="border-t border-[var(--border)] mx-4" />
          <div className="flex items-center justify-between px-4 pt-2.5 pb-1">
            <div>
              <p className="text-xs text-text-secondary">Speed</p>
              <p className="text-[10px] text-text-muted">Slow down or speed up playback</p>
            </div>
            <Toggle on={speedActive} onClick={() => setSpeedActive(!speedActive)} />
          </div>
          <div className={`pb-1 transition-opacity ${speedActive ? '' : 'opacity-40 pointer-events-none'}`}>
            <div className="flex items-center gap-3 px-4 py-1.5">
              <span className="text-xs text-text-secondary w-24 shrink-0">Rate</span>
              <input
                type="range" min={0.5} max={2} step={0.05}
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                onDoubleClick={() => setPlaybackSpeed(1)}
                disabled={!speedActive}
                className="flex-1 accent-[var(--accent)]"
                title="Playback speed — double-click to reset"
              />
              <span className="text-xs text-text-muted tabular-nums w-12 text-right">{playbackSpeed.toFixed(2)}x</span>
              {playbackSpeed !== 1 && (
                <button
                  onClick={() => setPlaybackSpeed(1)}
                  title="Reset speed"
                  className="text-text-muted hover:text-text-primary transition-colors"
                >
                  <RotateCcw size={12} />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between px-4 py-1.5">
              <div>
                <p className="text-xs text-text-secondary">Pitch shift</p>
                <p className="text-[10px] text-text-muted">Pitch follows speed — slowed below 1x, nightcore above</p>
              </div>
              <Toggle on={pitchShift} onClick={() => setPitchShift(!pitchShift)} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
