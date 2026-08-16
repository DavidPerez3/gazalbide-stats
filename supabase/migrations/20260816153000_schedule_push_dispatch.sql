-- Poll due push notifications every two minutes. The dispatcher is idempotent:
-- rows are claimed with SKIP LOCKED and every event is deduplicated in outbox.
do $$
declare r record;
begin
  for r in select jobid from cron.job where jobname in ('gazalbide-push-dispatch','gazalbide-push-cleanup') loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;

select cron.schedule(
  'gazalbide-push-dispatch',
  '*/2 * * * *',
  'select public.dispatch_push_notifications();'
);

select cron.schedule(
  'gazalbide-push-cleanup',
  '17 4 * * *',
  'select public.cleanup_push_notifications();'
);
