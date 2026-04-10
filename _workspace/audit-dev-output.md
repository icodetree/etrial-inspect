# audit-dev 구현 완료 보고

## 1. 생성/수정된 파일 목록

### 신규 생성
- `src/lib/seo-analyzer.ts` - Playwright 기반 11개 카테고리 SEO 분석 엔진

### 전체 교체
- `src/types/seo.ts` - SOYOYU JSON 구조 기반 타입 (11개 카테고리)
- `src/services/SEOAuditService.ts` - analyzePage() 래퍼로 단순화
- `src/services/__tests__/SEOAuditService.test.ts` - 새 구조 기반 테스트
- `src/services/__tests__/SEOAuditService_Phase3.test.ts` - GEO 카테고리 테스트
- `src/features/seo/SEOResultDisplay.tsx` - 새 구조 기반 UI
- `src/features/seo/components/SEODetailView.tsx` - 카테고리별 SEO 상세 뷰
- `src/features/seo/components/AIDetailView.tsx` - GEO/AI 상세 뷰
- `src/features/seo/hooks/useAIPrompt.ts` - 새 구조 기반 프롬프트 생성

### 수정
- `src/services/AuditExecutor.ts` - SEO/AI 감사 호출부 교체 (라인 213-254)
- `src/lib/accessibility-auditor.ts` - getBrowser() 메서드 추가
- `src/lib/excel-generator.ts` - 3개 SEO 시트 메서드 새 구조 적용
- `src/services/notion/NotionService.ts` - overallScore 참조를 score로 변경

### 삭제
- `src/features/seo/components/SEOSection.tsx`
- `src/features/seo/components/AISection.tsx`
- `src/features/seo/components/AIToolSection.tsx`

## 2. SEOAnalysisResult 타입 최종 구조

```
SEOAnalysisResult {
  score, url, title?, timestamp, executionTime?,
  categories: {
    meta:          SEOCategory<MetaData>
    heading:       SEOCategory<HeadingData>
    image:         SEOCategory<ImageData>
    link:          SEOCategory<LinkData>
    social:        SEOCategory<SocialData>
    content:       SEOCategory<ContentData>
    semantic:      SEOCategory<SemanticData>
    accessibility: SEOCategory<A11yData>
    schema:        SEOCategory<SchemaData>
    technical:     SEOCategory<TechnicalData>
    geo:           SEOCategory<GeoData>
  }
}

SEOCategory<T> { name, score, issues[], passed[], data: T, executionTime? }
SEOIssue { severity, message, details, suggestion }
SEOPassed { message, details }
```

## 3. analyzePage() 시그니처

```typescript
export async function analyzePage(browser: Browser, url: string): Promise<SEOAnalysisResult>
```

## 4. AuditExecutor.ts 수정 내용

- 라인 4: `SEOAnalysisResult` import 추가
- 라인 7-8: `getBrowserLaunchOptions`, `chromium` import 추가
- 라인 213-240: SEO/AI Audit 섹션 전체 교체
  - 기존: `seoAuditService.analyzeSitemap/analyzeMetadata/analyzeLlmsTxt` 개별 호출
  - 변경: `seoAuditService.runFullAudit(browser, url)` 단일 호출
  - auditor.getBrowser() 재사용, 없으면 새 브라우저 생성

## 5. TypeScript 빌드 에러

SEO 관련 에러 **0건**. 기존 `browser-utils.test.ts`의 pre-existing 에러 6건만 존재 (본 작업과 무관).

## 6. ui-dev 알림 사항

- **타입 경로**: `@/types/seo` (변경 없음)
- **하위 호환**: `SEOAuditResult = SEOAnalysisResult` alias 유지
- **주요 변경**: `result.overallScore.total` -> `result.score`, `result.sitemap/llmsTxt/metadata` -> `result.categories.{카테고리}.data`
- **종합 점수**: `result.score` (11개 카테고리 평균)
- **카테고리 점수**: `result.categories.meta.score`, `result.categories.geo.score` 등
- **이슈 목록**: `result.categories.meta.issues[]` (severity: critical/warning/info)
- **통과 항목**: `result.categories.meta.passed[]`
- **GEO 데이터**: `result.categories.geo.data.llmsTxt`, `result.categories.geo.data.robotsAiCrawlers`

---

## 7. NotionService getAuditResult JSON 재조립 버그 수정 (2026-04-09)

### 수정 파일
- `src/services/notion/NotionService.ts` - getAuditResult 메서드 정리
- `src/services/notion/NotionService.test.ts` - 테스트 케이스 6개 추가

### Before/After (NotionService.ts)

**Before**: 중복된 JSDoc, 불필요한 디버그 로깅(`console.log(Object.keys(this.notion))`)이 포함되어 있었음. 로직 자체는 모든 JSON Code Block을 수집하는 구조였으나, 명확한 주석이 없어 유지보수 시 오해 소지 있었음.

**After**: 중복 JSDoc 제거, 디버그 로깅 제거, saveAuditResult와의 대응 관계를 JSDoc에 명시. `rich_text.map()` 콜백에 `(t: any)` 타입 주석 추가.

### 추가 테스트 케이스
1. `should assemble JSON from code blocks split across paginated responses` - 3페이지에 걸쳐 분할된 JSON Code Block 재조립
2. `should handle code blocks with multiple rich_text items (2000-char chunking)` - 단일 Code Block 내 2000자 rich_text 청킹 대응
3. `should ignore non-JSON code blocks interspersed between JSON blocks` - JavaScript Code Block이 중간에 섞인 경우 무시
4. `should return null when no JSON code blocks exist` - JSON Code Block 없는 페이지 처리
5. `should return null when JSON is malformed even after reassembly` - 불완전 JSON 에러 핸들링
6. getAuditHistory 테스트 수정 - `databases.query` mock -> `request()` mock (실제 구현과 일치하도록)

### 테스트 실행 결과
```
PASS src/services/notion/NotionService.test.ts
  NotionService
    saveAuditResult (Chunking)
      ✓ should split blocks into chunks if they exceed 100
      ✓ should split large JSON content into multiple rich_text objects
      ✓ should split into multiple code blocks if rich_text items exceed 100
    getAuditResult (Pagination)
      ✓ should paginate until JSON block is found
      ✓ should assemble JSON from multiple code blocks
      ✓ should assemble JSON from code blocks split across paginated responses
      ✓ should handle code blocks with multiple rich_text items (2000-char chunking)
      ✓ should ignore non-JSON code blocks interspersed between JSON blocks
      ✓ should return null when no JSON code blocks exist
      ✓ should return null when JSON is malformed even after reassembly
    getAuditHistory
      ✓ should query database with Deleted=false filter and sort by Date
    softDeletePage
      ✓ should update page property Deleted to true

Tests: 12 passed, 12 total
```

### QA 검증 포인트
- Notion에 대용량 감사 결과(200+ violations) 저장 후 getAuditResult로 조회 시 파싱 성공 여부
- 실제 Notion 페이지에서 여러 Code Block으로 분할된 JSON이 정상 재조립되는지 E2E 확인

---

## 8. 데드코드 삭제 + SEO 기술 분석 실제 수집 구현 (2026-04-09)

### Task A: 데드코드 삭제

**삭제 파일:**
- `src/services/AuditService.ts` - 미완성 플레이스홀더 (GitHub Actions 연동은 `src/app/api/github/dispatch/route.ts`에서 정상 구현 완료)

**제거된 import:**
- `src/app/api/audit/route.ts` 2번째 줄: `import { triggerAudit } from '@/services/AuditService';` 삭제 (실제 사용되지 않았음)

### Task B: SEO 기술 분석 실제 수집 구현

**변경 파일:**
- `src/types/seo.ts` - TechnicalData에 `httpHeaders?: { compression, cacheControl }` 필드 추가
- `src/lib/seo-analyzer.ts` - analyzeTechnical, analyzePage 수정

**Before (analyzeTechnical):**
- LCP: 항상 null (수집 로직 없음)
- CLS: 항상 null (수집 로직 없음)
- HTTP 헤더: page.evaluate 내부에서 접근 불가하여 미수집

**After (analyzeTechnical):**
- LCP: `performance.getEntriesByType('largest-contentful-paint')` 로 수집
- CLS: `performance.getEntriesByType('layout-shift')` 로 합산 수집
- FID: null 유지 (실제 사용자 인터랙션 필요, 주석 명시)
- HTTP 헤더: analyzePage에서 `page.on('response')` 로 수집, responseHeaders 파라미터로 전달
- 압축(GZIP/Brotli): 감지 시 passed, 미감지 시 info 이슈
- Cache-Control: 설정됨 passed, 미설정 시 info 이슈
- LCP > 2500ms 시 warning, CLS > 0.1 시 warning 추가

**시그니처 변경:**
- `analyzeTechnical(page: Page)` -> `analyzeTechnical(page: Page, responseHeaders?: Map<string, string>)`

### 빌드 결과
```
✓ Compiled successfully
✓ Generating static pages (12/12)
TypeScript 에러 0건
```

### QA 검증 포인트
- 실제 URL 감사 시 `categories.technical.data.coreWebVitals.lcp` 값이 null이 아닌 숫자로 반환되는지 확인
- `categories.technical.data.httpHeaders.compression` 에 gzip/br 등이 채워지는지 확인
- LCP/CLS가 빈 배열인 페이지(SPA 등)에서 null로 안전하게 처리되는지 확인

---

## 9. AuditExecutor 크롤링 제한 사용자 설정 지원 (2026-04-09)

### 변경 파일
- `src/types/index.ts` - AuditConfig에 `maxPages?: number`, `maxDepth?: number` 옵션 필드 추가
- `src/services/AuditExecutor.ts` - WebCrawler 생성 시 `config.maxPages`, `config.maxDepth` 우선 사용 (nullish coalescing으로 환경별 기본값 fallback)

### 동작
- 사용자가 값을 입력하면 해당 값 사용
- 미입력(undefined) 시 기존 환경별 기본값 유지 (Vercel: maxDepth=2/maxPages=5, 로컬: maxDepth=10/maxPages=1000)
- CONCURRENCY_LIMIT(5)은 고정값 유지

### 빌드 결과
- `npm run build` 성공, TypeScript 에러 0건

### ui-dev 알림
- `AuditConfig` 타입에 `maxPages?: number`, `maxDepth?: number` 필드 추가됨
- AuditConfigForm에서 해당 필드를 폼으로 노출하면 사용자 설정 가능

---

## 10. GEO 분석(analyzeGeo) 고도화 - llms.txt 참조 기반 (2026-04-09)

### 변경 파일
- `src/types/seo.ts` - GeoData.contentQuality에 4개 필드 추가
- `src/lib/seo-analyzer.ts` - analyzeGeo 품질 평가/점수/이슈 개선, generateDefaultLlmsTxt 템플릿 개선
- `src/lib/excel-generator.ts` - GEO 시트에 새 항목 추가
- `src/features/seo/components/AIDetailView.tsx` - UI에 새 항목 표시
- `src/services/__tests__/SEOAuditService_Phase3.test.ts` - 테스트 데이터에 새 필드 추가

### GeoData.contentQuality 타입 변경 (ui-dev 알림)
```typescript
contentQuality: {
  hasSummary: boolean;
  hasKeywords: boolean;
  hasContactInfo: boolean;     // 신규: 이메일/전화번호 존재 여부
  hasUrlDeclarations: boolean; // 신규: URL 선언 존재 여부
  hasSocialLinks: boolean;     // 신규: 소셜 미디어 링크 존재 여부
  sectionCount: number;        // 신규: H2 섹션 수
  readabilityScore: number;
  structureScore: number;
}
```

### 점수 체계 변경 (기존 -> 신규)
- llms.txt 존재: 40점 -> 30점
- 구조 점수: structureScore>=30이면 20점 -> structureScore>=50이면 20점, >=30이면 10점
- 섹션 수: 없음 -> sectionCount>=3이면 10점
- 요약: 10점 -> 5점
- 연락처: 없음 -> 5점
- URL 선언: 없음 -> 5점
- 소셜 링크: 없음 -> 5점
- 키워드: 10점 -> 0점 (다른 항목으로 재배분)
- 크롤러 허용: 각 5점 x 4 = 20점 (유지)
- 합계 최대 100점

### generateDefaultLlmsTxt 개선
- 기존: 단순 3섹션 템플릿
- 변경: 실제 llms.txt 참조 구조 반영 (회사 개요, 웹사이트 구조, 주요 서비스, 포트폴리오, 연락처/소셜, 문의 안내)

### 빌드 결과
- `npm run build` 성공, TypeScript 에러 0건

### QA 검증 포인트
- llms.txt가 있는 사이트 감사 시 hasContactInfo/hasUrlDeclarations/hasSocialLinks/sectionCount 정상 판별
- llms.txt가 없는 사이트 감사 시 suggestedContent가 새 템플릿 구조로 생성되는지 확인
- 점수 체계가 100점 만점으로 정상 동작하는지 확인
- AIDetailView에서 새 항목(연락처, URL 선언, 소셜 링크, H2 섹션 수) 정상 표시
- Excel 보고서에 새 항목 포함 여부 확인
