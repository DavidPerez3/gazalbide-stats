import { afterEach,expect,it,vi } from 'vitest';
import { createLivingRound,queueLivingPlayback } from './livingEngine';
afterEach(()=>vi.useRealTimers());
it('plays each action in order, resolves once and allows reset/unmount to cancel all actions',()=>{
 vi.useFakeTimers();const timers=[],frames=[],finish=vi.fn(),round=createLivingRound({scenario:'medium',seed:0,bet:3});
 queueLivingPlayback({round,timers,startDelay:100,onFrame:f=>frames.push(f),onFinish:finish});
 vi.advanceTimersByTime(100);expect(frames[0].kind).toBe('transform');expect(finish).not.toHaveBeenCalled();
 vi.runAllTimers();expect(frames.filter(f=>f.playing)).toHaveLength(round.events.length);expect(finish).toHaveBeenCalledTimes(1);expect(frames.at(-1).playing).toBe(false);
 const cancelled=vi.fn(),ids=[];queueLivingPlayback({round,timers:ids,onFrame:cancelled,onFinish:cancelled});ids.forEach(clearTimeout);vi.runAllTimers();expect(cancelled).not.toHaveBeenCalled();
});
it('reduced motion goes straight to the final state with the same winnings',()=>{
 vi.useFakeTimers();const frames=[],finish=vi.fn(),round=createLivingRound({scenario:'high',seed:0,bet:3});
 queueLivingPlayback({round,timers:[],reducedMotion:true,onFrame:f=>frames.push(f),onFinish:finish});vi.runAllTimers();
 expect(frames).toHaveLength(1);expect(frames[0].collected).toBe(12);expect(frames[0].playing).toBe(false);expect(finish).toHaveBeenCalledTimes(1);
});

it('finishes a stationary round once without inventing animation frames',()=>{
 vi.useFakeTimers();const finish=vi.fn(),frame=vi.fn();
 queueLivingPlayback({round:{events:[],amountWon:0},timers:[],startDelay:100,onFrame:frame,onFinish:finish});
 vi.advanceTimersByTime(99);expect(finish).not.toHaveBeenCalled();
 vi.advanceTimersByTime(1);expect(frame).toHaveBeenCalledWith(null);expect(finish).toHaveBeenCalledTimes(1);
});
