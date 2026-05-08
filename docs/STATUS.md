# E-able A11y 프로젝트 현황 (2026-05-08)

## 버전: v2.4.0

## 핵심 기능 상태

| 기능 | 상태 | 비고 |
|------|------|------|
| 접근성 진단 (KWCAG 2.2) | ✅ 운영 중 | axe-core + 커스텀 룰 |
| SEO 분석 | ✅ 운영 중 | @capyseo/core |
| AI 친화도 분석 | ✅ 운영 중 | @houtini/geo-analyzer |
| 이미지 진단 (OCR) | ✅ 운영 중 | Tesseract.js + 6가지 개선 |
| Claude Vision 정밀 분석 | ✅ 운영 중 | 유료 옵션, Haiku 4.5 |
| Notion 리포트 저장 | ✅ 운영 중 | 자동 저장 + 이력 관리 + 재시도 로직 |
| Excel 다운로드 | ✅ 운영 중 | 다중 시트 |
| PDF 보고서 | ✅ 운영 중 | 접근성 + 이미지 진단 |
| SSE 실시간 진행률 | ✅ 운영 중 | 접근성 + 이미지 진단 모두 |
| SPA 자동 감지 | ✅ 운영 중 | spa-readiness.ts |
| PDF 제안서 생성 | 🟠 미개발 | 착수 가능 (2~3일) |
| KWCAG 체크리스트 | 🟠 미개발 | 착수 가능 (1~2일) |
| UI 컴포넌트 테스트 | ✅ 완료 | 5개 컴포넌트 53개 테스트 |
| Notion API 재시도 | ✅ 완료 | exponential backoff 3회 |
| 대규모 리팩토링 | 🟡 미착수 | Phase 0 선행 필요 |

## 이미지 진단 매칭률 (최신)

- **대상**: lottegrs.com (33페이지, 470이미지)
- **전체 매칭률**: 25.3%
- **텍스트 이미지 매칭률**: 35.4% (사진 제외)
- **Claude Vision 비용**: 1회 약 $0.50 (700원)

상세: `docs/history/2026-05-07_image-ocr-matching-analysis.md`

## 기술 스택

- Next.js 16 (App Router) / React 19 / TypeScript strict
- Playwright + axe-core (접근성)
- Tesseract.js v7 + sharp (이미지 OCR)
- @anthropic-ai/sdk (Claude Vision, 선택적)
- Notion API (리포트 저장)

## 문서 구조

```
docs/
├── STATUS.md              ← 현재 문서 (프로젝트 현황)
├── history/               ← 개발 완료 이력
│   ├── 2026-05-07_completed-features.md
│   └── 2026-05-07_image-ocr-matching-analysis.md
├── plans/                 ← 현행 계획 문서
│   ├── PLAN_roadmap_v3.md         ← 통합 로드맵 (우선순위 + 미개발 + 매칭률)
│   └── PLAN_refactor_2026-05-06.md
```
