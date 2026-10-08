import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import ShotAccuracy from './ShotAccuracy.jsx';
afterEach(() => cleanup());
it('shows makes, attempts and percentage together', () => {
  render(<ShotAccuracy made={5} attempted={12} />);
  expect(screen.getByText('5/12')).toBeTruthy();
  expect(screen.getByText('41,7 %')).toBeTruthy();
});
it('distinguishes no attempts from a true zero shooting percentage', () => {
  const view = render(<ShotAccuracy made={0} attempted={0} />);
  expect(screen.getByText('0/0')).toBeTruthy();
  expect(screen.getByText('—')).toBeTruthy();
  view.rerender(<ShotAccuracy made={0} attempted={3} />);
  expect(screen.getByText('0,0 %')).toBeTruthy();
});
