# Architecture Decision Records (ADR)

프로젝트의 설계 결정을 기록한다. MADR-lite 형식.

## ADR 생성 방법

### 수동
1. `ADR-template.md` 복사
2. 파일명: `ADR-YYYY-MM-DD-<slug>.md` (slug는 kebab-case)
3. 상태는 `proposed`로 시작
4. PR로 제출 → arch reviewer 리뷰 → 채택 시 `accepted`
5. 이후 대체 시 `superseded by ADR-xxx`로 업데이트

### 자동 (pm-planner Phase 2)
non-obvious 설계 결정 감지 시 ADR 초안 자동 생성:
- 파일 경로·명명 규칙 동일
- 라벨 자동 부여: `adr-change`
- auto-merge 차단 (HITL 예외 — 사용자 승인 필수)
- L6.6 arch reviewer 필수 호출 (`.multica/codeowners.yaml` force_labels 규칙)

## 코드 변경과의 의존성

plan_dag 태스크에 ADR 의존성 지정:

```json
{
  "id": "T-010",
  "depends_on_adr": ["ADR-2026-04-22-logout"]
}
```

daemon이 `docs/adr/ADR-2026-04-22-logout.md`가 main에 merged 되었는지 확인 후 `blocked_by` 자동 관리. ADR PR merge 이벤트 → unblock.

## 상태 전이

```
proposed   → accepted   (arch reviewer + 사용자 APPROVE)
proposed   → rejected   (기각 시 문서는 유지, 기각 이유 명시)
accepted   → deprecated (더 이상 유효하지 않음, 대체 없음)
accepted   → superseded (대체 ADR 지정)
```

상태 변경은 `<!-- multica:adr-meta -->` 블록 내 `status_history` 에 엔트리 추가하는 방식.

## 목록

<!-- 새 ADR 추가 시 이 표에 한 줄 추가. pm-planner가 PR에서 자동 업데이트. -->

| Slug | 제목 | 상태 | 일자 |
|---|---|---|---|
| — | (아직 없음) | — | — |
