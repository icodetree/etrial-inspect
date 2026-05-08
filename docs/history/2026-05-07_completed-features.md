# 개발 완료 이력 (2026-05-07 기준)

## Phase 1: 핵심 인프라 (완료)

### Notion 통합 v2
- **계획 문서**: `docs/plans/PLAN_notion_integration_v2.md`
- **상태**: ✅ 완료
- **내용**: Static Export → Node.js 서버 모드 전환, Notion CRUD API (Save/Get/History), 100블록 청킹, 동적 라우팅 `/report/[id]`

### JSON 검색 버그 수정
- **계획 문서**: `docs/plans/PLAN_fix_json_retrieval.md`
- **상태**: ✅ 완료
- **내용**: Notion 다중 Code Block JSON 재조립 로직 수정 (`SyntaxError: Unterminated string` 해결)

### 진단 이력 리스트
- **계획 문서**: `docs/plans/PLAN_audit_history_list.md`
- **상태**: ✅ 완료
- **내용**: Notion Soft Delete (`Deleted` checkbox), `HistoryList` UI, 낙관적 업데이트

## Phase 2: UX 개선 (2026-05-07 완료)

### 크롤링 진행률 안정화
- **커밋**: `64477af`
- **내용**: `queuedUrls` Set 중복 차단 + `peakFound` high-water mark → Y값 단조증가

### 집계 버퍼 구간 텍스트 표시
- **커밋**: `e538af7`
- **내용**: 크롤링→진단→집계 전환 시 `[항목] 진행 중...` 로그 emit, `summarizing` 상태 추가

### 이미지 진단 로딩 오버레이
- **커밋**: `b266434`
- **내용**: `AltTextOverlay` 컴포넌트 (AuditOverlay CSS 공유, 레이더 애니메이션)

### 사이드바 2뎁스 메뉴
- **커밋**: `6e38215`
- **내용**: 접근성 진단/이미지 진단 각 하위에 보고서+진단 이력+체크리스트

### Notion 저장 오류 수정
- **커밋**: `9dd4234`
- **내용**: `Deleted` 속성 명시, null-safety, `formatUUID` 정규화, validation_error 안내

### 이미지 보고서 페이지네이션
- **커밋**: `0a23906`
- **내용**: 100건 제한 제거, `ReportPagination` 재사용 (20건/페이지)

## Phase 3: 이미지 진단 SSE + 알고리즘 (2026-05-07 완료)

### SSE 실시간 진행률
- **커밋**: `296b9f3`
- **내용**: `/api/alttext/crawl-scan` SSE 스트리밍 전환, SVG 원형 게이지 + 진행률 % + 경과 시간

### OCR 매칭 알고리즘 6가지 개선
- **커밋**: `06f193b`
- **내용**: 한국어 형태소 정규화, 동적 임계값, Levenshtein+가중앙상블, Tesseract PSM 튜닝, 동의어 사전, 적응형 이진화

### 통계 카드 필터링
- **커밋**: `724da70`
- **내용**: stat-card 클릭 시 판정별 필터링 토글, `aria-pressed` 접근성

## Phase 4: Claude Vision AI (2026-05-07 완료)

### Claude Vision 정밀 분석
- **커밋**: `c678120`
- **내용**: `claude-vision-analyzer.ts` 신규, 체크박스 유료 옵션, AI 판정 배지, 설정 페이지 API 키 관리

### robots.txt 차단 해결
- **커밋**: `80f5d45`
- **내용**: URL 직접 전달 → base64 직접 전달로 변경

### Claude Vision 에러 3종 수정
- **커밋**: `4019796`
- **내용**: magic bytes 미디어 타입, 5MB 리사이즈, SVG/소형 이미지 스킵, 소요 시간 표시

### Notion 413 PayloadTooLargeError 수정
- **커밋**: `927b3d6`, `f2ed0d7`
- **내용**: 원본 JSON → 메타 정보만 저장, toggle 항목 수/길이 제한

### 진단 정지 버튼
- **커밋**: `40fe601`
- **내용**: AbortController 기반 취소, cancelling/cancelled 상태

### 이미지 버퍼 캐시
- **커밋**: `a3175df`
- **내용**: OCR 다운로드 버퍼 재사용 → 2차 다운로드 완전 제거, 사이트 부하 23% 감소
