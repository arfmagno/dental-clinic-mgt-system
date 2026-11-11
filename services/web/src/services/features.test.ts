import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { isEnabled, setEnabled, useFeature } from './features';

beforeEach(() => localStorage.clear());

test('optional features are off by default, and every screen sees a switch at once', () => {
  expect(isEnabled('reports')).toBe(false);
  const { result } = renderHook(() => useFeature('reports'));
  expect(result.current).toBe(false);
  act(() => setEnabled('reports', true));
  expect(result.current).toBe(true);
  expect(isEnabled('reports')).toBe(true);
  act(() => setEnabled('reports', false));
  expect(result.current).toBe(false);
  expect(localStorage.getItem('clinic.feature.reports')).toBeNull();
});
