import { act, renderHook } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useStageDrag } from './useStageDrag';

const LISTENER = { x: 2, z: -1, facingDeg: 20 };

function pointer(clientX: number, clientY: number, pointerId = 1) {
  const target = {
    getBoundingClientRect: () => ({ left: 100, width: 800, height: 600 }),
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  };
  return {
    button: 0,
    pointerId,
    clientX,
    clientY,
    currentTarget: target,
    preventDefault: vi.fn(),
  } as unknown as ReactPointerEvent<HTMLDivElement>;
}

describe('useStageDrag', () => {
  it('previews the pointer immediately, ignores vertical travel, and commits once on release', () => {
    const onMove = vi.fn();
    const { result } = renderHook(() => useStageDrag(LISTENER, onMove));
    act(() => result.current.onPointerDown(pointer(400, 200)));
    act(() => result.current.onPointerMove(pointer(400, 550)));
    expect(result.current.preview).toEqual(LISTENER);
    act(() => result.current.onPointerMove(pointer(600, 550)));
    const mixed = result.current.preview!;
    act(() => result.current.onPointerMove(pointer(600, 200)));
    expect(result.current.preview).toEqual(mixed);
    expect(mixed.x).toBe(LISTENER.x);
    expect(mixed.z).toBe(LISTENER.z);
    expect(mixed.facingDeg).toBeLessThan(LISTENER.facingDeg);
    // The drag is a preview: nothing reaches the store until release.
    expect(onMove).not.toHaveBeenCalled();
    act(() => result.current.onPointerUp(pointer(600, 200)));
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith(mixed);
    expect(result.current.preview).toBeNull();
  });

  it('stops on release or pointer capture loss', () => {
    const onMove = vi.fn();
    const { result } = renderHook(() => useStageDrag(LISTENER, onMove));
    act(() => result.current.onPointerDown(pointer(400, 200)));
    act(() => result.current.onPointerMove(pointer(500, 200)));
    act(() => result.current.onPointerUp(pointer(500, 200)));
    act(() => result.current.onPointerMove(pointer(700, 200)));
    expect(onMove).toHaveBeenCalledTimes(1);
    act(() => result.current.onPointerDown(pointer(400, 200)));
    act(() => result.current.onLostPointerCapture(pointer(400, 200)));
    act(() => result.current.onPointerMove(pointer(700, 200)));
    expect(onMove).toHaveBeenCalledTimes(1);
  });
});
