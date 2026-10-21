# Random positions and complete routes (v8)

Every paid/free spin chooses four distinct cells without replacement, using the same seeded PRNG after the initial grid and reserves. Occupied cells are cleared before counting shields. Actors never share or cross another actor's cell. Replay snapshots, reloads and reduced motion use the server's resolved positions, not a second random draw. Explicit QA fixtures may retain fixed positions.

Actors alternate complete visible routes before gravity changes their symbols. Route selection prioritizes pickup count, then total floor value, then up/right/down/left. Routes only visit compatible adjacent symbols, once each; empty cells and other actors cannot be crossed. JS and private SQL use the same deterministic depth-first search, with a 4096-node budget per route to bound pathological dense boards. In ordinary small components it exhaustively searches the choices; on extreme dense boards it uses the best route found within that budget.

After the route, gravity compacts every affected column through all free rows, skipping actors even in the middle of a column. Symbols can pass from above an actor to below it without ever occupying its cell. The existing finite reserve of five new symbols per column is retained to guarantee the spin terminates. A hole can remain after exhaustion; the UI now explains that condition after playback. This is different from an actor blocking the column.

## Payout calibration

The first 10,000-spin run with v7 payouts returned 167.577% after enabling random positions and longer routes. That would inflate Fantasy balances. Version 8 therefore uses:

| Award | Times bet |
| --- | ---: |
| Base pickup | 0.05 × floor multiplier × scatter multiplier |
| 5 pickups in a spin | +0.30 |
| 10 pickups in a spin | +0.90 additional |
| 15 pickups in a spin | +1.80 additional |

Extras remain cumulative, shared across actors, once per threshold and never multiplied by floor/scatter. Each free spin resets the chain. Shield probability (.014), free spins (10/15/20) and bonus multipliers (2/3/5) are unchanged. Examples at bet 1 without multipliers: 11 pickups = 1.75; 15 = 3.75. Only new spins use v8; no historical results, balances or ledger entries are rewritten.

## Reproducible simulation

`node scripts/simulate_le_gazal_salamanders.mjs 50000 1000`, seed 1729:

| Metric | Observed |
| --- | ---: |
| Paid spins | 50,000 |
| Free spins, including retriggers | 3,280 |
| Total payout, bet 1 | 44,494.60 |
| Observed return | 88.9892% |
| Paid pickup / extra payouts | 15,652 / 22,615.50 |
| Free pickup / extra payouts | 4,623.60 / 1,603.50 |
| Scatter activations / retriggers | 311 / 27 |
| 3 / 4 / 5+ shield activations | 281 / 26 / 4 |
| Longest naturally triggered free-spin sequence | 55 |
| Largest single-spin payout | 18.75 |

Separate samples of 1,000 complete bonuses each, with retriggers, averaged 19.9054 / 43.7094 / 98.2331 at bet 1 for initial 3/4/5+ shields. Largest sampled bonus totals were 135.70 / 226.80 / 493.50. These are finite samples, not guaranteed returns or maximum wins. The approximate maximum-board retrigger reproduction is .1475 new free spins per free spin.

## Review

- Start several spins: all four starting cells change, remain distinct and show no hidden icon.
- Admin demo's 15-pickup fixture: all three extras, final 3.75 at bet 1; reduced motion gives the same total.
- A long visible chain is collected before its columns fall. Actors alternate routes rather than individual cells.
- Icons fall past stationary actors; only exhausted reserves can leave unoccupied holes, explained after playback.
- Restore an active bonus: floor/expansion persists; positions come from the next spin or saved final frame.
