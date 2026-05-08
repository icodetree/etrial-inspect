# PLAN: Audit History List & Soft Delete

> **목표**: 메인 페이지 하단에 Notion에 저장된 리포트 이력(History)을 리스트 형태로 보여주고, '삭제' 버튼을 통해 Notion 데이터베이스의 `Deleted` 속성을 체크하여 목록에서 숨기는 기능(Soft Delete)을 구현합니다.

## 아키텍처 (Architecture)

### 1. Database Schema (Notion)
- **속성 추가**: `Deleted` (Checkbox)
- **역할**: 삭제 여부를 마킹. `Checked` 상태면 리스트 조회 시 API에서 필터링하여 제외함.

### 2. Backend (NotionService)
- **`getAuditHistory()`**:
    - Notion Database Query 실행.
    - Filter: `{ property: 'Deleted', checkbox: { equals: false } }`.
    - Select: `Page URL`, `Date`, `Score`, `Violations`, `Report Link`.
    - Sort: Date (Descending).
- **`softDeletePage(pageId)`**:
    - `pages.update` 호출.
    - Properties: `{ 'Deleted': { checkbox: true } }`.

### 3. API Routes
- `GET /api/history/list`: `NotionService.getAuditHistory()` 호출.
- `DELETE /api/history/delete`: Body로 `{ pageId }`를 받아 `NotionService.softDeletePage()` 호출.

### 4. Frontend
- **`components/HistoryList.tsx`**:
    - 리스트 UI (Table or Cards).
    - 각 항목에 '리포트 보기' (링크) 및 '삭제' 버튼.
    - 삭제 클릭 시 API 호출 후 Optimistic Update (즉시 UI에서 제거).
- **`app/page.tsx`**:
    - `<AuditTerminal>` 하단에 `<HistoryList>` 배치.
    - 저장 완료 시 리스트 Refresh 트리거 연동.

---

## 단계별 실행 계획 (Phased Execution)

### Phase 1: Service Logic with TDD
- [ ] **Test**: `NotionService.test.ts`에 `getAuditHistory` 및 `softDeletePage` 테스트 추가.
    - Mocking: `databases.query` (필터링 검증), `pages.update`.
- [ ] **Implement**: `NotionService.ts`에 메서드 구현.
- [ ] **Verification**: `npm test` 통과.

### Phase 2: API & Frontend Implementation
- [ ] **API**: `/api/history/list` 및 `/api/history/delete` 생성.
- [ ] **UI**: `HistoryList` 컴포넌트 생성 및 스타일링 (`.agent` 규칙 준수).
- [ ] **Integration**: Main Page(`page.tsx`)에 배치 및 연동.

### Phase 3: Validation & User Manual
- [ ] **Validation**: 로컬 테스트 (리스트 출력 확인, 삭제 동작 확인).
- [ ] **Manual**: 사용자에게 Notion DB에 `Deleted` 컬럼 추가 안내 메시지 작성.
