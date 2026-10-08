import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  KEY_TURN_DEG,
  KEY_WALK_METERS,
  useKeyboardMovement,
} from './useKeyboardMovement';

const LISTENER = { x: 0, z: 0, facingDeg: 0 };

function press(key: string) {
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key })));
}

describe('useKeyboardMovement', () => {
  it('turns a fixed angle for each Left or Right event', () => {
    const onMove = vi.fn();
    renderHook(() => useKeyboardMovement(LISTENER, onMove));
    press('ArrowLeft');
    expect(onMove).toHaveBeenLastCalledWith({
      ...LISTENER,
      facingDeg: -KEY_TURN_DEG,
    });
    press('ArrowLeft');
    expect(onMove).toHaveBeenLastCalledWith({
      ...LISTENER,
      facingDeg: -2 * KEY_TURN_DEG,
    });
    press('ArrowRight');
    expect(onMove).toHaveBeenLastCalledWith({
      ...LISTENER,
      facingDeg: -KEY_TURN_DEG,
    });
    expect(onMove).toHaveBeenCalledTimes(3);
  });

  it('steps forward and backward along the listener facing', () => {
    const onMove = vi.fn();
    renderHook(() => useKeyboardMovement(LISTENER, onMove));
    press('ArrowUp');
    expect(onMove).toHaveBeenLastCalledWith({
      ...LISTENER,
      z: KEY_WALK_METERS,
    });
    press('ArrowDown');
    expect(onMove).toHaveBeenLastCalledWith(LISTENER);
  });

  it('does not move on unrelated keys or when disabled', () => {
    const onMove = vi.fn();
    renderHook(() => useKeyboardMovement(LISTENER, onMove, { enabled: false }));
    press('ArrowRight');
    press('a');
    expect(onMove).not.toHaveBeenCalled();
  });
});
