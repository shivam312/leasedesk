-- activity_log is append-only (CLAUDE.md rule 7, docs/DATA_MODEL.md).
-- Members read their organization's log. Any active member may add entries,
-- but only as themselves. No update or delete policy, and a trigger refuses
-- both for every role, including the database owner.

CREATE POLICY members_read ON public.activity_log FOR SELECT TO authenticated
  USING (app.is_member(organization_id));--> statement-breakpoint
CREATE POLICY members_insert_as_self ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (app.is_member(organization_id) AND actor_user_id = auth.uid());--> statement-breakpoint

CREATE FUNCTION app.refuse_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows can''t be changed or deleted', TG_TABLE_NAME;
END;
$$;--> statement-breakpoint

CREATE TRIGGER activity_log_append_only
  BEFORE UPDATE OR DELETE ON public.activity_log
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change();--> statement-breakpoint
CREATE TRIGGER activity_log_no_truncate
  BEFORE TRUNCATE ON public.activity_log
  FOR EACH STATEMENT EXECUTE FUNCTION app.refuse_change();
