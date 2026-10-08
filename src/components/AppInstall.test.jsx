import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AppInstall from './AppInstall.jsx';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function offerInstall() {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  event.prompt = vi.fn(async () => {});
  event.userChoice = Promise.resolve({ outcome: 'dismissed' });
  act(() => window.dispatchEvent(event));
  return event;
}
it('offers installation only when the browser makes it available', async () => {
  render(<AppInstall />);
  expect(screen.queryByRole('button')).toBeNull();
  const event = offerInstall();
  fireEvent.click(screen.getByRole('button', { name: 'Instalar app' }));
  expect(event.prompt).toHaveBeenCalledOnce();
  await act(async () => {});
  expect(screen.queryByRole('button')).toBeNull();
});
it('hides immediately after installation and remembers it on reopening', () => {
  const view = render(<AppInstall />);
  offerInstall();
  act(() => window.dispatchEvent(new Event('appinstalled')));
  expect(screen.queryByRole('button')).toBeNull();
  expect(localStorage.getItem('gazalbide-app-installed')).toBe('1');
  view.unmount();
  render(<AppInstall />);
  expect(screen.queryByRole('button')).toBeNull();
});
it('never shows installation inside the installed app', () => {
  window.matchMedia.mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  render(<AppInstall />);
  offerInstall();
  expect(screen.queryByRole('button')).toBeNull();
});
it('allows reinstalling when the browser supplies a new eligible prompt', () => {
  localStorage.setItem('gazalbide-app-installed', '1');
  render(<AppInstall />);
  offerInstall();
  expect(screen.getByRole('button', { name: 'Instalar app' })).toBeTruthy();
});
