// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useConfirmQueue } from './useConfirmQueue';

describe('useConfirmQueue (L14)', () => {
  it('a question asked while another is open waits instead of replacing it', () => {
    const { result } = renderHook(() => useConfirmQueue());
    act(() => {
      result.current.ask({ title: 'Delete Ann?' });
      result.current.ask({ title: 'Different tree on Google Drive' });
    });
    expect(result.current.current.title).toBe('Delete Ann?');
    expect(result.current.pending).toBe(2);

    act(() => result.current.resolve('onCancel'));

    expect(result.current.current.title).toBe('Different tree on Google Drive');
  });

  it('runs the chosen handler once, after taking the question off', () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useConfirmQueue());
    act(() => {
      result.current.ask({ title: 'Clear the board?', onConfirm });
    });

    act(() => {
      result.current.resolve('onConfirm');
      result.current.resolve('onConfirm'); // a double click
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(result.current.current).toBe(null);
  });

  it('a question with no onCancel is simply dismissed', () => {
    const { result } = renderHook(() => useConfirmQueue());
    act(() => {
      result.current.ask({ title: 'Delete Ann?', onConfirm: () => {} });
    });
    act(() => result.current.resolve('onCancel'));
    expect(result.current.current).toBe(null);
  });

  it('a follow-up asked from inside an answer jumps ahead of queued questions', () => {
    const { result } = renderHook(() => useConfirmQueue());
    act(() => {
      result.current.ask({
        title: 'Also their child? (1)',
        onConfirm: () => result.current.ask({ title: 'Also their child? (2)' }),
      });
      result.current.ask({ title: 'Different tree on Google Drive' });
    });

    act(() => result.current.resolve('onConfirm'));

    expect(result.current.current.title).toBe('Also their child? (2)');
    act(() => result.current.resolve('onCancel'));
    expect(result.current.current.title).toBe('Different tree on Google Drive');
  });
});
