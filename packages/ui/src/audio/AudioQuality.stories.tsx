import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { expect, within } from 'storybook/test';
import { MUSIC_IDS } from './music';
import {
  type AudioMeasurement,
  measureBuffer,
  type QualityKind,
  qualityFailures,
  renderMusicOffline,
  renderSfxOffline,
  sfxQualityKind,
} from './quality';
import { SFX_IDS } from './sfx';

/** Seconds of each music track rendered for the check. */
const MUSIC_SECONDS = 8;

interface Row {
  id: string;
  kind: QualityKind;
  m: AudioMeasurement;
  failures: string[];
}

async function runQualityChecks(): Promise<Row[]> {
  const rows: Row[] = [];
  for (const id of SFX_IDS) {
    const kind = sfxQualityKind(id);
    const m = measureBuffer(await renderSfxOffline(id));
    rows.push({ id, kind, m, failures: qualityFailures(kind, m) });
  }
  for (const id of MUSIC_IDS) {
    const m = measureBuffer(await renderMusicOffline(id, MUSIC_SECONDS));
    rows.push({ id, kind: 'music', m, failures: qualityFailures('music', m) });
  }
  return rows;
}

const cell = {
  padding: '4px 10px',
  textAlign: 'right' as const,
  fontVariantNumeric: 'tabular-nums',
};
const head = { ...cell, borderBottom: '2px solid #1b1b1b' };

/** Renders every SFX and the start of every music track offline and lists the measurements. */
function AudioQualityReport() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    runQualityChecks().then(
      (r) => live && setRows(r),
      (e: unknown) => live && setError(String(e)),
    );
    return () => {
      live = false;
    };
  }, []);

  if (error) return <p role="alert">Rendering failed: {error}</p>;
  if (!rows) return <p role="status">Rendering sounds offline…</p>;
  return (
    <table
      style={{ borderCollapse: 'collapse', color: '#1b1b1b', background: '#ffffff', fontSize: 14 }}
    >
      <caption style={{ fontWeight: 700, paddingBottom: 8 }}>Audio quality measurements</caption>
      <thead>
        <tr>
          <th scope="col" style={{ ...head, textAlign: 'left' }}>
            Sound
          </th>
          <th scope="col" style={head}>
            Limits
          </th>
          <th scope="col" style={head}>
            Peak
          </th>
          <th scope="col" style={head}>
            RMS
          </th>
          <th scope="col" style={head}>
            Energy above 6 kHz
          </th>
          <th scope="col" style={head}>
            First sample
          </th>
          <th scope="col" style={head}>
            Last 20 ms RMS
          </th>
          <th scope="col" style={head}>
            Seconds
          </th>
          <th scope="col" style={head}>
            Result
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ id, kind, m, failures }) => (
          <tr
            key={id}
            data-sound={id}
            data-kind={kind}
            data-measurement={JSON.stringify(m)}
            data-failures={failures.join('; ')}
          >
            <th scope="row" style={{ ...cell, textAlign: 'left' }}>
              {id}
            </th>
            <td style={cell}>{kind}</td>
            <td style={cell}>{m.peak.toFixed(3)}</td>
            <td style={cell}>{m.rms.toFixed(4)}</td>
            <td style={cell}>{(m.highBandRatio * 100).toFixed(2)}%</td>
            <td style={cell}>{m.startClick.toFixed(5)}</td>
            <td style={cell}>{m.endLevel.toFixed(5)}</td>
            <td style={cell}>{m.durationSec.toFixed(2)}</td>
            <td style={cell}>{failures.length === 0 ? 'pass' : failures.join('; ')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const meta = {
  title: 'Audio/Quality Checks',
  component: AudioQualityReport,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof AudioQualityReport>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Every sound effect and the first 8 s of every music track, rendered in an OfflineAudioContext in
 * real Chromium: peaks, harshness (energy above 6 kHz), start clicks and tail decay must stay within
 * QUALITY_LIMITS, and nothing may be silent.
 */
export const AllSounds: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const table = await canvas.findByRole(
      'table',
      { name: 'Audio quality measurements' },
      { timeout: 60_000 },
    );
    const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'));
    await expect(rows).toHaveLength(SFX_IDS.length + MUSIC_IDS.length);
    const report = rows.map((row) => ({
      sound: row.dataset.sound,
      kind: row.dataset.kind,
      ...(JSON.parse(row.dataset.measurement ?? '{}') as AudioMeasurement),
      failures: row.dataset.failures,
    }));
    console.info(`audio quality\n${JSON.stringify(report, null, 1)}`);
    for (const row of report) {
      await expect({ sound: row.sound, failures: row.failures }).toEqual({
        sound: row.sound,
        failures: '',
      });
    }
  },
};
