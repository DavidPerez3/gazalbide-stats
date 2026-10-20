import { expect, it } from 'vitest';
import { parseGazalBetStake, totalGazalBetStake } from './gazalbetStake';
it.each(['71.20','71,20'] )('accepts decimal input %s without truncating', (raw)=>expect(parseGazalBetStake(raw)).toBe(71.2));
it.each(['', '0', '-1', '0.001', '1.234', 'NaN', 'Infinity', '1e2', '1,2.3'])('rejects invalid stakes %s', raw=>expect(parseGazalBetStake(raw)).toBeNull());
it('allows cents and whole stakes and computes singles in cents',()=>{
  expect(parseGazalBetStake('0,01')).toBe(.01);
  expect(parseGazalBetStake('20')).toBe(20);
  expect(totalGazalBetStake(.1,3)).toBe(.3);
});
