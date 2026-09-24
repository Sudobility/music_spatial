/**
 * The 2D top-down arrangement view, ported from `music_app`'s original
 * "Unplugged" tab (`src/components/inspector/UnpluggedTab.tsx`) — same
 * drag mechanics, same exact-rotation handling. Position/rotation math
 * comes from `@sudobility/music_spatial_core` (`pixelFromPoint`/
 * `stageDeltaFromPixelDelta`/`bearingFromCenter`/`useThrottledCommit`), and
 * this component takes plain props rather than reaching into `music_app`'s
 * store — it's a standalone library with no store, no i18n and no theme of
 * its own. It draws itself in translucent greys over whatever is behind it
 * and takes its text colour (`currentColor`) from the host.
 *
 * Each instrument is its glyph alone, drawn in the track's own colour (the
 * same one its wireframe has on the stage) — no disc, no letter badge: the
 * colour is the identification. The listener is a disc with a field-of-view
 * wedge that turns with it and a draggable arrow for the turn handle.
 *
 * Every drag is gated on a pointer *press*: nothing follows the pointer
 * merely for entering a marker.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from 'react';
import {
  pixelFromPoint,
  stageDeltaFromPixelDelta,
  bearingFromCenter,
  useThrottledCommit,
  UNPLUGGED_RADIUS,
  type OverlayGeometry,
  type TrackColor,
} from '@sudobility/music_spatial_core';
import type {
  Track,
  UnpluggedListener,
  UnpluggedPoint,
} from '@sudobility/music_types';
import { InstrumentGlyph } from './InstrumentGlyph';

export interface MapOverlayLabels {
  readonly stage?: string;
  readonly listener?: string;
  readonly turnHandle?: string;
  readonly reset?: string;
  readonly wander?: string;
}

const DEFAULT_LABELS: Required<MapOverlayLabels> = {
  stage: 'Stage arrangement',
  listener: 'Listener',
  turnHandle: 'Turn',
  reset: 'Reset arrangement',
  wander: 'Wander',
};

export interface MapOverlayProps {
  readonly tracks: readonly Pick<
    Track,
    'id' | 'name' | 'instrumentName' | 'clef' | 'midiProgram'
  >[];
  /** Per-track colours, keyed by id — `trackColors()` from core. */
  readonly colors: Readonly<Record<string, TrackColor>>;
  readonly listener: UnpluggedListener;
  readonly trackPositions: Readonly<Record<string, UnpluggedPoint>>;
  /** Tracks sounding right now — drawn in full colour; the rest in their grey tint. */
  readonly soundingTrackIds?: ReadonlySet<string>;
  readonly locked?: boolean;
  readonly onMoveListener: (patch: Partial<UnpluggedListener>) => void;
  readonly onMoveTrack: (trackId: string, point: UnpluggedPoint) => void;
  readonly onResetArrangement?: () => void;
  /** Random walking, when the host offers it. */
  readonly wandering?: boolean;
  readonly onWanderingChange?: (wandering: boolean) => void;
  readonly labels?: MapOverlayLabels;
  readonly className?: string;
}

/** How far past the default half-circle's own radius the visible stage
 *  extends, and the max distance a drag can reach. */
const STAGE_EXTENT = UNPLUGGED_RADIUS * 1.6;
const HANDLE_DISTANCE = UNPLUGGED_RADIUS * 0.34;
const TRACK_TARGET = 36;
const LISTENER_TARGET = 34;
const KEY_MOVE_STEP = UNPLUGGED_RADIUS * 0.1;
const KEY_TURN_STEP = 10;

const SURFACE = 'rgba(127, 127, 127, 0.18)';
const EDGE = 'rgba(127, 127, 127, 0.4)';

/**
 * A rounded icon button for the row under the map. Line icons on a 24-unit
 * box, drawn in the host's text colour; a pressed toggle fills with that
 * colour and inverts its icon by blending, since this package has no
 * second theme colour to invert into.
 */
function IconButton({
  label,
  pressed,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const on = pressed === true;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      style={{
        color: 'inherit',
        background: on ? 'currentColor' : SURFACE,
        border: `1px solid ${on ? 'currentColor' : EDGE}`,
        borderRadius: 8,
        width: 34,
        height: 30,
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <svg
        aria-hidden="true"
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke={on ? 'white' : 'currentColor'}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ mixBlendMode: on ? 'difference' : undefined }}
      >
        {children}
      </svg>
    </button>
  );
}

function geometryFor(canvasSize: number): OverlayGeometry {
  return {
    centerX: canvasSize / 2,
    centerY: canvasSize / 2,
    radiusPx: canvasSize / 2,
    radiusUnits: STAGE_EXTENT,
  };
}

/** One pointer-drag gesture, active only between a press and its release. */
function usePointerDrag(
  onDelta: (dx: number, dy: number, final: boolean) => void,
  disabled: boolean
) {
  const last = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (disabled) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      last.current = { x: event.clientX, y: event.clientY };
      event.preventDefault();
    },
    [disabled]
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!last.current) return;
      const dx = event.clientX - last.current.x;
      const dy = event.clientY - last.current.y;
      last.current = { x: event.clientX, y: event.clientY };
      onDelta(dx, dy, false);
    },
    [onDelta]
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!last.current) return;
      event.currentTarget.releasePointerCapture(event.pointerId);
      last.current = null;
      onDelta(0, 0, true);
    },
    [onDelta]
  );

  return { onPointerDown, onPointerMove, onPointerUp };
}

/** The listener's facing, from the pointer's *current* absolute position
 *  relative to the listener's centre while pressed — never delta-based. */
function useTurnDrag(
  canvasRef: RefObject<HTMLDivElement | null>,
  geometry: OverlayGeometry,
  centerPixels: () => { x: number; y: number },
  onBearing: (facingDeg: number, final: boolean) => void,
  disabled: boolean
) {
  const active = useRef(false);

  const bearingAt = useCallback(
    (event: ReactPointerEvent<HTMLElement>): number | null => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const center = centerPixels();
      const relX = event.clientX - rect.left;
      const relY = event.clientY - rect.top;
      if (relX === center.x && relY === center.y) return null;
      return bearingFromCenter(
        { ...geometry, centerX: center.x, centerY: center.y },
        relX,
        relY
      );
    },
    [canvasRef, centerPixels, geometry]
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (disabled) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      active.current = true;
      event.preventDefault();
    },
    [disabled]
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!active.current) return;
      const facingDeg = bearingAt(event);
      if (facingDeg !== null) onBearing(facingDeg, false);
    },
    [bearingAt, onBearing]
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!active.current) return;
      active.current = false;
      event.currentTarget.releasePointerCapture(event.pointerId);
      const facingDeg = bearingAt(event);
      if (facingDeg !== null) onBearing(facingDeg, true);
    },
    [bearingAt, onBearing]
  );

  return { onPointerDown, onPointerMove, onPointerUp };
}

export function MapOverlay({
  tracks,
  colors,
  listener,
  trackPositions,
  soundingTrackIds,
  locked = false,
  onMoveListener,
  onMoveTrack,
  onResetArrangement,
  wandering = false,
  onWanderingChange,
  labels,
  className,
}: MapOverlayProps) {
  const t = { ...DEFAULT_LABELS, ...labels };
  const [canvasSize, setCanvasSize] = useState(0);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const measure = () => setCanvasSize(Math.max(1, el.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /** Arrow keys nudge the listener one step — the map's own discrete
   *  control, kept alongside the 3D view's continuous walking. Stops
   *  propagation so that, while the map has focus, the window-level walking
   *  handler does not also act on the same key. */
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (locked) return;
    const facingRad = (listener.facingDeg * Math.PI) / 180;
    const nudge = (patch: Partial<UnpluggedListener>) => {
      event.preventDefault();
      event.stopPropagation();
      onMoveListener(patch);
    };
    switch (event.key) {
      case 'ArrowUp':
        return nudge({
          x: listener.x + KEY_MOVE_STEP * Math.sin(facingRad),
          z: listener.z + KEY_MOVE_STEP * Math.cos(facingRad),
        });
      case 'ArrowDown':
        return nudge({
          x: listener.x - KEY_MOVE_STEP * Math.sin(facingRad),
          z: listener.z - KEY_MOVE_STEP * Math.cos(facingRad),
        });
      case 'ArrowLeft':
        return nudge({ facingDeg: listener.facingDeg - KEY_TURN_STEP });
      case 'ArrowRight':
        return nudge({ facingDeg: listener.facingDeg + KEY_TURN_STEP });
      default:
        return;
    }
  };

  const geometry = geometryFor(canvasSize);

  return (
    <div
      className={className}
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <div
        ref={canvasRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        style={{
          position: 'relative',
          aspectRatio: '1',
          width: '100%',
          overflow: 'hidden',
          borderRadius: 12,
          background: SURFACE,
          border: `1px solid ${EDGE}`,
        }}
        aria-label={t.stage}
      >
        {canvasSize > 0 && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: canvasSize,
              height: canvasSize,
            }}
          >
            {tracks.map(track => {
              const point = trackPositions[track.id];
              if (!point) return null;
              return (
                <TrackMarker
                  key={track.id}
                  track={track}
                  color={
                    (soundingTrackIds?.has(track.id)
                      ? colors[track.id]?.lit
                      : colors[track.id]?.base) ?? 'currentColor'
                  }
                  point={point}
                  geometry={geometry}
                  locked={locked}
                  onDrag={next => onMoveTrack(track.id, next)}
                />
              );
            })}
            <ListenerMarker
              canvasRef={canvasRef}
              listener={listener}
              geometry={geometry}
              locked={locked}
              label={t.listener}
              handleLabel={t.turnHandle}
              onMove={next => onMoveListener(next)}
              onTurn={facingDeg => onMoveListener({ facingDeg })}
            />
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {onWanderingChange && (
          <IconButton
            label={t.wander}
            pressed={wandering}
            onClick={() => onWanderingChange(!wandering)}
          >
            {/* A walking figure: head, torso, one arm out, legs striding. */}
            <circle cx="13" cy="4" r="2.2" />
            <path d="M11.5 8.5 L9 12.5 L11 15 L9.5 20" />
            <path d="M11.5 8.5 L14.5 9.5 L17 12.5" />
            <path d="M11 15 L14 17 L15.5 20.5" />
            <path d="M9 12.5 L6.5 13" />
          </IconButton>
        )}
        <span style={{ flex: 1 }} />
        {onResetArrangement && (
          <IconButton
            label={t.reset}
            disabled={locked}
            onClick={onResetArrangement}
          >
            {/* A reset arrow: three-quarter circle with an arrowhead. */}
            <path d="M18.5 12 A6.5 6.5 0 1 1 15 6.4" />
            <path d="M15 3.5 L15.2 7 L11.8 7.2" />
          </IconButton>
        )}
      </div>
    </div>
  );
}

function TrackMarker({
  track,
  color,
  point,
  geometry,
  locked,
  onDrag,
}: {
  track: Pick<Track, 'id' | 'name' | 'instrumentName' | 'clef' | 'midiProgram'>;
  color: string;
  point: UnpluggedPoint;
  geometry: OverlayGeometry;
  locked: boolean;
  onDrag: (next: UnpluggedPoint) => void;
}) {
  const pointRef = useRef(point);
  pointRef.current = point;

  const {
    value: live,
    setValue,
    commitNow,
  } = useThrottledCommit<UnpluggedPoint | null>(null, next => {
    if (next) onDrag(next);
  });

  const { onPointerDown, onPointerMove, onPointerUp } = usePointerDrag(
    (dx, dy, final) => {
      const { dx: sx, dz: sz } = stageDeltaFromPixelDelta(geometry, dx, dy);
      const base = live ?? pointRef.current;
      const next = { x: base.x + sx, z: base.z + sz };
      pointRef.current = next;
      setValue(next);
      if (final) commitNow();
    },
    locked
  );

  const pixels = pixelFromPoint(geometry, live ?? point);

  return (
    <button
      type="button"
      aria-label={track.name}
      title={`${track.name} — ${track.instrumentName}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: 'absolute',
        left: pixels.x - TRACK_TARGET / 2,
        top: pixels.y - TRACK_TARGET / 2,
        width: TRACK_TARGET,
        height: TRACK_TARGET,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        color,
        background: 'transparent',
        border: 'none',
        filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.55))',
        cursor: locked ? 'default' : 'grab',
        touchAction: 'none',
      }}
    >
      <InstrumentGlyph track={track} size={30} />
    </button>
  );
}

function ListenerMarker({
  canvasRef,
  listener,
  geometry,
  locked,
  label,
  handleLabel,
  onMove,
  onTurn,
}: {
  canvasRef: RefObject<HTMLDivElement | null>;
  listener: UnpluggedListener;
  geometry: OverlayGeometry;
  locked: boolean;
  label: string;
  handleLabel: string;
  onMove: (next: UnpluggedPoint) => void;
  onTurn: (facingDeg: number) => void;
}) {
  const listenerRef = useRef(listener);
  listenerRef.current = listener;

  const bodyCommit = useThrottledCommit<UnpluggedPoint | null>(null, next => {
    if (next) onMove(next);
  });
  const bodyDrag = usePointerDrag((dx, dy, final) => {
    const { dx: sx, dz: sz } = stageDeltaFromPixelDelta(geometry, dx, dy);
    const base = bodyCommit.value ?? {
      x: listenerRef.current.x,
      z: listenerRef.current.z,
    };
    const next = { x: base.x + sx, z: base.z + sz };
    bodyCommit.setValue(next);
    if (final) bodyCommit.commitNow();
  }, locked);

  const turnCommit = useThrottledCommit<number | null>(null, facingDeg => {
    if (facingDeg !== null) onTurn(facingDeg);
  });
  const turnCenter = useCallback(() => {
    const base = { ...listenerRef.current, ...(bodyCommit.value ?? {}) };
    return pixelFromPoint(geometry, base);
  }, [bodyCommit.value, geometry]);
  const turnDrag = useTurnDrag(
    canvasRef,
    geometry,
    turnCenter,
    (facingDeg, final) => {
      turnCommit.setValue(facingDeg);
      if (final) turnCommit.commitNow();
    },
    locked
  );

  const rendered = {
    ...listener,
    ...(bodyCommit.value ?? {}),
    facingDeg: turnCommit.value ?? listener.facingDeg,
  };
  const pixels = pixelFromPoint(geometry, rendered);
  const facingRad = (rendered.facingDeg * Math.PI) / 180;
  const handlePixels = pixelFromPoint(geometry, {
    x: rendered.x + HANDLE_DISTANCE * Math.sin(facingRad),
    z: rendered.z + HANDLE_DISTANCE * Math.cos(facingRad),
  });
  const wedge = 44;

  return (
    <>
      {/* Field of view: a 70° wedge in front of the listener, turning with
          it. SVG's rotate is clockwise-positive in screen space, the same
          sense as facingDeg (0 = up = +z), so no reconciling. */}
      <svg
        aria-hidden="true"
        width={wedge * 2}
        height={wedge * 2}
        viewBox={`${-wedge} ${-wedge} ${wedge * 2} ${wedge * 2}`}
        style={{
          position: 'absolute',
          left: pixels.x - wedge,
          top: pixels.y - wedge,
          pointerEvents: 'none',
          color: 'inherit',
        }}
      >
        <g transform={`rotate(${rendered.facingDeg})`}>
          <path
            d={`M0 0 L${(-wedge * Math.sin(Math.PI * 0.194)).toFixed(1)} ${(-wedge * Math.cos(Math.PI * 0.194)).toFixed(1)} A${wedge} ${wedge} 0 0 1 ${(wedge * Math.sin(Math.PI * 0.194)).toFixed(1)} ${(-wedge * Math.cos(Math.PI * 0.194)).toFixed(1)} Z`}
            fill="currentColor"
            opacity={0.16}
          />
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={-wedge}
            stroke="currentColor"
            strokeOpacity={0.35}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        </g>
      </svg>
      {/* The listener, seen from above: shoulders, the head on them, a
          hint of the nose so the facing reads even without the wedge.
          Turns with facingDeg like everything else on the map. */}
      <button
        type="button"
        aria-label={label}
        {...bodyDrag}
        style={{
          position: 'absolute',
          zIndex: 10,
          padding: 0,
          background: 'transparent',
          border: 'none',
          color: 'inherit',
          left: pixels.x - LISTENER_TARGET / 2,
          top: pixels.y - LISTENER_TARGET / 2,
          width: LISTENER_TARGET,
          height: LISTENER_TARGET,
          cursor: locked ? 'default' : 'grab',
          touchAction: 'none',
          filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.45))',
        }}
      >
        <svg
          aria-hidden="true"
          width={LISTENER_TARGET}
          height={LISTENER_TARGET}
          viewBox="-17 -17 34 34"
          style={{ transform: `rotate(${rendered.facingDeg}deg)` }}
        >
          <ellipse
            cx={0}
            cy={1}
            rx={13}
            ry={6.5}
            fill="currentColor"
            stroke="rgba(255, 255, 255, 0.85)"
            strokeWidth={0.75}
          />
          <circle
            cx={0}
            cy={-1}
            r={6}
            fill="currentColor"
            stroke="rgba(255, 255, 255, 0.85)"
            strokeWidth={0.75}
          />
          <path
            d="M-2.2 -6.2 L0 -9.2 L2.2 -6.2"
            fill="currentColor"
            stroke="rgba(255, 255, 255, 0.85)"
            strokeWidth={0.6}
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        aria-label={handleLabel}
        {...turnDrag}
        style={{
          position: 'absolute',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          background: 'transparent',
          border: 'none',
          color: 'inherit',
          left: handlePixels.x - 12,
          top: handlePixels.y - 12,
          width: 24,
          height: 24,
          cursor: locked ? 'default' : 'grab',
          touchAction: 'none',
        }}
      >
        <svg
          aria-hidden="true"
          width={20}
          height={20}
          viewBox="-10 -10 20 20"
          style={{ transform: `rotate(${rendered.facingDeg}deg)` }}
        >
          <path
            d="M0 -8 L7 6 L0 3 L-7 6 Z"
            fill="currentColor"
            stroke="rgba(255, 255, 255, 0.85)"
            strokeWidth={0.9}
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </>
  );
}
