import { getAuth } from '@/infra/auth/server'

/*
 * Not `export const { GET, POST } = toNextJsHandler(getAuth().handler)`. That
 * form calls getAuth() while the module is being evaluated, which happens during
 * `next build` when route modules are imported to collect page data — so a build
 * machine without DATABASE_URL would fail to build. Resolving per request keeps
 * the failure where it belongs.
 */
export function GET(request: Request): Promise<Response> {
  return getAuth().handler(request)
}

export function POST(request: Request): Promise<Response> {
  return getAuth().handler(request)
}
