import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import FloatingCoupon from './FloatingCoupon.jsx';
afterEach(() => cleanup());
it('docks outside the page and restarts feedback for every added leg', () => {
 const onOpen=vi.fn();
 const view=render(<FloatingCoupon count={7} odds={100} feedbackId={1} onOpen={onOpen} />);
 const first=screen.getByRole('button');
 expect(view.container.contains(first)).toBe(false);
 expect(first.closest('.gazalbet-coupon-dock').parentElement).toBe(document.body);
 expect(first.textContent).toContain('7 selecciones');
 view.rerender(<FloatingCoupon count={8} odds={100} feedbackId={2} onOpen={onOpen} />);
 const second=screen.getByRole('button');
 expect(second).not.toBe(first);
 expect(second.classList.contains('gazalbet-slip-pulse')).toBe(true);
 fireEvent.click(second);expect(onOpen).toHaveBeenCalledOnce();
});
it('does not display an empty coupon', () => { render(<FloatingCoupon count={0} odds={1} onOpen={()=>{}} />); expect(screen.queryByRole('button')).toBeNull(); });
