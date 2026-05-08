# PLAN: Fix JSON Reassembly in `getAuditResult`

> **목표**: Notion에서 여러 개의 Code Block으로 나뉘어 저장된 JSON 데이터를 올바르게 순서대로 합쳐서 파싱하도록 `getAuditResult` 메서드를 수정합니다.

## 문제 분석 (Root Cause Analysis)
- **현상**: `SyntaxError: Unterminated string in JSON`.
- **원인**: `saveAuditResult`는 2000자/100아이템 제한을 피하기 위해 JSON을 여러 Code Block으로 나누어 저장함. 그러나 `getAuditResult`는 현재 루프를 돌다가 **첫 번째 JSON Code Block만 찾으면 즉시 루프를 중단(`break`)하고 파싱**하려고 시도하는 것으로 추정됨. 이로 인해 뒷부분이 잘린 불완전한 JSON 문자열이 되어 파싱 에러 발생.

## 수정 계획 (Action Plan)

### Phase 1: 재현 테스트 (Reproduction with TDD)
- [ ] `NotionService.test.ts`에 `getAuditResult` 테스트 케이스 추가.
- [ ] 여러 개의 Code Block에 나뉘어 담긴 JSON 데이터를 Mocking하여 조회 시도.
- [ ] 현재 로직에서 파싱 에러가 발생하는지 확인 (RED).

### Phase 2: 로직 수정 (Implementation)
- [ ] `getAuditResult` 메서드 수정:
    - JSON Code Block을 발견해도 즉시 멈추지 않고, **연속된** JSON Code Block들을 모두 수집하거나, 페이지 내의 모든 JSON Code Block을 순서대로 수집하여 합침.
    - 수집된 문자열을 합친 후 `JSON.parse` 실행.

### Phase 3: 검증 (Verification)
- [ ] 수정된 로직으로 단위 테스트 통과 (GREEN).
- [ ] 사용자에게 재확인 요청.
