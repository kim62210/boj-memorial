# 프로젝트 규약 (CONVENTIONS.md)

Multica 에이전트가 이 레포에서 작업할 때 반드시 따라야 할 규약. 글로벌 `~/.claude/rules/` 보다 우선하지만, 사용자 명시 지시가 있으면 그것이 최우선.

이 파일은 daemon이 task spawn 시 task workdir CLAUDE.md에 자동 merge됨. prompt caching 대상이므로 자주 바뀌지 않도록 관리할 것.

---

## 1. 언어 스택

- Python 3.12+ (pyproject.toml 관리)
- TypeScript strict mode (tsconfig "strict": true)
- Go 1.22+ (go.mod 관리)

## 2. 프로젝트 구조

### Backend (`backend/`)

```
backend/
├── app/
│   ├── api/              # FastAPI routers
│   ├── services/         # 비즈니스 로직 (모든 비즈니스 로직은 여기만)
│   ├── schemas/          # Pydantic 모델 (request/response)
│   ├── models/           # SQLAlchemy ORM
│   └── core/             # config, security, db session
├── migrations/           # Alembic
└── tests/
```

- 비즈니스 로직은 **반드시** `services/` 안에
- `api/`의 라우터는 services 호출만, 로직 직접 X
- 신규 스키마는 `schemas/`에 Pydantic 모델로

### Frontend (`frontend/`)

- Next.js App Router
- Server Component 기본, `'use client'` 최소화
- i18n: next-intl, 모든 user-facing text는 키로

## 3. 이름 규칙

- Python: snake_case (func/var), PascalCase (class), UPPER_SNAKE (const)
- TypeScript: camelCase (func/var), PascalCase (type/interface/class)
- Files: Python/TS 각 관례, Go는 lower_snake (package) / CamelCase (file exported)

## 4. 테스트

- 신규 기능은 반드시 테스트 동반 (pyproject.toml에 pytest, Jest/Vitest 설정)
- 커버리지 목표 80%+ (변경 파일 기준)
- 테스트 파일 위치: Python `tests/`, TS `__tests__/` 또는 `*.test.ts`

## 5. API

- 모든 endpoint에 `response_model` 또는 return type annotation
- 페이지네이션: `limit`/`offset` query param
- 에러: `HTTPException`, custom error schema `{"detail": str, "code": str}`
- Versioned: `/api/v1/`

## 6. 보안

- password: bcrypt 해시 (never plain)
- CORS origins: 명시 (never `*` in production)
- 환경 변수: pydantic-settings, never hardcode
- secret: .env (gitignore), production은 systemd EnvironmentFile

## 7. Git / PR

- 브랜치: `feat/<task-id>-<slug>` 또는 `fix/<task-id>-<slug>`
- 커밋: Korean conventional (`feat(auth): ...`)
- PR body에 Multica 이슈 링크 필수
- 블랙리스트 라벨(db-migration 등) 해당 시 human-review-needed 자동 부여 예상

## 8. 의존성

- 신규 의존성 추가는 사용자 확인 후
- 취약 버전 금지
- peer dep 우선

## 9. 문서

- README.md: 설치·실행만 (커밋 이력 X)
- docs/adr/: 설계 결정 (MADR-lite)
- docstring: 한국어 가능, 비자명한 WHY만

## 10. 금지 사항

- `eval()`, `exec()`, `compile()` 사용 금지
- `# type: ignore`, `# noqa` 남발 금지
- `console.log()`, `print()` — 로거 사용
- Wildcard import (`from x import *`)
- bare `except:`

## 11. 이 레포 특수 사항

<!-- 이 섹션을 프로젝트별로 채울 것 -->

- 예: "이 프로젝트는 Postgres 15+ 전용"
- 예: "auth 관련 변경 시 session_manager.py도 함께 수정 필수"
- 예: "모든 timezone은 UTC로 저장, KST는 프론트에서 변환"
