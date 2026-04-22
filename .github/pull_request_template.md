## 연결 이슈

- Multica: <!-- 예: https://workspace.brian-dev.cloud/issues/T-001 -->
- ADR: <!-- 관련 ADR slug 또는 "없음" -->

## 요약

<!-- 1-2 문장: 무엇을 / 왜 -->

## 주요 변경점

- 
- 

## plan_dag 요약

<!-- pm-planner가 자동 채움 -->
- Task ID: 
- Story: 
- Priority: 
- WSJF score: 
- Area: 
- Conventional commit prefix: 
- blocked_by 해소 상태: 

## 테스트

- [ ] 단위 테스트 추가/수정
- [ ] 통합 테스트 확인
- [ ] 수동 확인 시나리오 (있으면): 

## 자동화 체크리스트

- [ ] 커밋 prefix 규칙 준수 (feat|fix|refactor|docs|test|chore|revert)
- [ ] 브랜치 네이밍 준수 (`{prefix}/{task_id}-{slug}`)
- [ ] i18n 하드코딩 없음 (사용자 노출 텍스트는 전부 키)
- [ ] 환경변수/시크릿 하드코딩 없음
- [ ] CHANGELOG 업데이트 (기능 변경 시)
- [ ] 블랙리스트 라벨 수동 검토 (db-migration/breaking-change/security-critical/infra-change/cost-impact)

## 리뷰 할당 (자동)

- [x] L6.1 lint-checker
- [x] L6.3 code-reviewer
- [ ] L6.4 domain reviewer: <!-- .multica/codeowners.yaml 기반 -->
- [x] L6.5 security-reviewer
- [ ] L6.6 arch reviewer: <!-- `arch-review` 라벨 있을 때만 -->

## 자동 머지 가능 여부

- [ ] 모든 리뷰 APPROVE
- [ ] 모든 CI 체크 녹색
- [ ] 블랙리스트 라벨 없음
- [ ] 회로 차단기 미발동

---

<sub>🤖 Multica HITL-free 파이프라인으로 생성. 문제 발생 시 `human-review-needed` 라벨 부여.</sub>
