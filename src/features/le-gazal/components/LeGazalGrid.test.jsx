import { createSalamanderRound } from '../salamanderEngine';
import { createCollectionRound } from '../collectionEngine';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import LeGazalGrid from './LeGazalGrid';
const grid=Array.from({length:5},()=>Array(6).fill('TEN'));
const diagonal={id:'win-6',lineId:6,lineLabel:'Diagonal descendente',amountWon:3,cells:[{row:0,col:0},{row:1,col:1},{row:2,col:2}]};
const props={grid,isSpinning:false,stoppedColumns:Array(6).fill(true),winningCellKeys:['0-0','1-1','2-2'],winningCombinations:[diagonal],reduceMotion:true};
it('draws the actual diagonal through winning cell centers and labels its payment',()=>{
 const {container}=render(<LeGazalGrid {...props}/>);
 expect(container.querySelector('.le-gazal-board__lines polyline')).toHaveAttribute('points','50,50 150,150 250,250');
 expect(screen.getByText(/L6 · Diagonal descendente/)).toBeInTheDocument();
 expect(screen.getByText('+3 🍺')).toBeInTheDocument();
});
it('does not invent horizontal paylines for scattered bonus cells',()=>{
 const {container}=render(<LeGazalGrid {...props} winningCombinations={[]}/>);
 expect(container.querySelectorAll('.le-gazal-board__lines polyline')).toHaveLength(0);
});
it('offers 20 accessible pattern previews and clears a preview when the next spin starts',()=>{
 const {container,rerender}=render(<LeGazalGrid {...props}/>);
 expect(screen.getAllByRole('button',{hidden:true})).toHaveLength(20);
 const button=screen.getByLabelText('Ver línea 10: V abierta');fireEvent.click(button);
 expect(button).toHaveAttribute('aria-pressed','true');
 expect(screen.getByRole('img',{name:/Vista previa: línea 10/})).toBeInTheDocument();
 rerender(<LeGazalGrid {...props} isSpinning/>);
 expect(container.querySelectorAll('.le-gazal-board__lines polyline')).toHaveLength(0);
 rerender(<LeGazalGrid {...props}/>);
 expect(container.querySelector('.le-gazal-board__lines polyline')).toHaveAttribute('points','50,50 150,150 250,250');
});

it('uses the original raccoon and salamander inside a living board without showing paylines',()=>{
 const round={mode:'living',amountWon:3,starts:{raccoon:{row:1,col:0},salamander:{row:3,col:5}}};
 const frame={kind:'collect',actor:'raccoon',row:1,col:1,amount:3,collected:3,playing:true,positions:{raccoon:{row:1,col:1},salamander:{row:3,col:5}},grid};
 const {container}=render(<LeGazalGrid {...props} living livingRound={round} livingFrame={frame} winningCombinations={[]}/>);
 expect(container.querySelector('img[src$="Mapache.png"]')).toBeInTheDocument();
 expect(container.querySelector('img[src$="salamander-v1.webp"]')).toBeInTheDocument();
 expect(container.querySelector('img[src*="pol-"]')).toBeNull();
 expect(screen.getByRole('status')).toHaveTextContent('Mapache recoge 3 🍺');
 expect(screen.queryByText('20 líneas activas · Ver patrones')).not.toBeInTheDocument();
});

it('renders the expanded floor and its levels without character name tags, then shrinks on reset',()=>{
 const expanded=Array.from({length:5},()=>Array(8).fill('TROPHY'));
 const floor={columns:8,collections:12,levels:{'2-6':2}};
 const round={mode:'living',bonusBoard:true,amountWon:6,initialBoard:floor};
 const frame={grid:expanded,board:floor,playing:false};
 const {container,rerender}=render(<LeGazalGrid {...props} grid={expanded} livingRound={round} livingFrame={frame} winningCombinations={[]}/>);
 expect(container.querySelectorAll('[data-cell-key]')).toHaveLength(40);
 expect(container.querySelector('[data-cell-key="2-6"]')).toHaveTextContent('x3');
 expect(container.querySelectorAll('.le-gazal-living__actor span')).toHaveLength(0);
 expect(screen.getByRole('status')).toHaveTextContent('Pista al máximo');
 rerender(<LeGazalGrid {...props} livingRound={{mode:'living'}} winningCombinations={[]}/>);
 expect(container.querySelectorAll('[data-cell-key]')).toHaveLength(30);
 expect(container.querySelector('.le-gazal-tile-level')).toBeNull();
});

it('explains stationary losses and shows the four useful symbols without character tags',()=>{
 const round=createCollectionRound({forcedOutcome:'lose'});
 const {container,rerender}=render(<LeGazalGrid {...props} grid={round.grid} livingRound={round} winningCombinations={[]}/>);
 expect(screen.getByRole('status')).toHaveTextContent('Sin símbolos compatibles al lado. Sin premio.');
 expect(screen.queryByLabelText('Símbolos de cada personaje')).toBeNull();
 expect(container.querySelectorAll('.le-gazal-living__actor span')).toHaveLength(0);
 const scatter=createCollectionRound({forcedOutcome:'scatter'});
 rerender(<LeGazalGrid {...props} grid={scatter.finalGrid} livingRound={scatter} winningCombinations={[]}/>);
 expect(screen.getByRole('status')).toHaveTextContent('10 tiradas gratis x2');
 expect(screen.getByRole('status')).not.toHaveTextContent('Sin premio');
});

it('shows final bonus progress after a capped x3 pickup without previewing it before playback',()=>{
 const round=createCollectionRound({forcedOutcome:'small',inBonus:true,boardState:{columns:6,collections:1,levels:{'2-1':2}}});
 const frame={...round.events.at(-1),playing:false};
 const {rerender}=render(<LeGazalGrid {...props} grid={round.grid} isSpinning livingRound={round} winningCombinations={[]}/>);
 expect(screen.getByRole('status')).toHaveTextContent('1 recogidas');
 rerender(<LeGazalGrid {...props} grid={round.finalGrid} livingRound={round} livingFrame={frame} winningCombinations={[]}/>);
 expect(screen.getByRole('status')).toHaveTextContent('2 recogidas');
});

it('renders four color-matched salamanders and basketball symbols with no raccoon or permanent legend on the board',()=>{
 const round=createSalamanderRound({forcedOutcome:'high'});
 const {container}=render(<LeGazalGrid {...props} grid={round.grid} livingRound={round} winningCombinations={[]}/>);
 expect(container.querySelectorAll('.le-gazal-living__actor')).toHaveLength(4);
 for(const color of ['yellow','pink','blue','green'])expect(container.querySelector(`.le-gazal-living__actor--${color} img`)).toBeInTheDocument();
 expect(container.querySelector('img[src$="Mapache.png"]')).toBeNull();
 expect(container.querySelectorAll('[data-symbol-color="SHOE"]')).not.toHaveLength(0);
 expect(container.querySelectorAll('.le-gazal-living__actor span')).toHaveLength(0);
 expect(screen.queryByLabelText('Símbolos de cada personaje')).toBeNull();
});

it('never renders a symbol behind a salamander, including reel frames and restored historical boards',()=>{
 const round=createSalamanderRound({forcedOutcome:'lose'});
 const invalid=round.grid.map(row=>[...row]);
 for(const p of Object.values(round.starts))invalid[p.row][p.col]='SHOE';
 invalid[3][0]='SHOE';
 const frame={grid:invalid,positions:round.starts,playing:false};
 const {container,rerender}=render(<LeGazalGrid {...props} grid={invalid} livingRound={round} livingFrame={frame} winningCombinations={[]}/>);
 for(const p of Object.values(round.starts))expect(container.querySelector(`[data-cell-key="${p.row}-${p.col}"] [data-symbol-color]`)).toBeNull();
 expect(container.querySelector('[data-cell-key="3-0"] [data-symbol-color="SHOE"]')).toBeInTheDocument();
 rerender(<LeGazalGrid {...props} grid={invalid} living isSpinning winningCombinations={[]}/>);
 for(const p of Object.values(round.starts))expect(container.querySelector(`[data-cell-key="${p.row}-${p.col}"] [data-symbol-color]`)).toBeNull();
});

it('reveals chain progress during playback and celebrates an extra without leaking the final count',()=>{
 const round=createSalamanderRound({forcedOutcome:'chain',bet:3});
 const {container,rerender}=render(<LeGazalGrid {...props} grid={round.grid} isSpinning livingRound={round} winningCombinations={[]}/>);
 expect(screen.getByText('0/5 · próximo extra +1,5 🍺')).toBeInTheDocument();
 const event=round.events.find(e=>e.kind==='chain' && e.chainCount===10);
 rerender(<LeGazalGrid {...props} grid={event.grid} livingRound={round} livingFrame={{...event,playing:true}} winningCombinations={[]}/>);
 expect(screen.getByText('10/15 · próximo extra +9 🍺')).toBeInTheDocument();
 expect(container.querySelector('.le-gazal-living__effect--chain')).toHaveTextContent('¡CADENA 10! +4,5 🍺');
 rerender(<LeGazalGrid {...props} grid={round.finalGrid} livingRound={round} livingFrame={{...round.events.at(-1),playing:false}} winningCombinations={[]}/>);
 expect(screen.getByText('15 recogidas · todos los extras conseguidos')).toBeInTheDocument();
 expect(container.querySelector('.le-gazal-living__effect--chain')).toBeNull();
});
