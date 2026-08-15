-- Gazalbide Stats: atomic substitutions.
-- player_id = incoming player, related_player_id = outgoing player.

alter table public.game_events drop constraint if exists game_events_event_type_check;
alter table public.game_events add constraint game_events_event_type_check check (event_type in (
  'FT_MADE','FT_MISSED','TWO_MADE','TWO_MISSED','THREE_MADE','THREE_MISSED',
  'OREB','DREB','AST','TOV','STL','BLK','PF','PFD',
  'SUBSTITUTION','SUB_IN','SUB_OUT',
  'OPP_SCORE_1','OPP_SCORE_2','OPP_SCORE_3','OPP_TEAM_FOUL',
  'PERIOD_START','PERIOD_END','CLOCK_SET'
));

alter table public.game_events drop constraint if exists game_events_gazalbide_types_check;
alter table public.game_events add constraint game_events_gazalbide_types_check check (
  subject <> 'gazalbide' or event_type in (
    'FT_MADE','FT_MISSED','TWO_MADE','TWO_MISSED','THREE_MADE','THREE_MISSED',
    'OREB','DREB','AST','TOV','STL','BLK','PF','PFD','SUBSTITUTION','SUB_IN','SUB_OUT'
  )
);

alter table public.game_events drop constraint if exists game_events_substitution_players_check;
alter table public.game_events add constraint game_events_substitution_players_check check (
  event_type <> 'SUBSTITUTION'
  or (
    subject = 'gazalbide'
    and player_id is not null
    and related_player_id is not null
    and player_id <> related_player_id
  )
);

comment on column public.game_events.related_player_id is
  'For SUBSTITUTION events this is the outgoing Gazalbide player; player_id is the incoming player.';
