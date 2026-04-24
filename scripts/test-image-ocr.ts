import {
  analyzeImageWithVision,
  classifyImageType,
  computeSimilarity,
  judgeAltText,
  shutdownSharedWorkerPool,
} from '../src/lib/alt-text-validator';

async function runTest() {
  console.log('이미지 분석 테스트 (Tesseract.js + sharp 전처리)');

  const testImageUrl = 'https://www.lottegrs.com/com/img/about_us/logo.jpg';
  const currentAltText = '테스트용 샘플 텍스트';

  try {
    console.log('\n[1/4] OCR (전처리 + 워커 풀)...');
    const vision = await analyzeImageWithVision(testImageUrl, { enablePreprocessing: true });
    console.log(`  추출 텍스트: "${vision.extractedText}"`);
    console.log(`  신뢰도: ${(vision.confidenceScore * 100).toFixed(1)}%`);
    console.log(`  단어 수: ${vision.wordCount}`);

    console.log('\n[2/4] 이미지 유형 분류...');
    const imageType = classifyImageType(vision);
    console.log(`  유형: ${imageType}`);

    console.log('\n[3/4] 유사도 계산...');
    const similarity = computeSimilarity(currentAltText, vision.extractedText);
    console.log(`  alt: "${currentAltText}"`);
    console.log(`  유사도: ${(similarity * 100).toFixed(1)}%`);

    console.log('\n[4/4] 최종 판정...');
    const { judgment, reason } = judgeAltText({
      altAttr: currentAltText,
      imageType,
      similarity,
      ocrText: vision.extractedText,
      threshold: 0.6,
    });
    console.log(`  판정: ${judgment}`);
    console.log(`  사유: ${reason}`);
  } catch (error) {
    console.error('테스트 중 오류:', error);
  } finally {
    await shutdownSharedWorkerPool();
  }
}

runTest();
