/**
 * Next.js 16 instrumentation hook.
 *
 * register() 는 Node / Edge 두 런타임에서 호출될 수 있으므로, 프로세스 레벨 API
 * (setInterval / process.on / pg.Pool) 를 쓰는 본체 구현은 `instrumentation-node.ts`
 * 로 분리하고 이 파일은 런타임 디스패처 역할만 한다.
 *
 * [교차검증 필요] Next.js 16 instrumentation API:
 *   https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const mod = await import('./instrumentation-node')
    await mod.registerNode()
  }
}

export function onRequestError(
  err: unknown,
  request: {
    path: string
    method: string
    headers: Record<string, string | string[] | undefined>
  },
  context: { routerKind: string; routePath: string; routeType: string },
): void {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err)
  console.error(`[request-error] ${request.method} ${request.path} (${context.routeType})`, msg)
}
