ALTER TABLE "memberships" ADD COLUMN "invite_token_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_invite_token_hash_index" ON "memberships" USING btree ("invite_token_hash");