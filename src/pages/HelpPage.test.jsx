import { render,screen,fireEvent,cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach,expect,it } from 'vitest';
import HelpPage from './HelpPage';import NotFoundPage from './NotFoundPage';
afterEach(cleanup);
it('exposes help as keyboard-native accordions and topics without an overlay',()=>{render(<MemoryRouter><HelpPage/></MemoryRouter>);expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Ayuda');const summary=screen.getByText('¿Cómo se calculan los puntos?');expect(summary.tagName).toBe('SUMMARY');fireEvent.click(summary);expect(summary.parentElement).toHaveAttribute('open');expect(screen.getByText(/bonus de victoria es actualmente cero/)).toBeInTheDocument();expect(screen.queryByRole('dialog')).toBeNull();});
it('offers a base-independent hash-router recovery route',()=>{render(<MemoryRouter><NotFoundPage/></MemoryRouter>);expect(screen.getByRole('heading',{level:1})).toHaveTextContent('No encontramos');expect(screen.getByRole('link',{name:'Volver al inicio'})).toHaveAttribute('href','/');expect(screen.getByRole('img')).toHaveAccessibleName('Escudo de Gazalbide CB');});
