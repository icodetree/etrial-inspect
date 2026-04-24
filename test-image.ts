import { analyzeImageWithVision, computeSimilarity } from './src/lib/alt-text-validator';

async function runTest() {
  console.log('이미지 분석 테스트를 시작합니다...');

  // 테스트할 이미지 URL (로컬 이미지 경로나 웹 URL)
  // Tesseract.js는 URL이나 로컬 이미지 경로를 바로 처리할 수 있습니다.
  const testImageUrl = 'https://www.lottegrs.com/com/img/about_us/logo.jpg';
  const currentAltText = '테스트용 샘플 텍스트';

  try {
    console.log(`[1/3] Tesseract.js로 로컬에서 텍스트 추출 중 (오프라인)...`);
    const { extractedText, confidenceScore } = await analyzeImageWithVision(testImageUrl);

    console.log(`✅ 추출된 텍스트: "${extractedText}"`);

    console.log(`\n[2/3] 기존 alt 속성과 유사도 비교 중...`);
    console.log(`기존 alt: "${currentAltText}"`);
    const similarity = computeSimilarity(currentAltText, extractedText);

    console.log(`✅ 유사도 점수: ${similarity} (1.0에 가까울수록 일치)`);

    console.log(`\n[3/3] 최종 판별 결과`);
    if (similarity >= 0.8) {
      console.log('🟢 대체 텍스트가 이미지 내용과 적절히 일치합니다.');
    } else {
      console.log('🔴 대체 텍스트 불일치 (수정이 필요합니다.)');
    }

  } catch (error) {
    console.error('테스트 중 오류 발생:', error);
  }
}

runTest();
