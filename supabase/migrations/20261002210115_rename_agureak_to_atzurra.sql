-- The 2026-10-03 friendly changed opponent after markets and bets existed.
-- Keep every accepted line/price intact; only correct the opponent identity.

update public.gameweeks
set opponent = 'Atzurra',
    match_id = '2026-10-03-vs-atzurra',
    stats_file = '2026-10-03-vs-atzurra.json'
where match_id = '2026-10-03-vs-agureak'
  and opponent = 'Agureak';

update public.gazalbet_markets gm
set selections = (
  select jsonb_agg(
    case
      when selection->>'key' = 'opponent' then
        jsonb_set(selection, '{label}', to_jsonb(replace(selection->>'label', 'Agureak', 'Atzurra')))
      else selection
    end
    order by ordinality
  )
  from jsonb_array_elements(gm.selections) with ordinality as item(selection, ordinality)
)
where gm.gameweek_id = (
  select id from public.gameweeks
  where match_id = '2026-10-03-vs-atzurra'
  limit 1
)
and exists (
  select 1 from jsonb_array_elements(gm.selections) selection
  where selection->>'label' like '%Agureak%'
);

update public.gazalbet_ticket_legs l
set label = replace(l.label, 'Agureak', 'Atzurra')
from public.gazalbet_tickets t
where t.id = l.ticket_id
  and t.gameweek_id = (
    select id from public.gameweeks
    where match_id = '2026-10-03-vs-atzurra'
    limit 1
  )
  and l.label like '%Agureak%';

update public.gazalbet_bets b
set selection_label = replace(b.selection_label, 'Agureak', 'Atzurra')
where b.gameweek_id = (
  select id from public.gameweeks
  where match_id = '2026-10-03-vs-atzurra'
  limit 1
)
and b.selection_label like '%Agureak%';
