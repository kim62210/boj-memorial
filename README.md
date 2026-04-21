# boj-memorial

백준(BOJ) 추모 페이지.

## 브랜치 구성

- `main` — 현재 운영 중인 레거시 스택 (Express + Three.js + Socket.IO + Postgres + pg)
- `feature/next-migration` — Next.js 16 App Router 기반 마이그레이션 작업 브랜치

## 기술 스택 (feature/next-migration)

- Next.js 16 (App Router, Turbopack)
- React 19
- TypeScript 5 (strict + `noUncheckedIndexedAccess`)
- Tailwind CSS v4
- ESLint 9 (flat config, `eslint-config-next`)
- pnpm 9

## 개발

```bash
pnpm install
cp .env.example .env.local   # 로컬 값 채우기
pnpm dev                     # http://localhost:3000
pnpm typecheck               # tsc 타입 검사
pnpm lint                    # eslint
pnpm check                   # lint + typecheck 한 번에
pnpm build && pnpm start     # 프로덕션 빌드/실행
```

## 경로 alias

`@/*` 는 `src/*` 로 해석된다 (`tsconfig.json` paths).

## 환경 변수

- `.env.example` 에 필요한 키를 모두 선언한다 (형식만, 실제 값 X).
- 로컬 개발 값은 `.env.local` 에 둔다 (git ignore).
- 브라우저에 노출해야 하는 값은 `NEXT_PUBLIC_` 접두어를 반드시 붙인다.

## 디렉토리 구조

```
src/
  app/              # App Router 엔트리 (layout, page, route handlers)
public/             # 정적 자산
.env.example        # 환경 변수 템플릿
```

## 마이그레이션 진행

상위 플래너 이슈 `BRI-1` 하위의 9개 서브이슈로 작업이 쪼개져 있다. 본 스캐폴딩은 `BRI-2` 의 산출물이다.
