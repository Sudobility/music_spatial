/**
 * The 3D wireframe stage: `@react-three/fiber`'s DOM `<Canvas>`, composed
 * almost entirely from `music_spatial_core`'s `buildInstruments`/`cameraFor`
 * (through `useSpatialScene`) — this component's own job is close to a
 * plain `.map()` over the instruments into `<lineSegments>` plus one camera
 * assignment, per the spec's design.
 *
 * The stage itself is drawn here rather than in core, being purely visual:
 * a dark background, a floor grid for depth cues, the default half-circle
 * ring so the layout reads even when nothing is playing, and fog so the
 * far side of the stage recedes. Wireframes of a single thin colour on an
 * empty background all looked alike; on a floor, at a distance you can
 * judge, they don't.
 *
 * ## Draw calls
 *
 * One `<lineSegments>` and one `<lineBasicMaterial>` per TRACK. It was one
 * per stroke: measured on a four-track band, ~645 objects and materials for
 * 6,850 vertices, most of them a single two-vertex segment. Every stroke of
 * an instrument is the same colour, so core now merges a model into one
 * geometry and this draws it in one call — four for the band, plus the grid
 * and the ring.
 */
import { Canvas, useThree } from '@react-three/fiber';
import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import type { PerspectiveCamera } from 'three';
import { UNPLUGGED_RADIUS } from '@sudobility/music_spatial_core';
import type {
  SpatialCamera,
  SpatialInstrument,
} from '@sudobility/music_spatial_core';
import type { Score } from '@sudobility/music_types';
import { useSpatialScene } from './useSpatialScene';

export interface SpatialCanvasProps {
  readonly score: Pick<Score, 'tracks' | 'unplugged'>;
  readonly soundingTrackIds: ReadonlySet<string>;
  /** Stage background colour. Default: a dark blue-grey. */
  readonly background?: string;
  readonly className?: string;
}

const DEFAULT_BACKGROUND = '#12161d';
const GRID_MAJOR = '#3a4452';
const GRID_MINOR = '#232a34';
const STAGE_RING = '#4c5a6b';

/** The listener's eye: vertical field of view and clip planes. Constants,
 *  so the only input to the projection matrix that can change is the
 *  canvas size — which is what `StageCamera` watches. */
const FOV_DEG = 70;
const NEAR_PLANE = 0.05;
const FAR_PLANE = 100;

/** The half-circle the instruments start on, drawn on the floor. */
function stageRing(): Float32Array {
  const segments = 48;
  const pts: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a0 = (Math.PI * i) / segments;
    const a1 = (Math.PI * (i + 1)) / segments;
    // Arrangement +x is mirrored into three.js -x (see core's scene.ts);
    // the ring is symmetric, so either sign draws the same half-circle.
    pts.push(
      Math.cos(a0) * UNPLUGGED_RADIUS,
      0.005,
      Math.sin(a0) * UNPLUGGED_RADIUS
    );
    pts.push(
      Math.cos(a1) * UNPLUGGED_RADIUS,
      0.005,
      Math.sin(a1) * UNPLUGGED_RADIUS
    );
  }
  return new Float32Array(pts);
}

/**
 * The listener's camera, as fiber's intrinsic `<perspectiveCamera>` made
 * the default. This replaced drei's `PerspectiveCamera`, of which
 * `makeDefault` was the only part in use: that component also allocated a
 * 256x256 half-float render target, subscribed a `useFrame`, and recomputed
 * the projection matrix on every render, none of it for anything here.
 *
 * Position and rotation are props on the element, so a change to them is a
 * prop diff fiber applies and — under `frameloop="demand"` — invalidates
 * for, the same path every other element on the stage takes.
 */
function StageCamera({ camera }: { readonly camera: SpatialCamera }) {
  const ref = useRef<PerspectiveCamera>(null);
  const get = useThree(state => state.get);
  const set = useThree(state => state.set);
  const size = useThree(state => state.size);

  // Become the default camera for the life of this element, handing the
  // previous one back on unmount (drei's `makeDefault` contract).
  useLayoutEffect(() => {
    const cam = ref.current;
    if (!cam) return;
    const previous = get().camera;
    set({ camera: cam });
    return () => set({ camera: previous });
  }, [get, set]);

  // The projection: aspect from the canvas, on mount and whenever the
  // canvas is resized. fiber does this itself for the default camera on a
  // resize, but not at the moment the default changes hands, so the first
  // frame after mount needs it from here.
  useLayoutEffect(() => {
    const cam = ref.current;
    if (!cam || size.height === 0) return;
    cam.aspect = size.width / size.height;
    cam.updateProjectionMatrix();
  }, [size]);

  return (
    <perspectiveCamera
      ref={ref}
      position={[...camera.position]}
      rotation={[...camera.rotation]}
      fov={FOV_DEG}
      near={NEAR_PLANE}
      far={FAR_PLANE}
    />
  );
}

/**
 * One `<lineSegments>` + one material per instrument. Exported unmemoised
 * for the element-count test; the canvas mounts the memoised form, so a
 * listener move — which leaves `instruments` by identity — does not
 * re-render it at all.
 *
 * "Lights up" is the colour change alone. A `pointLight` used to be
 * mounted per sounding instrument too, which did nothing visible —
 * `LineBasicMaterial` is unlit, and every line on this stage is one —
 * while adding and removing scene lights on every note-on and note-off.
 */
export function StageInstruments({
  instruments,
}: {
  readonly instruments: readonly SpatialInstrument[];
}) {
  return (
    <>
      {instruments.map(instrument => (
        <lineSegments
          key={instrument.trackId}
          geometry={instrument.geometry}
          position={[...instrument.position]}
          rotation={[...instrument.rotation]}
          scale={instrument.scale}
        >
          <lineBasicMaterial
            color={instrument.lit ? instrument.litColor : instrument.color}
          />
        </lineSegments>
      ))}
    </>
  );
}

const MemoStageInstruments = memo(StageInstruments);

export function SpatialCanvas({
  score,
  soundingTrackIds,
  background = DEFAULT_BACKGROUND,
  className,
}: SpatialCanvasProps) {
  // `instruments` is keyed on the roster, the arrangement and the lit set;
  // `camera` on the listener alone — a walking frame touches only the
  // latter. Geometry is cached per model inside core, so a lit-set change
  // is a few object allocations per track, not a rebuild of any segment.
  const { instruments, camera } = useSpatialScene(score, soundingTrackIds);
  const ring = useMemo(stageRing, []);

  return (
    // `frameloop="demand"`: a frame is drawn when something changed — every
    // React commit into the canvas invalidates it, and everything that moves
    // here (the listener, the lit set, a dragged instrument) arrives as
    // props — not sixty times a second regardless. The default `always`
    // loop rendered an unchanged stage on every frame, and that work sat on
    // the main thread ahead of the piano keyboard's lit-keys ticker, which
    // is how the keys came to light visibly after the notes sounded whenever
    // this view was open. Wander and keyboard walking still animate: each
    // step commits a new listener, and each commit draws a frame.
    <Canvas className={className} style={{ background }} frameloop="demand">
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[background, 8, 30]} />
      <StageCamera camera={camera} />
      <ambientLight intensity={0.35} />
      <hemisphereLight intensity={0.2} />
      <gridHelper
        args={[40, 40, GRID_MAJOR, GRID_MINOR]}
        position={[0, 0, 0]}
      />
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[ring, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={STAGE_RING} />
      </lineSegments>
      <MemoStageInstruments instruments={instruments} />
    </Canvas>
  );
}
