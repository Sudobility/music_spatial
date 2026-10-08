/**
 * The 2D instrument icon, for the map overlay's markers. This package can't
 * reach into `music_app`'s own `InstrumentIcon` component — it's a
 * standalone library — so it draws `music_types`' `trackInstrumentIcon` art
 * itself. `IconShape.d` is already valid SVG path syntax (the subset
 * `parseIconPath` parses is exactly SVG's own M/L/C/Q/Z), so an SVG
 * `<path>` element renders it directly with no conversion step. A vocal
 * track is the exception: the stage draws it as a singer
 * (`performerForTrack`), so the map marks it with that singer's silhouette.
 */
import {
  trackInstrumentIcon,
  ICON_VIEWBOX,
  ICON_STROKE_WIDTH,
} from '@sudobility/music_types';
import type { Track } from '@sudobility/music_types';
import { performerForTrack } from '@sudobility/music_spatial_core';

export interface InstrumentGlyphProps {
  readonly track: Pick<Track, 'clef' | 'midiProgram'>;
  readonly className?: string;
  readonly size?: number;
}

export function InstrumentGlyph({
  track,
  className,
  size = 20,
}: InstrumentGlyphProps) {
  // A vocal track stands on the stage as a singer, and is marked as one.
  const art = performerForTrack(track)?.icon ?? trackInstrumentIcon(track);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={ICON_STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {art.shapes.map((shape, i) =>
        shape.kind === 'path' ? (
          <path key={i} d={shape.d} />
        ) : (
          <circle key={i} cx={shape.cx} cy={shape.cy} r={shape.r} />
        )
      )}
    </svg>
  );
}
