/**
 * SEO Analyzer Engine — barrel re-export
 *
 * 기존 import 호환 유지:
 *   import { analyzePage, type AnalyzePageOptions } from '@/lib/seo-analyzer';
 *
 * 실제 구현은 src/lib/seo/ 디렉토리로 분리됨.
 */
export { analyzePage, type AnalyzePageOptions } from './seo/index';
