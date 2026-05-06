/**
 * Phase: 로그인 (storageState 생성).
 *
 * config.enableLogin && config.loginUrl 일 때:
 *   1) headless=false 로 임시 WebCrawler 를 띄움
 *   2) `crawler.login(loginUrl, targetUrl)` 가 사용자가 수동으로 로그인하기를 기다림
 *   3) 성공 시 `authStatePath` 에 storageState 저장 → 후속 phase 들이 이를 로드
 *
 * 단일 페이지 실패가 전체 감사를 중단시키지 않도록 try-catch 로 감싸고, 항상 close.
 */
import { WebCrawler } from '@/lib/crawler';
import type { AuditConfig } from '@/types';

export interface LoginPhaseInput {
  config: AuditConfig;
  authStatePath: string;
  log: (message: string) => void;
}

export async function runLoginPhase(input: LoginPhaseInput): Promise<void> {
  const { config, authStatePath, log } = input;

  if (!config.enableLogin || !config.loginUrl) return;

  log('🔐 로그인 프로세스 시작... (브라우저 창을 확인하세요)');
  const loginCrawler = new WebCrawler({
    headless: false,
  });

  try {
    await loginCrawler.init();
    const loginSuccess = await loginCrawler.login(
      config.loginUrl,
      config.targetUrl,
    );

    if (loginSuccess) {
      log('✅ 로그인 성공 감지');
      await loginCrawler.saveStorageState(authStatePath);
    } else {
      console.warn('⚠️ 로그인 실패 또는 타임아웃, 비로그인 상태로 진행');
    }
  } catch (e) {
    console.error('로그인 중 에러:', e);
  } finally {
    await loginCrawler.close();
  }
}
