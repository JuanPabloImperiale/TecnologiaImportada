import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useSearchInput } from './useSearchInput';

let state: ReturnType<typeof useSearchInput>;
let renderer: ReactTestRenderer;

function Probe({ initialValue = '' }: { initialValue?: string }) {
  state = useSearchInput(initialValue);
  return null;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  act(() => renderer.unmount());
  vi.useRealTimers();
});

describe('useSearchInput', () => {
  it('updates typing immediately and searches only after 1.2 seconds without changes', () => {
    act(() => { renderer = create(<Probe />); });
    act(() => state[1]('ip'));
    expect(state[0]).toBe('ip');
    expect(state[2]).toBe('');
    expect(state[3]).toBe(true);
    act(() => { vi.advanceTimersByTime(1_000); });
    act(() => state[1]('iphone'));
    act(() => { vi.advanceTimersByTime(1_199); });
    expect(state[2]).toBe('');
    act(() => { vi.advanceTimersByTime(1); });
    expect(state[2]).toBe('iphone');
    expect(state[3]).toBe(false);
  });

  it('clears immediately and cancels pending searches', () => {
    act(() => { renderer = create(<Probe initialValue="iphone" />); });
    expect(state[2]).toBe('iphone');
    act(() => state[1]('ipad'));
    act(() => { vi.advanceTimersByTime(500); });
    act(() => state[1](''));
    expect(state[0]).toBe('');
    expect(state[2]).toBe('');
    expect(state[3]).toBe(false);
    act(() => { vi.advanceTimersByTime(1_200); });
    expect(state[2]).toBe('');
  });

  it('cancels its timer when unmounted', () => {
    act(() => { renderer = create(<Probe />); });
    act(() => state[1]('cable'));
    expect(vi.getTimerCount()).toBe(1);
    act(() => renderer.unmount());
    expect(vi.getTimerCount()).toBe(0);
  });
});