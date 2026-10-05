import React from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { buildInstrumentGeometry } from '../music_spatial_core/src/geometry';
import {
  FEMALE_VOCALIST,
  MALE_VOCALIST,
} from '../music_spatial_core/src/voice-models';

function WireFigure({
  model,
  x,
  color,
}: {
  model: typeof MALE_VOCALIST;
  x: number;
  color: string;
}) {
  return (
    <lineSegments
      geometry={buildInstrumentGeometry(model.lineModel)}
      position={[x, 0, 0]}
      scale={[-1, 1, 1]}
    >
      <lineBasicMaterial color={color} />
    </lineSegments>
  );
}

function Preview() {
  return (
    <Canvas
      camera={{ position: [0, 0.9, 6.3], fov: 27 }}
      onCreated={({ camera }) => camera.lookAt(0, 0.9, 0)}
      style={{ width: '100vw', height: '100vh', background: '#141a24' }}
    >
      <WireFigure model={MALE_VOCALIST} x={-0.6} color="#8dcfff" />
      <WireFigure model={FEMALE_VOCALIST} x={0.6} color="#f1a5d1" />
    </Canvas>
  );
}

createRoot(document.getElementById('root')!).render(<Preview />);
