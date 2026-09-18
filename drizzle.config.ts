import type { Config } from 'drizzle-kit'

/*
 * drizzle-kit only ever *generates* SQL here — it never applies it. Applying is
 * a separate, explicit step (`npm run db:migrate`), so no database credentials
 * belong in this file. See CLAUDE.md rule 7: migrations are forward-only,
 * reviewed as SQL, and never auto-run on boot.
 */
export default {
  dialect: 'postgresql',
  schema: './src/infra/db/schema.ts',
  out: './drizzle',
} satisfies Config
