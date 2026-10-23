-- Row-level security (hand-written, D12). Members of an organization can read
-- its rows; writes are limited by role. The app also scopes every query
-- (src/lib/db/scoped.ts), so a missing policy is not the only protection.
-- Helper functions live in the private "app" schema, which the Supabase API
-- doesn't expose. They are security definer so policies on memberships don't
-- recurse.
--
-- New tables: enable RLS in the Drizzle schema, then in a custom migration call
--   select app.apply_org_policies('table_name', '{owner,accounts}', '{owner}');
-- (write roles, delete roles; pass '{}' for no deletes at all).

CREATE SCHEMA IF NOT EXISTS app;--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO authenticated;--> statement-breakpoint

CREATE FUNCTION app.is_member(org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.organization_id = org
      AND m.user_id = auth.uid()
      AND m.status = 'active'
  );
$$;--> statement-breakpoint

CREATE FUNCTION app.has_role(org uuid, roles public.membership_role[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.organization_id = org
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.role = ANY (roles)
  );
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION app.is_member(uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION app.has_role(uuid, public.membership_role[]) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.is_member(uuid) TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.has_role(uuid, public.membership_role[]) TO authenticated;--> statement-breakpoint

-- Standard policies for a table with an organization_id column.
CREATE FUNCTION app.apply_org_policies(
  tbl text,
  write_roles public.membership_role[],
  delete_roles public.membership_role[]
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format(
    'CREATE POLICY members_read ON public.%I FOR SELECT TO authenticated USING (app.is_member(organization_id))',
    tbl);
  IF cardinality(write_roles) > 0 THEN
    EXECUTE format(
      'CREATE POLICY roles_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (app.has_role(organization_id, %L))',
      tbl, write_roles);
    EXECUTE format(
      'CREATE POLICY roles_update ON public.%I FOR UPDATE TO authenticated USING (app.has_role(organization_id, %L)) WITH CHECK (app.has_role(organization_id, %L))',
      tbl, write_roles, write_roles);
  END IF;
  IF cardinality(delete_roles) > 0 THEN
    EXECUTE format(
      'CREATE POLICY roles_delete ON public.%I FOR DELETE TO authenticated USING (app.has_role(organization_id, %L))',
      tbl, delete_roles);
  END IF;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app.apply_org_policies(text, public.membership_role[], public.membership_role[]) FROM PUBLIC;--> statement-breakpoint

-- organizations: keyed by id. New organizations are created at sign-up by
-- trusted server code, so there is no insert policy; never deleted.
CREATE POLICY members_read ON public.organizations FOR SELECT TO authenticated
  USING (app.is_member(id));--> statement-breakpoint
CREATE POLICY owner_update ON public.organizations FOR UPDATE TO authenticated
  USING (app.has_role(id, '{owner}')) WITH CHECK (app.has_role(id, '{owner}'));--> statement-breakpoint

-- memberships: members see their colleagues, and anyone sees their own rows.
-- Only owners invite or change roles; people are removed by status, not deleted.
CREATE POLICY members_read ON public.memberships FOR SELECT TO authenticated
  USING (app.is_member(organization_id) OR user_id = auth.uid());--> statement-breakpoint
CREATE POLICY owner_insert ON public.memberships FOR INSERT TO authenticated
  WITH CHECK (app.has_role(organization_id, '{owner}'));--> statement-breakpoint
CREATE POLICY owner_update ON public.memberships FOR UPDATE TO authenticated
  USING (app.has_role(organization_id, '{owner}'))
  WITH CHECK (app.has_role(organization_id, '{owner}'));--> statement-breakpoint

-- Roles per docs/PRODUCT_PLAN.md: owners manage settings and billing entities;
-- property managers manage buildings, units and tenants; accounts also edit
-- tenants (GSTIN, TDS). Only owners delete.
SELECT app.apply_org_policies('billing_entities', '{owner}', '{owner}');--> statement-breakpoint
SELECT app.apply_org_policies('buildings', '{owner,property_manager}', '{owner}');--> statement-breakpoint
SELECT app.apply_org_policies('floors', '{owner,property_manager}', '{owner}');--> statement-breakpoint
SELECT app.apply_org_policies('units', '{owner,property_manager}', '{owner}');--> statement-breakpoint
SELECT app.apply_org_policies('tenants', '{owner,accounts,property_manager}', '{owner}');--> statement-breakpoint
SELECT app.apply_org_policies('tenant_contacts', '{owner,accounts,property_manager}', '{owner}');
