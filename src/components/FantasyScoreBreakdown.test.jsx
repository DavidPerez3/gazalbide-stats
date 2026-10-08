import { render, screen } from '@testing-library/react';
import { it, expect } from 'vitest';
import FantasyScoreBreakdown from './FantasyScoreBreakdown.jsx';
import { computeLineupBreakdown } from '../lib/fantasyScoring.js';
it('renders the actual captain formula and preserves negative PIR',()=>{
  const breakdown=computeLineupBreakdown({playersNums:[1],statsMap:new Map([[1,{name:'Jugador',pir:-10}]]),captainNumber:1,traitConfig:{playerTraitsByNumber:{}}});
  render(<FantasyScoreBreakdown breakdown={breakdown}/>);
  expect(screen.getByText('Cómo se calculan estos -20.00 puntos')).toBeInTheDocument();
  expect(screen.getByText('×2')).toBeInTheDocument();
  expect(screen.getByText('Bonus independiente por victoria')).toBeInTheDocument();
});
it('distinguishes missing data from a genuine zero score',()=>{
  render(<FantasyScoreBreakdown available={false} breakdown={{totalPoints:0}}/>);
  expect(screen.getByText(/Puntuación pendiente/)).toBeInTheDocument();
  expect(screen.queryByText(/Cómo se calculan/)).not.toBeInTheDocument();
});
