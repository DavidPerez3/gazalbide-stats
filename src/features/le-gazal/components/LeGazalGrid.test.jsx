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
