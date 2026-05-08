# PLAN: Notion 통합 및 영구 리포트 링크 기능 재구축 (v2)

> **목표**: Notion 데이터베이스에 진단 결과를 저장하고, 고유 ID 기반의 영구 링크(`.../report/[id]`)를 제공하는 시스템을 **안정적**으로 구축합니다. API Route와 Static Export 간의 충돌 문제를 근본적으로 해결하기 위해 빌드 설정을 표준 Next.js 모드로 전환합니다.

## 아키텍처 결정 사항 (Architecture Decisions)

1.  **빌드 모드 변경 (`output: 'export'` 제거)**:
    -   **근거**: 현재 프로젝트는 `src/app/api/...` 경로의 **API Route**를 사용하여 Notion과 통신하고 있습니다. `output: 'export'` (Static Export) 모드에서는 API Route가 작동하지 않거나 빌드 시점에 제거됩니다. 이로 인해 404 오류 및 빌드 실패가 반복되었습니다.
    -   **결정**: `next.config.ts`에서 `output: 'export'`를 제거하고, 표준 Node.js 서버(또는 람다) 기반 동작으로 전환하여 API 및 Dynamic Route 기능을 온전히 지원합니다.

2.  **동적 라우팅 복원 (`/report/[id]`)**:
    -   **근거**: Query Parameter(`?id=...`) 방식은 임시방편입니다. Clean URL을 위해 Next.js의 Dynamic Routing 기능을 사용하여 `/report/123...` 형태를 지원합니다.

3.  **데이터 무결성 강화 (Notion Service)**:
    -   **근거**: Notion 블록 제한(100개) 문제를 해결하기 위해 Chunking 로직을 TDD로 검증하여 구현합니다.

---

## 단계별 실행 계획 (Phased Execution)

**중요 지침**: 각 단계를 완료한 후:
1. ✅ 완료된 태스크 체크박스 체크
2. 🧪 모든 품질 게이트 검증 명령 실행
3. ⚠️ 모든 품질 게이트 항목 통과 여부 확인
4. 📅 "최종 업데이트" 날짜 갱신
5. 📝 Notes 섹션에 학습 내용 기록
6. ➡️ 그 후에만 다음 단계로 진행

⛔ 품질 게이트를 건너뛰거나 체크가 실패한 상태로 진행하지 마세요.

### Phase 1: 환경 구성 및 기본 설정 (Environment & Config)
**목표**: API Route가 작동하도록 Next.js 빌드 설정을 정상화합니다.

- [ ] `next.config.ts`: `output: 'export'` 설정 제거 및 관련 이미지 최적화 설정 복구
- [ ] `package.json`: 불필요한 스크립트 정리
- [ ] `src/app/api/health/route.ts` 생성 (API 동작 확인용)
- [ ] 품질 게이트:
    - [ ] `npm run build` 성공 (Static 관련 에러 없음)
    - [ ] `npm run dev` 실행 후 `/api/health` 호출 성공 확인

### Phase 2: 핵심 로직 검증 (Service Logic with TDD)
**목표**: `NotionService`의 저장 및 조회 로직을 단위 테스트로 완벽하게 검증합니다.

- [ ] **Test Setup**: `jest` 설정 확인 및 `NotionService.test.ts` 생성
- [ ] **RED**: 대용량 진단 결과(블록 150개 이상) 저장 시나리오 테스트 작성 (실패 확인)
- [ ] **GREEN**: `NotionService`의 Chunking 로직 및 JSON 파싱 로직 정교화 (테스트 통과)
- [ ] **REFACTOR**: 코드 중복 제거 및 타입 안정성 확보
- [ ] 품질 게이트:
    - [ ] 모든 단위 테스트 통과
    - [ ] Mock 데이터를 사용한 저장/조회 시뮬레이션 성공

### Phase 3: API 및 페이지 구현 (Implementation)
**목표**: 검증된 로직을 바탕으로 웹 UI 및 API를 연결합니다.

- [ ] **API Route**: `/api/history/save` 및 `/api/history/get` 재정비 (표준 Response 포맷 준수)
- [ ] **Page**: `/report/[id]/page.tsx` 동적 라우트 페이지 복원 및 구현
- [ ] **UI**: `ReportViewer` 컴포넌트 로딩/에러 상태 처리 강화
- [ ] 품질 게이트:
    - [ ] 로컬 환경에서 저장 후 생성된 링크로 접속 성공
    - [ ] 새로고침 시 404 없이 데이터 로드 확인

---

## 위험 평가 (Risk Assessment)

| 위험 요소 | 확률 | 영향 | 완화 전략 |
|---|---|---|---|
| **Notion API 속도 이슈** | 중간 | 중간 | 로딩 UI(Spinner/Skeleton) 제공, 타임아웃 처리 |
| **블록 제한 재발** | 낮음 | 높음 | TDD 단계에서 200개 이상의 블록 케이스 검증 |
| **환경 변수 누락** | 낮음 | 높음 | 실행 시 환경 변수 체크 로직 추가 (`checkEnv()`) |

## 롤백 전략 (Rollback Strategy)
- 문제 발생 시 `git checkout`을 통해 `output: 'export'` 상태로 되돌리고, Notion 기능은 "클립보드 복사" 방식으로 대체 제안.
