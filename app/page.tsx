export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-24">
      <section className="max-w-xl space-y-6 text-center">
        <p className="text-sm tracking-[0.3em] text-[color:var(--color-text-muted)] uppercase">
          Next.js 16 scaffold
        </p>
        <h1 className="text-4xl font-bold sm:text-5xl">백준 추모 페이지</h1>
        <p className="text-base leading-relaxed text-[color:var(--color-text-secondary)]">
          Next.js 16 App Router + TypeScript strict + Tailwind v4 기반으로 재구축 중입니다. 후속
          이슈에서 DB, 실시간 댓글, 3D 씬, 보안 정책이 이 스캐폴드 위에 얹혀집니다.
        </p>
      </section>
    </main>
  )
}
