// Vitest global setup — runs before every test file.
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Auto-cleanup rendered React trees between tests.
afterEach(() => {
  cleanup();
});

// Mock Next.js's `fetch` polyfill so component code that uses the
// global `fetch` works in jsdom (jsdom doesn't ship one).
if (typeof globalThis.fetch === 'undefined') {
  // @ts-expect-error — test-only stub
  globalThis.fetch = vi.fn();
}