/** One fixed navigation step per arrow-key event, separate from dragging. */
import { useEffect, useRef } from 'react';
import {
  stepListener,
  type MovementInput,
} from '@sudobility/music_spatial_core';
import type { UnpluggedListener } from '@sudobility/music_types';

export const KEY_TURN_DEG = 15;
export const KEY_WALK_METERS = 0.5;

const KEY_TO_AXIS: Record<string, MovementInput> = {
  ArrowUp: { forward: 1, strafe: 0, turn: 0 },
  ArrowDown: { forward: -1, strafe: 0, turn: 0 },
  ArrowLeft: { forward: 0, strafe: 0, turn: -1 },
  ArrowRight: { forward: 0, strafe: 0, turn: 1 },
};
const KEY_STEP_SPEED = {
  metersPerSecond: KEY_WALK_METERS,
  degreesPerSecond: KEY_TURN_DEG,
};

export interface UseKeyboardMovementOptions {
  readonly enabled?: boolean;
}

export function listenerForArrowKey(
  listener: UnpluggedListener,
  key: string
): UnpluggedListener {
  const input = KEY_TO_AXIS[key];
  return input ? stepListener(listener, input, 1, KEY_STEP_SPEED) : listener;
}

export function useKeyboardMovement(
  listener: UnpluggedListener,
  onMove: (next: UnpluggedListener) => void,
  options?: UseKeyboardMovementOptions
): void {
  const listenerRef = useRef(listener);
  listenerRef.current = listener;
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => {
    if (options?.enabled === false) return;
    function onKeyDown(event: KeyboardEvent) {
      const next = listenerForArrowKey(listenerRef.current, event.key);
      if (next === listenerRef.current) return;
      event.preventDefault();
      listenerRef.current = next;
      onMoveRef.current(next);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [options?.enabled]);
}
