import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it } from 'vitest';
import BottomNavigation from './BottomNavigation.jsx';
import PlayerJersey from './PlayerJersey.jsx';
afterEach(() => cleanup());
it('uses Fantasy, Inicio and GazalBet in order with the current section active', () => {
 render(<MemoryRouter initialEntries={['/fantasy/historial']}><BottomNavigation /></MemoryRouter>);
 const links = screen.getAllByRole('link');
 expect(links.map(link => link.textContent)).toEqual(['Fantasy','Inicio','GazalBet']);
 expect(links.map(link => link.getAttribute('href'))).toEqual(['/fantasy','/','/porra']);
 expect(links[0].getAttribute('aria-current')).toBe('page');
 expect(links[1].getAttribute('aria-current')).toBeNull();
});
it('keeps the jersey number dynamic and preserves double zero', () => {
 const view=render(<PlayerJersey number="00" />);
 expect(screen.getByRole('img', { name: 'Camiseta, dorsal 00' }).textContent).toContain('00');
 view.rerender(<PlayerJersey number={17} />);
 expect(screen.getByRole('img', { name: 'Camiseta, dorsal 17' }).textContent).toContain('17');
});
