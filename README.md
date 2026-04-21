# 백준 추모 페이지

故 백준님을 기리는 추모 페이지. Next.js 16 App Router 기반으로 재구축 중.

## 기술 스택

- Next.js 16 (App Router, Turbopack, standalone output)
- React 19
- TypeScript (strict)
- Tailwind CSS v4 (`@tailwindcss/postcss`)
- ESLint 9 (flat config) + Prettier 3

## 로컬 개발

```bash
# 1. 의존성 설치
npm install

# 2. 환경 변수 설정
cp .env.example .env
# DATABASE_URL, ALLOWED_ORIGINS 채워 넣기

# 3. 개발 서버 (기본 3000, PORT로 변경 가능)
npm run dev

# 타입 체크 / 린트 / 포맷
npm run typecheck
npm run lint
npm run format
```

## 프로덕션 빌드

```bash
npm run build
PORT=4100 npm run start
```

- 빌드 결과물은 `.next/standalone/`에 생성된다 (`output: 'standalone'`).
- Docker 등 컨테이너 배포 시 `.next/standalone/` 디렉터리 + `public/`, `.next/static/`만 복사해 `node server.js`로 기동.

## 디렉터리 구조

```
/
├─ app/              # App Router entrypoints (layout, page, api)
├─ components/       # UI 컴포넌트 (후속 이슈)
├─ lib/              # DB, realtime, security 유틸 (후속 이슈)
├─ stores/           # 클라이언트 상태 (후속 이슈)
├─ messages/         # i18n 번역 키 (후속 이슈)
├─ public/           # 정적 자산
├─ next.config.ts
├─ tsconfig.json
├─ eslint.config.mjs
├─ postcss.config.mjs
└─ .env.example
```

## 마이그레이션 메모

- 기존 `server.js` (Express 5) + `public/index.html` (2531줄) 는 후속 이슈에서 App Router + Route Handler + Client Component 로 순차 이전된다.
- `pg`, `socket.io`, `three` 의존성은 후속 이슈에서 `app/api/*` 및 Client Component 로 연결된다.
