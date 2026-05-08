/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import type { AltTextScanResult } from '@/types/alt-text';

// Mock CSS modules
jest.mock('@/app/page.module.css', () => new Proxy({}, { get: (_, key) => key }));
jest.mock('../AltTextScanSection.module.css', () => new Proxy({}, { get: (_, key) => key }));

// Mock ReportPagination to a simple stub that exposes props
jest.mock('../ReportPagination', () => ({
  ReportPagination: ({ currentPage, totalPages, onPageChange }: {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
  }) => (
    totalPages > 1 ? (
      <nav data-testid="pagination" aria-label="페이지 탐색">
        <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}>이전</button>
        <span data-testid="page-info">{currentPage} / {totalPages}</span>
        <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}>다음</button>
      </nav>
    ) : null
  ),
}));

import AltTextScanSection from '../AltTextScanSection';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScan(overrides: Partial<AltTextScanResult> = {}): AltTextScanResult {
  return {
    pageUrl: 'https://example.com',
    scannedAt: new Date().toISOString(),
    totalImagesScanned: 5,
    mismatchCount: 2,
    countsByJudgment: {
      pass: 3,
      missing_alt: 1,
      decorative_mismatch: 0,
      text_mismatch: 1,
      review_needed: 0,
    },
    items: [
      {
        elementId: '#img1',
        imageUrl: 'https://example.com/img1.png',
        currentAlt: 'logo',
        extractedText: 'logo',
        confidenceScore: 0.95,
        imageType: 'text-heavy',
        similarity: 0.99,
        judgment: 'pass',
        reason: '일치합니다.',
      },
      {
        elementId: '#img2',
        imageUrl: 'https://example.com/img2.png',
        currentAlt: null,
        extractedText: 'hello',
        confidenceScore: 0.8,
        imageType: 'mixed',
        similarity: 0,
        judgment: 'missing_alt',
        reason: 'alt 속성이 없습니다.',
      },
      {
        elementId: '#img3',
        imageUrl: 'https://example.com/img3.png',
        currentAlt: 'wrong text',
        extractedText: 'correct text',
        confidenceScore: 0.9,
        imageType: 'text-heavy',
        similarity: 0.3,
        judgment: 'text_mismatch',
        reason: '텍스트 불일치.',
      },
    ],
    ...overrides,
  };
}

/** Generate many items to exceed ITEMS_PER_PAGE (20) */
function makeLargeScan(itemCount: number): AltTextScanResult {
  const items = Array.from({ length: itemCount }, (_, i) => ({
    elementId: `#img-${i}`,
    imageUrl: `https://example.com/img-${i}.png`,
    currentAlt: `alt ${i}`,
    extractedText: `text ${i}`,
    confidenceScore: 0.9,
    imageType: 'text-heavy' as const,
    similarity: 0.5,
    judgment: 'text_mismatch' as const,
    reason: `이유 ${i}`,
  }));

  return {
    pageUrl: 'https://example.com',
    scannedAt: new Date().toISOString(),
    totalImagesScanned: itemCount,
    mismatchCount: itemCount,
    countsByJudgment: {
      pass: 0,
      missing_alt: 0,
      decorative_mismatch: 0,
      text_mismatch: itemCount,
      review_needed: 0,
    },
    items,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AltTextScanSection', () => {
  it('returns null when scans array is empty', () => {
    const { container } = render(<AltTextScanSection scans={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders scan summary with total images and per-judgment counts', () => {
    const scan = makeScan();
    render(<AltTextScanSection scans={[scan]} />);

    // Total images scanned
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('검사한 이미지')).toBeInTheDocument();

    // Per-judgment filter buttons with aria-labels
    expect(screen.getByLabelText('정상 3건 필터')).toBeInTheDocument();
    expect(screen.getByLabelText('alt 누락 1건 필터')).toBeInTheDocument();
    expect(screen.getByLabelText('텍스트 불일치 1건 필터')).toBeInTheDocument();
    expect(screen.getByLabelText('장식 오분류 0건 필터')).toBeInTheDocument();
    expect(screen.getByLabelText('수동 검토 필요 0건 필터')).toBeInTheDocument();
  });

  it('filter buttons toggle judgment filter and reset pagination', async () => {
    const user = userEvent.setup();
    const scan = makeScan();
    render(<AltTextScanSection scans={[scan]} />);

    // Initially "all" is active — 3 items shown, display text says "3건 표시"
    expect(screen.getByText('3건 표시')).toBeInTheDocument();

    // Click the "missing_alt" filter button
    const missingAltBtn = screen.getByLabelText(/alt 누락 1건 필터/);
    await user.click(missingAltBtn);

    // Now only 1 item should be shown
    expect(screen.getByText('1건 표시')).toBeInTheDocument();
    expect(missingAltBtn).toHaveAttribute('aria-pressed', 'true');

    // Click the same button again to toggle back to "all"
    await user.click(missingAltBtn);
    expect(screen.getByText('3건 표시')).toBeInTheDocument();
  });

  it('shows pagination when items exceed ITEMS_PER_PAGE (20)', () => {
    const scan = makeLargeScan(25);
    render(<AltTextScanSection scans={[scan]} />);

    // Pagination should be visible (totalPages = ceil(25/20) = 2)
    const pagination = screen.getByTestId('pagination');
    expect(pagination).toBeInTheDocument();
    expect(screen.getByTestId('page-info')).toHaveTextContent('1 / 2');
  });

  it('navigates to next page when next button is clicked', async () => {
    const user = userEvent.setup();
    const scan = makeLargeScan(25);
    render(<AltTextScanSection scans={[scan]} />);

    // Page 1 initially
    expect(screen.getByTestId('page-info')).toHaveTextContent('1 / 2');

    // Click next
    const nextBtn = screen.getByRole('button', { name: '다음' });
    await user.click(nextBtn);

    expect(screen.getByTestId('page-info')).toHaveTextContent('2 / 2');
  });

  it('does not show pagination when items fit in a single page', () => {
    const scan = makeScan(); // 3 items < 20
    render(<AltTextScanSection scans={[scan]} />);
    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument();
  });
});
