
import * as fs from 'fs';
import { runAudit } from '../src/services/AuditExecutor';
import { AuditConfig } from '../src/types';
import { NotionService } from '../src/services/notion/NotionService';

async function main() {
  const targetUrl = process.env.TARGET_URL;
  if (!targetUrl) {
    console.error('Error: TARGET_URL environment variable is required');
    process.exit(1);
  }

  const config: AuditConfig = {
    targetUrl: targetUrl,
    enableLogin: false, // Default to false for GHA for now, or pass via env
    enableAccessibilityCheck: true,
    enableSEOCheck: true,
    platform: 'PC',
    inspector: 'GitHub Actions'
  };

  console.log('Starting Audit for:', targetUrl);

  try {
    const result = await runAudit(config, (progress) => {
      if (progress.type === 'log') {
        console.log(`[Progress] log: ${progress.message}`);
      } else {
        console.log(
          `[Progress] ${progress.type}: ${progress.current}/${progress.total} — ${progress.url}`,
        );
      }
    });

    console.log('Audit Completed successfully.');
    console.log(JSON.stringify(result, null, 2));

    // GitHub Actions에서 실행된 경우 Artifact 이름 및 URL 추가
    const githubRunId = process.env.GITHUB_RUN_ID;
    const githubRepo = process.env.GITHUB_REPOSITORY;

    if (githubRunId) {
      result.artifactName = `screenshots-${githubRunId}`;
      console.log(`[Artifact] Name: ${result.artifactName}`);

      if (githubRepo) {
        const [owner, repo] = githubRepo.split('/');
        // GitHub Pages URL 생성 (Base URL)
        // 예: https://UX-Ino.github.io/etrial-inspect/screenshots/12345/
        result.screenshotUrl = `https://${owner}.github.io/${repo}/screenshots/${githubRunId}/`;
        console.log(`[Artifact] URL: ${result.screenshotUrl}`);

        // GITHUB_STEP_SUMMARY에 링크 추가
        const summaryFile = process.env.GITHUB_STEP_SUMMARY;
        if (summaryFile) {
          try {
            const summaryContent = `
### 📸 Audit Screenshots
[View Screenshots on GitHub Pages](${result.screenshotUrl})

> **Note:** Screenshots are deployed to GitHub Pages. If the link returns 404, please wait a moment for the deployment to finish.
`;
            fs.appendFileSync(summaryFile, summaryContent);
            console.log(`[Summary] Added screenshot link to Job Summary.`);
          } catch (e) {
            console.error(`[Summary] Failed to write to GITHUB_STEP_SUMMARY:`, e);
          }
        }
      }
    } else {
      // Local Execution
      console.log(`[Local] Running in local environment.`);
      const localBaseUrl = 'http://localhost:3000/screenshots/';
      // result.screenshotUrl = localBaseUrl; // Optional, might be useful for some logic
      console.log(`[Local] Screenshots are saved in 'public/screenshots'`);
      console.log(`[Local] Open screenshots in browser: ${localBaseUrl}`);

      if (result.violations.length > 0) {
        console.log(`[Local] Violations found:`);
        result.violations.forEach((v: any) => {
          if (v.screenshotPath) {
            const filename = v.screenshotPath.split('/').pop();
            console.log(`  - ${v.kwcagName} (${v.impact}): ${localBaseUrl}${filename}`);
          }
        });
      }
    }

    // Check if any errors occurred during audit logic that didn't throw
    if (result.violations.length > 0) {
      console.log(`Found ${result.violations.length} violations.`);
    }

    // Notion에 결과 저장
    const notionApiKey = process.env.NOTION_API_KEY;
    const notionDatabaseId = process.env.NOTION_DATABASE_ID;

    if (notionApiKey && notionDatabaseId) {
      console.log('Saving results to Notion...');
      const notionService = new NotionService(notionApiKey, notionDatabaseId);
      const pageId = await notionService.saveAuditResult(result);
      console.log(`✅ Notion 저장 완료! Page ID: ${pageId}`);
    } else {
      console.warn('⚠️ Notion credentials not found. Skipping Notion save.');
    }

  } catch (error) {
    console.error('Audit failed:', error);
    process.exit(1);
  }
}

main();
