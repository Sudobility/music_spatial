/**
 * The 3D wireframe stage: `@react-three/fiber`'s DOM `<Canvas>`, composed
 * almost entirely from `music_spatial_core`'s `buildScene` — this
 * component's own job is close to a plain `.map()` over
 * `scene.instruments` into `<lineSegments>` plus one camera assignment, per
 * the spec's design.
 *
 * The stage itself is drawn here rather than in core, being purely visual:
 * a dark background, a floor grid for depth cues, the default half-circle
 * ring so the layout reads even when nothing is playing, and fog so the
 * far side of the stage recedes. Wireframes of a single thin colour on an
 * empty background all looked alike; on a floor, at a distance you can
 * judge, they don't.
 */
import { Canvas } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import { useMemo } from 'react';
import { buildScene, UNPLUGGED_RADIUS } from '@sudobility/music_spatial_core';
import type { Score } from '@sudobility/music_types';

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

export function SpatialCanvas({
  score,
  soundingTrackIds,
  background = DEFAULT_BACKGROUND,
  className,
}: SpatialCanvasProps) {
  // Recomputed on every score/sounding-state change. Geometry is cached
  // per model inside core, so this is a few object allocations per track,
  // not a rebuild of every segment.
  const scene = useMemo(
    () => buildScene(score, soundingTrackIds),
    [score, soundingTrackIds]
  );
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
      <PerspectiveCamera
        makeDefault
        position={[...scene.camera.position]}
        rotation={[...scene.camera.rotation]}
        fov={70}
        near={0.05}
        far={100}
      />
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
      {scene.instruments.map(instrument => (
        <group
          key={instrument.trackId}
          position={[...instrument.position]}
          rotation={[...instrument.rotation]}
          scale={instrument.scale}
        >
          {/* "Lights up" is the colour change alone. A `pointLight` used
              to be mounted per sounding instrument too, which did nothing
              visible — `LineBasicMaterial` is unlit, and every line on this
              stage is one — while adding and removing scene lights on every
              note-on and note-off. */}
          {instrument.geometry.map((geometry, i) => (
            <lineSegments key={i} geometry={geometry}>
              <lineBasicMaterial
                color={instrument.lit ? instrument.litColor : instrument.color}
              />
            </lineSegments>
          ))}
        </group>
      ))}
    </Canvas>
  );
}
