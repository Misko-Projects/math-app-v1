// Storybook "Audio Lab" (A01): plays every SFX and music track, sample narration (stitched clips or
// the Web Speech fallback), queue/cancel demos and the number composer, with a live mixer.
// Developer tool: its labels are English and inline, and children never see it.
import { useEffect, useRef, useState } from 'react';
import {
  type AudioEvent,
  type AudioState,
  createAudioManager,
  type WebAudioManager,
} from '../AudioManager';
import { MUSIC_CATALOG, MUSIC_IDS } from '../music/tracks';
import { planLine } from '../narration';
import { DEFAULT_AUDIO_SETTINGS } from '../settings';
import { SFX_CATALOG, SFX_IDS } from '../sfx/catalog';
import { demoClipWav } from './demoClips';
import { MusicIcon, SFX_ICONS, SpeakerIcon } from './icons';
import {
  COMPOSER_TYPES,
  type ComposerTypeId,
  labManifest,
  labNarration,
  SAMPLE_LINES,
} from './labNarration';
import './AudioLab.css';

export type ClipSource = 'demo' | 'speech';

export interface AudioLabProps {
  /** `demo`: stitched demo-tone clips; `speech`: no manifest, so every line uses Web Speech. */
  initialSource?: ClipSource;
  /** Injected in tests (e.g. a manager on a fake context). */
  createManager?: (source: ClipSource) => WebAudioManager;
}

interface NowSpeaking {
  lineId: number;
  text: string;
  voice: string;
  via: 'clips' | 'speech';
  clips: string[];
  activeClip: number;
  done: boolean;
}

function defaultManager(source: ClipSource): WebAudioManager {
  const manifest = source === 'demo' ? labManifest() : null;
  return createAudioManager({
    narration: labNarration,
    manifest,
    audioBaseUrl: '/lab-audio/',
    fetchClip: async (url) => {
      const file = decodeURIComponent(url.replace(/^\/lab-audio\//, ''));
      const id = Object.entries(manifest?.clips ?? {}).find(([, c]) => c.file === file)?.[0];
      const ms = (id && manifest?.clips[id]?.durationMs) || 400;
      return demoClipWav(id ?? file, ms);
    },
    warn: (m) => console.info(`[audio-lab] ${m}`),
  });
}

const STATE_LABEL: Record<AudioState, string> = {
  locked: 'Locked: tap to start',
  running: 'Audio on',
  unavailable: 'Web Audio unavailable',
};

export function AudioLab({
  initialSource = 'demo',
  createManager = defaultManager,
}: AudioLabProps) {
  const [source, setSource] = useState<ClipSource>(initialSource);
  const [manager, setManager] = useState<WebAudioManager | null>(null);
  const [state, setState] = useState<AudioState>('locked');
  const [now, setNow] = useState<NowSpeaking | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [volumes, setVolumes] = useState(DEFAULT_AUDIO_SETTINGS.volumes);
  const [voiceRate, setVoiceRate] = useState(DEFAULT_AUDIO_SETTINGS.voiceRate);
  const [musicOn, setMusicOn] = useState(DEFAULT_AUDIO_SETTINGS.musicEnabled);
  const [track, setTrack] = useState<string | null>(null);
  const [lastSfx, setLastSfx] = useState<string | null>(null);
  const [composerType, setComposerType] = useState<ComposerTypeId>('num');
  const [composerValue, setComposerValue] = useState<string>('12345');
  const unlockedOnce = useRef(false);
  // The mixer survives a clip-source switch (which builds a new manager).
  const mix = useRef({ volumes, voiceRate, musicOn, track });
  mix.current = { volumes, voiceRate, musicOn, track };

  useEffect(() => {
    // Built inside the effect (not useMemo) so React StrictMode's mount → unmount → mount never
    // leaves the page holding a disposed manager.
    const m = createManager(source);
    const { volumes: v, voiceRate: rate, musicOn: on, track: t } = mix.current;
    m.configure({ volumes: v, voiceRate: rate, musicEnabled: on });
    m.music(t);
    setManager(m);
    setState(m.state);
    setNow(null);
    const off = m.subscribe((e: AudioEvent) => {
      if (e.type === 'state') setState(e.state);
      if (e.type === 'line-start') {
        setNow({
          lineId: e.lineId,
          text: e.text,
          voice: e.voice,
          via: e.via,
          clips: e.clips,
          activeClip: e.via === 'clips' ? 0 : -1,
          done: false,
        });
      }
      if (e.type === 'clip-start') {
        setNow((n) => (n && n.lineId === e.lineId ? { ...n, activeClip: e.index } : n));
      }
      if (e.type === 'line-end') {
        setNow((n) => (n && n.lineId === e.lineId ? { ...n, done: true, activeClip: -1 } : n));
      }
      if (e.type !== 'clip-start') setLog((l) => [describe(e), ...l].slice(0, 5));
    });
    if (unlockedOnce.current) void m.unlock();
    return () => {
      off();
      void m.dispose();
    };
  }, [createManager, source]);

  const unlock = () => {
    unlockedOnce.current = true;
    void manager?.unlock();
  };

  const composer = COMPOSER_TYPES.find((t) => t.id === composerType) ?? COMPOSER_TYPES[0];
  const composerVars = {
    v: /^-?\d+$/.test(composerValue.trim()) ? Number(composerValue) : composerValue.trim(),
  };
  const composerPlan = planLine(labNarration, `lab.compose.${composer.id}`, composerVars);
  const composerClips =
    composerPlan?.clips
      ?.filter((c) => !c.optional)
      .map((c) => (c.candidates[0] ?? '').replace(/#0$/, '')) ?? null;

  const playing = now && !now.done;

  return (
    <div className="alab">
      <header className="alab-header">
        <div className="alab-title">
          <span className="alab-logo" aria-hidden="true">
            <SpeakerIcon />
          </span>
          <div>
            <h1>Audio Lab</h1>
            <p>Every sound, voice line and number word, through the real AudioManager.</p>
          </div>
        </div>
        <div className="alab-status">
          <span className="alab-pill" data-state={state} role="status">
            {STATE_LABEL[state]}
          </span>
          {state !== 'running' && (
            <button type="button" className="alab-btn alab-btn-start" onClick={unlock}>
              Tap to start audio
            </button>
          )}
        </div>
      </header>

      <div className="alab-grid">
        <section className="alab-card alab-sfx" aria-labelledby="alab-sfx-h">
          <h2 id="alab-sfx-h">Sound effects</h2>
          <div className="alab-sfx-grid">
            {SFX_IDS.map((id, i) => {
              const Icon = SFX_ICONS[id];
              return (
                <button
                  key={id}
                  type="button"
                  className="alab-sfx-tile"
                  data-tone={i % 6}
                  data-active={lastSfx === id || undefined}
                  onClick={() => {
                    setLastSfx(id);
                    manager?.sfx(id);
                  }}
                >
                  <span className="alab-sfx-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span className="alab-sfx-label">{SFX_CATALOG[id].label}</span>
                  <span className="alab-sfx-use">{SFX_CATALOG[id].use}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="alab-card alab-narration" aria-labelledby="alab-narr-h">
          <h2 id="alab-narr-h">Narration</h2>
          <fieldset className="alab-source">
            <legend>Clip source</legend>
            <label>
              <input
                type="radio"
                name="alab-source"
                checked={source === 'demo'}
                onChange={() => setSource('demo')}
              />
              Stitched clips (demo tones)
            </label>
            <label>
              <input
                type="radio"
                name="alab-source"
                checked={source === 'speech'}
                onChange={() => setSource('speech')}
              />
              No manifest: Web Speech
            </label>
          </fieldset>
          <div className="alab-lines">
            {SAMPLE_LINES.map((line) => (
              <button
                key={line.id}
                type="button"
                className="alab-line"
                onClick={() => void manager?.say(line.key, line.vars)}
              >
                <span className="alab-line-label">{line.label}</span>
                <span className="alab-line-text">
                  {planLine(labNarration, line.key, line.vars)?.text ?? line.key}
                </span>
              </button>
            ))}
          </div>
          <h3 className="alab-subhead">Queue and cancel rules</h3>
          <div className="alab-row">
            <button
              type="button"
              className="alab-btn"
              onClick={() => {
                void manager?.say('p.count.how-many');
                void manager?.say('fb.correct.1');
              }}
            >
              Prompt, then feedback (waits)
            </button>
            <button
              type="button"
              className="alab-btn"
              onClick={() => {
                void manager?.say('game.pip.welcome');
                setTimeout(() => void manager?.say('p.count.how-many'), 700);
              }}
            >
              New line cuts in
            </button>
            <button
              type="button"
              className="alab-btn"
              onClick={() => {
                void manager?.say('fb.retry');
                void manager?.sayPhrases([{ id: 'ph.how-many-are-still-empty' }]);
                void manager?.sayText('Hi! I’m Glim, a computer helper. I love puzzles!');
              }}
            >
              Glim follows feedback
            </button>
          </div>
        </section>

        <section className="alab-card alab-composer" aria-labelledby="alab-comp-h">
          <h2 id="alab-comp-h">Number composer</h2>
          <div className="alab-composer-inputs">
            <label className="alab-field">
              <span>Slot type</span>
              <select
                value={composerType}
                onChange={(e) => {
                  const next = COMPOSER_TYPES.find((t) => t.id === e.target.value);
                  if (!next) return;
                  setComposerType(next.id);
                  setComposerValue(next.example);
                }}
              >
                {COMPOSER_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="alab-field">
              <span>Value</span>
              <input
                value={composerValue}
                inputMode="numeric"
                onChange={(e) => setComposerValue(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="alab-btn alab-btn-primary"
              disabled={!composerClips}
              onClick={() => void manager?.say(`lab.compose.${composer.id}`, composerVars)}
            >
              Say it
            </button>
          </div>
          <p className="alab-composed" aria-live="polite">
            {composerPlan && composerClips ? (
              <>
                <span className="alab-composed-text">{composerPlan.text.replace(/\.$/, '')}</span>
                <span className="alab-composed-words">
                  “{composerPlan.spoken.replace(/\.$/, '')}”
                </span>
              </>
            ) : (
              <span className="alab-composed-error">
                {composerPlan?.problems[0]?.replace(/^lab\.compose\.\w+: /, '') ??
                  'Not a valid value'}
              </span>
            )}
          </p>
          <ol className="alab-chips" aria-label="Clips">
            {(composerClips ?? []).map((c, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: clips repeat; position is the identity
              <li key={`${c}-${i}`} className="alab-chip">
                {c}
              </li>
            ))}
          </ol>
        </section>

        <section className="alab-card alab-now" aria-labelledby="alab-now-h">
          <h2 id="alab-now-h">Now speaking</h2>
          {now ? (
            <>
              <p className="alab-caption" data-done={now.done || undefined}>
                {now.text}
              </p>
              <p className="alab-meta">
                <span className="alab-tag" data-via={now.via}>
                  {now.via === 'clips' ? 'Stitched clips' : 'Web Speech'}
                </span>
                <span className="alab-tag">Voice: {now.voice}</span>
                <span className="alab-tag">{playing ? 'Playing' : 'Finished'}</span>
              </p>
              {now.clips.length > 0 && (
                <ol className="alab-chips" aria-label="Clips of the current line">
                  {now.clips.map((c, i) => (
                    <li
                      // biome-ignore lint/suspicious/noArrayIndexKey: clips repeat; position is the identity
                      key={`${c}-${i}`}
                      className="alab-chip"
                      data-active={i === now.activeClip || undefined}
                    >
                      {c.replace(/#0$/, '')}
                    </li>
                  ))}
                </ol>
              )}
            </>
          ) : (
            <p className="alab-empty">Play a line to see its caption and clips here.</p>
          )}
          <ul className="alab-log" aria-label="Recent audio events">
            {log.map((l, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: an append-only log
              <li key={`${i}-${l}`}>{l}</li>
            ))}
          </ul>
        </section>

        <section className="alab-card alab-music" aria-labelledby="alab-music-h">
          <h2 id="alab-music-h">Music</h2>
          <div className="alab-tracks">
            {MUSIC_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className="alab-track"
                aria-pressed={track === id}
                onClick={() => {
                  const next = track === id ? null : id;
                  setTrack(next);
                  manager?.music(next);
                }}
              >
                <span className="alab-track-icon" aria-hidden="true">
                  <MusicIcon />
                </span>
                <span className="alab-track-text">
                  <span className="alab-track-label">{MUSIC_CATALOG[id].label}</span>
                  <span className="alab-track-use">{MUSIC_CATALOG[id].use}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="alab-card alab-mixer" aria-labelledby="alab-mix-h">
          <h2 id="alab-mix-h">Mixer</h2>
          {(['voice', 'sfx', 'music'] as const).map((bus) => (
            <label key={bus} className="alab-slider">
              <span>{bus === 'sfx' ? 'Sound effects' : bus === 'voice' ? 'Voice' : 'Music'}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volumes[bus]}
                onChange={(e) => {
                  const v = { ...volumes, [bus]: Number(e.target.value) };
                  setVolumes(v);
                  manager?.setVolumes(v);
                }}
              />
              <output>{Math.round(volumes[bus] * 100)}%</output>
            </label>
          ))}
          <label className="alab-slider">
            <span>Voice speed</span>
            <input
              type="range"
              min={0.8}
              max={1.2}
              step={0.05}
              value={voiceRate}
              onChange={(e) => {
                setVoiceRate(Number(e.target.value));
                manager?.configure({ voiceRate: Number(e.target.value) });
              }}
            />
            <output>{voiceRate.toFixed(2)}×</output>
          </label>
          <label className="alab-toggle">
            <input
              type="checkbox"
              checked={musicOn}
              onChange={(e) => {
                setMusicOn(e.target.checked);
                manager?.configure({ musicEnabled: e.target.checked });
              }}
            />
            <span>Music on (family setting)</span>
          </label>
        </section>
      </div>
    </div>
  );
}

function describe(e: AudioEvent): string {
  switch (e.type) {
    case 'state':
      return `Audio ${e.state}`;
    case 'line-start':
      return `Line ${e.lineId} starts (${e.via === 'clips' ? `${e.clips.length} clips` : 'Web Speech'})`;
    case 'clip-start':
      return `Line ${e.lineId}: clip ${e.index + 1}`;
    case 'line-end':
      return `Line ${e.lineId} ${e.reason === 'done' ? 'finished' : 'cancelled'}`;
  }
}
