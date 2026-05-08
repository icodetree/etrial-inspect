# 영업용 제안서 PDF 자동 생성 기능 계획

> 상태: 보류 (SEO/AI 탭 완성 후 진행)
> 위치: 각 리포트 페이지 상단 버튼 또는 탭 (진단 이후 태스크)

## 배경

진단 결과를 기반으로 기업에게 접근성 개선 컨설팅/프로젝트를 제안하는 영업용 PDF 제안서를 자동 생성. 참조 양식: `롯데잇츠_웹_앱_정보웹접근성 인증획득제안_251229.pptx`

## 제안서 위치

- `/report/[id]` 페이지 상단 버튼 or 탭으로 배치
- 진단 완료 후 활성화되는 "후속 태스크" 형태
- 기존 [Excel] [Notion 저장] [보고서 보기] 흐름의 연장선

## 구현 방식

**서버사이드 Puppeteer → PDF** (기존 `puppeteer-core` + `@sparticuz/chromium` 재사용, 추가 패키지 없음)

## 제안서 구성 (6페이지 A4)

| 페이지 | 내용 | 데이터 소스 |
|--------|------|------------|
| 1 | 표지 (회사명, URL, 진단일) | 입력값 + AuditResult |
| 2 | 진단 결과 요약 (준수율, 심각도 분포, 원칙별 분포) | summary.byImpact / byPrinciple |
| 3 | 주요 위반 TOP 10 + 개선 포인트 | violations 상위 항목 |
| 4 | 경쟁사 접근성 현황 비교 | 고정 템플릿 |
| 5 | 개선 로드맵 & 예상 일정 (3개월) | 고정 템플릿 |
| 6 | 이트라이브 수행 강점 & 레퍼런스 | 고정 템플릿 |

## 추가/수정 파일

| 파일 | 역할 |
|------|------|
| `src/lib/proposal-generator.ts` (신규) | AuditResult → 제안서 HTML 생성 |
| `src/app/api/proposal/route.ts` (신규) | POST: Puppeteer PDF 변환, Buffer 반환 |
| `src/components/ProposalModal.tsx` (신규) | 회사명/담당자 입력 모달 |
| `src/app/report/[id]/page.tsx` (수정) | 상단에 "제안서 생성" 버튼/탭 추가 |

## API

```
POST /api/proposal
Body: { result: AuditResult, clientName: string, contactPerson?: string }
→ PDF (application/pdf)
파일명: [clientName]-accessibility-proposal-YYYY-MM-DD.pdf
```

## 참고
- 준수율 = 위반 0개인 페이지 / totalPages × 100
- 기존 `/api/export` 패턴 및 `getBrowser()` 유틸 재사용
- `CostReportModal.tsx` 패턴으로 모달 구현
