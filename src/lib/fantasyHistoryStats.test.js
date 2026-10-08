import { it,expect } from 'vitest';
import { summarizeFantasyHistory,fantasyRankingPositions } from './fantasyHistoryStats.js';
it('excludes unavailable scores and preserves negative totals',()=>{const result=summarizeFantasyHistory([{scoreAvailable:true,totalPoints:-10,gameweekDate:'2026-01-01'},{scoreAvailable:true,totalPoints:20,gameweekDate:'2026-01-02'},{scoreAvailable:false,totalPoints:0}]);expect(result.games).toBe(2);expect(result.pending).toBe(1);expect(result.average).toBe(5);expect(result.worst).toBe(-10);});
it('uses shared competition ranks for ties',()=>{expect(fantasyRankingPositions([{totalPoints:100},{totalPoints:100},{totalPoints:80},{totalPoints:80},{totalPoints:70}])).toEqual([1,1,3,3,5]);});
it('has an explicit empty summary',()=>{expect(summarizeFantasyHistory([]).best).toBeNull();expect(fantasyRankingPositions([])).toEqual([]);});
