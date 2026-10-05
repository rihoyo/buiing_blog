-- BUIING optimization v1. Run AFTER community-editing.sql.
-- Repeatable, transactional. No post bodies or existing password hashes are changed.
BEGIN;

-- Index the filters and stable pagination order used by the application.
CREATE INDEX IF NOT EXISTS guest_root_feed ON public.guest_entries(scope, created_at DESC, id DESC)
  WHERE parent_id IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS guest_root_blog ON public.guest_entries(blog_slug, created_at DESC, id DESC)
  WHERE scope='comment' AND parent_id IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS guest_root_thread ON public.guest_entries(thread_id, created_at DESC, id DESC)
  WHERE scope='thread' AND parent_id IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS guest_live_replies ON public.guest_entries(root_id, created_at, id)
  WHERE parent_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS entries_public_feed ON public.entries(kind, moderation_status, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS guest_budget_expiry ON private.guest_budgets(window_start);
CREATE INDEX IF NOT EXISTS activity_actor_id ON private.community_activity(actor_id, id DESC);
CREATE INDEX IF NOT EXISTS activity_actor_key ON private.community_activity(actor_key, id DESC);
CREATE INDEX IF NOT EXISTS activity_action ON private.community_activity(action, id DESC);
CREATE INDEX IF NOT EXISTS activity_target ON private.community_activity(target);
CREATE INDEX IF NOT EXISTS audit_recent ON private.audit(created_at DESC);
DO $$ BEGIN
 IF to_regclass('public.owner_posts') IS NOT NULL THEN
  EXECUTE 'CREATE INDEX IF NOT EXISTS owner_posts_recent ON public.owner_posts(owner_id, updated_at DESC)';
 END IF;
END $$;

-- Counter-only updates do not need content filtering or visibility checks.
CREATE OR REPLACE FUNCTION private.community_guest_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.author_name IS NOT DISTINCT FROM OLD.author_name AND NEW.body IS NOT DISTINCT FROM OLD.body THEN RETURN NEW; END IF;
 IF NEW.scope='thread' AND NOT private.approved_thread(NEW.thread_id) THEN RAISE EXCEPTION 'THREAD_NOT_FOUND'; END IF;
 PERFORM private.check_community_words(NEW.author_name||E'\n'||NEW.body);
 RETURN NEW;
END $$;
-- Always lock the root before a reply so concurrent root/reply deletions use one order.
CREATE OR REPLACE FUNCTION public.secure_guest_delete(p_id uuid,p_hash text,p_admin boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE root uuid;
BEGIN
 SELECT root_id INTO root FROM public.guest_entries WHERE id=p_id AND deleted_at IS NULL;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM public.guest_entries WHERE id=root FOR UPDATE;
 PERFORM 1 FROM public.guest_entries WHERE id=p_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_admin IS NOT true AND NOT EXISTS(SELECT 1 FROM private.guest_credentials WHERE entry_id=p_id AND password_hash=p_hash) THEN RETURN false; END IF;
 UPDATE public.guest_entries SET deleted_at=now() WHERE deleted_at IS NULL AND (id=p_id OR root_id=p_id);
 RETURN true;
END $$;

-- Parent counts remove the need to download hidden reply bodies for the feed.
ALTER TABLE public.guest_entries ADD COLUMN IF NOT EXISTS reply_count integer NOT NULL DEFAULT 0 CHECK(reply_count>=0);
CREATE OR REPLACE FUNCTION private.update_guest_reply_count() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE delta integer;
BEGIN
 IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN delta:=CASE WHEN NEW.deleted_at IS NULL THEN 1 ELSE 0 END;
 ELSE delta:=(CASE WHEN NEW.deleted_at IS NULL THEN 1 ELSE 0 END)-(CASE WHEN OLD.deleted_at IS NULL THEN 1 ELSE 0 END); END IF;
 IF delta<>0 THEN UPDATE public.guest_entries SET reply_count=greatest(0,reply_count+delta) WHERE id=NEW.root_id; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guest_reply_count ON public.guest_entries;
CREATE TRIGGER guest_reply_count AFTER INSERT OR UPDATE OF deleted_at ON public.guest_entries
FOR EACH ROW EXECUTE FUNCTION private.update_guest_reply_count();
UPDATE public.guest_entries root SET reply_count=(SELECT count(*) FROM public.guest_entries child WHERE child.root_id=root.id AND child.parent_id IS NOT NULL AND child.deleted_at IS NULL)
WHERE root.parent_id IS NULL AND root.reply_count IS DISTINCT FROM (SELECT count(*) FROM public.guest_entries child WHERE child.root_id=root.id AND child.parent_id IS NOT NULL AND child.deleted_at IS NULL);

-- Resolve actor keys once on insertion, rather than joining password metadata on every log read.
UPDATE private.community_activity a SET actor_key=c.actor_hash FROM private.guest_credentials c
WHERE a.actor_key IS NULL AND a.target=c.entry_id::text;
CREATE OR REPLACE FUNCTION private.link_guest_activity_actor() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE private.community_activity SET actor_key=NEW.actor_hash WHERE target=NEW.entry_id::text AND actor_key IS NULL;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS link_guest_activity_actor ON private.guest_credentials;
CREATE TRIGGER link_guest_activity_actor AFTER INSERT ON private.guest_credentials
FOR EACH ROW EXECUTE FUNCTION private.link_guest_activity_actor();

-- Daily event totals for charts: events are counted once in the same transaction.
-- Purging raw logs does NOT subtract historical daily totals.
CREATE TABLE IF NOT EXISTS private.community_daily_metrics (
 day date NOT NULL,
 action text NOT NULL,
 scope text NOT NULL,
 events bigint NOT NULL CHECK(events>=0),
 PRIMARY KEY(day,action,scope)
);
ALTER TABLE private.community_daily_metrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.community_daily_metrics FROM public,anon,authenticated;
-- Keep writes behind the migration until backfill and counting trigger are both installed.
LOCK TABLE private.community_activity IN SHARE ROW EXCLUSIVE MODE;
-- Backfill once; rerunning must not erase already-aggregated history.
CREATE TABLE IF NOT EXISTS private.optimization_versions(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE private.optimization_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.optimization_versions FROM public,anon,authenticated;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.optimization_versions WHERE version='daily-metrics-v1') THEN
  INSERT INTO private.community_daily_metrics(day,action,scope,events)
  SELECT (created_at AT TIME ZONE 'Asia/Seoul')::date,action,coalesce(scope,''),count(*) FROM private.community_activity GROUP BY 1,2,3;
  INSERT INTO private.optimization_versions VALUES('daily-metrics-v1',now());
 END IF;
END $$;
CREATE OR REPLACE FUNCTION private.count_community_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO private.community_daily_metrics(day,action,scope,events)
 VALUES((NEW.created_at AT TIME ZONE 'Asia/Seoul')::date,NEW.action,coalesce(NEW.scope,''),1)
 ON CONFLICT(day,action,scope) DO UPDATE SET events=private.community_daily_metrics.events+1;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS count_community_event ON private.community_activity;
CREATE TRIGGER count_community_event AFTER INSERT ON private.community_activity
FOR EACH ROW EXECUTE FUNCTION private.count_community_event();

-- Stats and logs are separate APIs. Paging/filtering logs never rescans post totals.
CREATE OR REPLACE FUNCTION public.admin_community_activity(p_before bigint DEFAULT NULL,p_actor text DEFAULT NULL,p_action text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid; result jsonb;
BEGIN
 IF NOT private.is_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF p_actor ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN uid:=p_actor::uuid; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id DESC),'[]'::jsonb) INTO result FROM (
  SELECT id,actor_id,actor_key AS network_key,author_name,action,target,scope,created_at
  FROM private.community_activity
  WHERE created_at>=now()-interval '90 days'
   AND (p_before IS NULL OR id<p_before)
   AND (p_actor IS NULL OR actor_id=uid OR actor_key=p_actor)
   AND (p_action IS NULL OR action=p_action)
  ORDER BY id DESC LIMIT 50
 ) a;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.admin_community_stats() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT private.is_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 SELECT jsonb_build_object('threads',e.threads,'pending',e.pending,'members',e.members,'guestbook',g.guestbook,'comments',g.comments,'recommendations',g.recommendations,'today',coalesce((SELECT sum(events) FROM private.community_daily_metrics WHERE day=(now() AT TIME ZONE 'Asia/Seoul')::date),0)) INTO result
 FROM (SELECT count(*) FILTER(WHERE kind='thread' AND deleted_at IS NULL AND moderation_status='approved') AS threads,count(*) FILTER(WHERE kind='thread' AND deleted_at IS NULL AND moderation_status='pending') AS pending,count(DISTINCT author_id) AS members FROM public.entries) e
 CROSS JOIN (SELECT count(*) FILTER(WHERE scope='guestbook') AS guestbook,count(*) FILTER(WHERE scope<>'guestbook') AS comments,coalesce(sum(likes),0) AS recommendations FROM public.guest_entries WHERE deleted_at IS NULL) g;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.admin_activity_series(p_days integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE today date:=(now() AT TIME ZONE 'Asia/Seoul')::date; result jsonb;
BEGIN
 IF NOT private.is_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF p_days IS NULL OR p_days NOT BETWEEN 1 AND 366 THEN RAISE EXCEPTION 'INVALID_CONTENT'; END IF;
 SELECT jsonb_agg(jsonb_build_object('date',d.day,'total',coalesce(a.total,0),'actions',coalesce(a.actions,'{}'::jsonb)) ORDER BY d.day) INTO result
 FROM (SELECT today-i AS day FROM generate_series(0,p_days-1) AS i) d
 LEFT JOIN (
  SELECT day,sum(events) AS total,jsonb_object_agg(action,events) AS actions FROM (
   SELECT day,action,sum(events) AS events FROM private.community_daily_metrics WHERE day BETWEEN today-p_days+1 AND today GROUP BY day,action
  ) s GROUP BY day
 ) a USING(day);
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.admin_community_dashboard(p_before bigint DEFAULT NULL,p_actor text DEFAULT NULL,p_action text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.is_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 RETURN jsonb_build_object('stats',public.admin_community_stats(),'pending',coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM (SELECT * FROM public.entries WHERE kind='thread' AND moderation_status='pending' AND deleted_at IS NULL ORDER BY created_at,id LIMIT 100)e),'[]'::jsonb),'activity',public.admin_community_activity(p_before,p_actor,p_action));
END $$;
REVOKE ALL ON FUNCTION public.admin_community_activity(bigint,text,text),public.admin_community_stats(),public.admin_activity_series(integer) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_community_activity(bigint,text,text),public.admin_community_stats(),public.admin_activity_series(integer) TO authenticated;

COMMIT;
