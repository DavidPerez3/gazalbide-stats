# Chain prizes (v7)

One shared pickup counter per spin, across all four salamanders. Cumulative extras at 5 / 10 / 15 pickups: +0.5 / +1.5 / +3 times the bet, paid once at each threshold. Floor upgrades and scatter multipliers apply only to base pickups; they never multiply the extras. Every free spin starts a fresh chain. Bonus floor progress still persists across free spins.

At bet 1 without multipliers, 11 pickups pay 3.10 and 15 pay 6.50. Versioned playback stores the resolved total and separate chain count/extra amounts. Historical spins and balances are not recalculated. The public RPC, ownership checks, locks and ledger settlement remain unchanged; the private resolver supplies the new total.

## Reproducible balance check

Run `node scripts/simulate_le_gazal_salamanders.mjs 50000` (seed 1729). Paid spins and every resulting free spin/retrigger are resolved by the same JS engine covered by SQL parity tests.

| Metric | Observed |
| --- | ---: |
| Paid spins | 50,000 |
| Free spins | 3,690 |
| Total payout at bet 1 | 44,585.90 |
| Observed return | 89.1718% |
| Paid pickup payout | 20,680.30 |
| Paid chain extras | 16,172.00 |
| Free pickup payout | 6,485.60 |
| Free chain extras | 1,248.00 |
| Scatter activations (including retriggers) | 352 |
| Retriggers | 38 |
| 3 / 4 / 5+ shield activations | 320 / 30 / 2 |
| Longest free-spin sequence | 60 |
| Largest single-spin payout | 26.50 |

This is a deterministic finite sample, not a guaranteed or exact theoretical return. Rare 5-shield bonuses have little representation. A maximum-size board has 36 unoccupied cells with shield probability .014 each. The binomial model gives about .1475 new free spins per free spin, below one; expansion cannot create an escalating average free-spin population. PRNG output is deterministic and this analytical independence model is an approximation. Shield probability, free-spin awards (10/15/20) and multipliers (2/3/5) are unchanged.

The admin demo includes a reproducible 15-pickup chain fixture. Public fun mode and Fantasy never force that fixture. Check the progress counter, the three brief celebrations, the final payout and reduced-motion playback.
