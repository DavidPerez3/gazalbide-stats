import { render,screen,fireEvent,waitFor,cleanup } from '@testing-library/react';
import { describe,it,expect,vi,afterEach } from 'vitest';
import PdfReportPanel from './PdfReportPanel';
import { getMatches,getMatchStats } from '../../lib/data';
import { openReportWindow,showReport } from './pdfReport';
vi.mock('../../context/SeasonContext.jsx',()=>({useSeason:()=>({activeSeasonId:'2026-2027'})}));
vi.mock('../../lib/data.js',()=>({getMatches:vi.fn(),getMatchStats:vi.fn()}));
vi.mock('../../lib/historyRepository.js',()=>({loadHistoricalPlayerRows:vi.fn(),loadLineupHistory:vi.fn()}));
vi.mock('./pdfReport.js',async importOriginal=>({...await importOriginal(),openReportWindow:vi.fn(),showReport:vi.fn()}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
describe('Selector PDF',()=>{
 it('no carga hasta abrir; aplica liga y permite seleccionar contenido',async()=>{getMatches.mockResolvedValue([{id:'a',date:'2026-10-18',opponent:'Vedrisko',gazal_pts:44,opp_pts:42}]);getMatchStats.mockResolvedValue([{name:'Oier',pts:2}]);openReportWindow.mockReturnValue({closed:false,close:vi.fn()});render(<PdfReportPanel playerName="Oier"/>);expect(getMatches).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:/Exportar PDF/}));await screen.findByText('2026-10-18 · Vedrisko');expect(getMatches).toHaveBeenCalledWith('2026-2027',{matchType:'league'});fireEvent.click(screen.getByLabelText('Defensa, pérdidas y faltas'));fireEvent.click(screen.getByRole('button',{name:'Abrir informe PDF'}));await waitFor(()=>expect(showReport).toHaveBeenCalled());const html=showReport.mock.calls[0][1];expect(html).toContain('Oier');expect(html).not.toContain('<h2>Defensa');});
 it('impide exportar selección vacía y muestra fallos sin entregar informes parciales',async()=>{getMatches.mockResolvedValue([{id:'a',date:'2026-10-18',opponent:'Rival'}]);getMatchStats.mockRejectedValue(Error('Error cargando estadísticas'));const close=vi.fn();openReportWindow.mockReturnValue({closed:false,close});render(<PdfReportPanel matchId="a"/>);fireEvent.click(screen.getByRole('button',{name:/Exportar PDF/}));await screen.findByText('2026-10-18 · Rival');const checkbox=screen.getByLabelText('2026-10-18 · Rival');fireEvent.click(checkbox);expect(screen.getByRole('button',{name:'Abrir informe PDF'})).toBeDisabled();fireEvent.click(checkbox);fireEvent.click(screen.getByRole('button',{name:'Abrir informe PDF'}));await screen.findByRole('alert');expect(close).toHaveBeenCalled();expect(showReport).not.toHaveBeenCalled();});
});
