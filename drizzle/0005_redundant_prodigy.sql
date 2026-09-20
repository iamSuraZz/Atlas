CREATE TYPE "public"."artifact_policy" AS ENUM('OBJECTIVE_ARTIFACT_AVAILABLE', 'NO_OBJECTIVE_ARTIFACT');--> statement-breakpoint
ALTER TABLE "skill" ALTER COLUMN "hours_to_practical" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "skill" ADD COLUMN "artifact_policy" "artifact_policy" DEFAULT 'OBJECTIVE_ARTIFACT_AVAILABLE' NOT NULL;
--> statement-breakpoint
-- Hand-added: drizzle-kit does not generate triggers.
--
-- DECISIONS.md §5 requires that a user's role blend shares sum to 1.00. It was
-- specified against migration 0003, but 0003 is already applied and migrations
-- are forward-only, so it lands here instead.
--
-- Deferrable and checked per statement: a blend is edited as several rows, and
-- a constraint that fires mid-edit would reject every legal change that passes
-- through an intermediate sum.
CREATE OR REPLACE FUNCTION user_role_blend_sums_to_one() RETURNS trigger AS $$
DECLARE
  total numeric(4,2);
  subject uuid := COALESCE(NEW.user_id, OLD.user_id);
BEGIN
  SELECT COALESCE(sum(share), 0) INTO total FROM user_role_blend WHERE user_id = subject;
  -- A user with no blend at all is allowed; a partial blend is not.
  IF total <> 0 AND total <> 1.00 THEN
    RAISE EXCEPTION 'role blend for user % must sum to 1.00, got %', subject, total
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER user_role_blend_sums_to_one_trg
  AFTER INSERT OR UPDATE OR DELETE ON user_role_blend
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION user_role_blend_sums_to_one();
