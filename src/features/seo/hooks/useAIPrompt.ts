'use client';

import { useState } from 'react';
import { copyPromptAndOpenAI, AITool } from '@/lib/ai-prompt-generator';
import { SEOAuditResult } from '@/types/seo';

export function useAIPrompt() {
  const [promptCopied, setPromptCopied] = useState(false);

  const handleAIPromptCopy = async (tool: AITool, result: SEOAuditResult) => {
    const geo = result.categories?.geo?.data;
    const meta = result.categories?.meta?.data;

    const promptData = {
      siteName: new URL(result.url).hostname,
      url: result.url,
      llmsTxtContent: geo?.llmsTxt?.exists
        ? `(파일 존재, 점수: ${geo.score}/100)`
        : geo?.llmsTxt?.suggestedContent || '파일 없음',
      ruleBasedScore: geo?.score || 0,
      suggestedImprovements: [
        !geo?.llmsTxt?.exists && 'llms.txt 파일 생성 필요',
        !meta?.title?.exists && 'Title 태그 추가 필요',
        !meta?.description?.exists && 'Meta Description 추가 필요',
        !meta?.canonical?.exists && 'Canonical URL 설정 필요',
      ].filter(Boolean) as string[],
    };

    const success = await copyPromptAndOpenAI(tool, promptData);
    if (success) {
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 3000);
    }
  };

  return { promptCopied, handleAIPromptCopy };
}
