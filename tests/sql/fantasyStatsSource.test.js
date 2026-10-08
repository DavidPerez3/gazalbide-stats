// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
import fs from 'node:fs';
it('repairs stale references and sets the official source on future publications', async () => {
  const db = new PGlite();
  await db.exec(`create table matches(id text primary key,opponent text,publication_version integer); create table gameweeks(id integer,match_id text,opponent text,stats_file text);
    insert into matches values ('live','Atzurra',1),('old','Atzurra Sugoiak',0),('next','Atzurra',0);
    insert into gameweeks values (1,'live','Atzurra','missing.json'),(2,'old','Atzurra Sugoiak','old.json'),(3,'next','Atzurra','next.json');`);
  await db.exec(fs.readFileSync('supabase/migrations/20261008071021_fantasy_published_source_and_atzurrak_name.sql','utf8'));
  expect((await db.query('select stats_file from gameweeks order by id')).rows.map(r=>r.stats_file)).toEqual(['live:live','old.json','next.json']);
  await db.exec("update matches set publication_version=1 where id='next'; update gameweeks set match_id='next' where id=3;");
  expect((await db.query('select stats_file from gameweeks where id=3')).rows[0].stats_file).toBe('live:next');
  expect((await db.query('select distinct opponent from matches')).rows).toEqual([{ opponent: 'Atzurrak Sugoiak' }]);
  await db.close();
});
