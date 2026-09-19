-- First migration to alter a populated table. Order is load-bearing, and the Neon
-- HTTP driver cannot wrap these two statements in a transaction.
--
--   1. Backfill every name = '' from the email local part.
--   2. Add the CHECK, which Postgres validates against existing rows immediately.
--
-- Step 2 can only succeed after step 1: the one existing row has name = '' and
-- would be rejected. The reverse order fails permanently while that row exists.
--
-- A failure between the two is safe. Drizzle only records a migration as applied
-- once every statement succeeds, so re-running repeats step 1 — which matches
-- nothing the second time — and retries step 2.
--
-- To undo after a successful apply:
--   ALTER TABLE app_user DROP CONSTRAINT app_user_name_not_empty;
--
-- The WHERE guard deliberately skips a row whose local part is itself empty
-- rather than writing '' back. Such a row makes step 2 fail loudly instead of
-- being papered over with an invented name.

UPDATE app_user
   SET name = split_part(email, '@', 1)
 WHERE name = ''
   AND split_part(email, '@', 1) <> '';
--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_name_not_empty" CHECK ("app_user"."name" <> '');
