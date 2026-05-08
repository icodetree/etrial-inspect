/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import type { AltTextLogEntry, AltTextProgressState } from '../../hooks/useAltTextAudit';

jest.mock('@/features/audit/components/AuditOverlay.module.css', () =>
  new Proxy({}, { get: (_, key) => key })
);

jest.mock('lucide-react', () => ({
  X: () => <span data-testid="x-icon" />,
}));

import { AltTextOverlay } from '../AltTextOverlay';

function makeProgress(overrides: Partial<AltTextProgressState> = {}): AltTextProgressState {
  return {
    status: 'idle',
    message: '',
    current: 0,
    total: 0,
    currentUrl: '',
    ...overrides,
  };
}

function makeLogs(...messages: string[]): AltTextLogEntry[] {
  return messages.map((message, i) => ({
    time: `2026-05-08T00:00:0${i}`,
    message,
  }));
}

describe('AltTextOverlay', () => {
  const defaultProps = {
    logs: [] as AltTextLogEntry[],
    progress: makeProgress(),
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Renders status label based on progress.status
  describe('status label rendering', () => {
    const statusCases: Array<[AltTextProgressState['status'], string]> = [
      ['crawling', '크롤링 진행 중'],
      ['scanning', 'OCR 분석 중'],
      ['completed', '이미지 진단 완료'],
      ['error', '오류 발생'],
      ['cancelling', '정지 중...'],
      ['cancelled', '진단 취소됨'],
    ];

    it.each(statusCases)(
      'shows "%s" status as "%s"',
      (status, expectedLabel) => {
        render(
          <AltTextOverlay
            {...defaultProps}
            progress={makeProgress({ status })}
          />
        );
        expect(screen.getByText(expectedLabel)).toBeInTheDocument();
      }
    );

    it('shows fallback label for unknown status', () => {
      render(
        <AltTextOverlay
          {...defaultProps}
          progress={makeProgress({ status: 'idle' })}
        />
      );
      expect(screen.getByText('진행 중')).toBeInTheDocument();
    });
  });

  // 2. Renders log entries
  describe('log entries', () => {
    it('shows the last log message as status message', () => {
      const logs = makeLogs('페이지 1 분석 완료', '페이지 2 분석 완료');
      render(
        <AltTextOverlay
          {...defaultProps}
          logs={logs}
          progress={makeProgress({ status: 'scanning' })}
        />
      );
      expect(screen.getByText('페이지 2 분석 완료')).toBeInTheDocument();
    });

    it('truncates long log messages to 50 chars with ellipsis', () => {
      const longMsg = '이 메시지는 50자를 초과하는 매우 긴 로그 메시지입니다. 이 메시지는 반드시 잘려야 합니다. 추가 텍스트.';
      const logs = makeLogs(longMsg);
      render(
        <AltTextOverlay
          {...defaultProps}
          logs={logs}
          progress={makeProgress({ status: 'scanning' })}
        />
      );
      const truncated = longMsg.slice(0, 50) + '...';
      expect(screen.getByText(truncated)).toBeInTheDocument();
    });

    it('shows initialization message when no logs', () => {
      render(
        <AltTextOverlay
          {...defaultProps}
          logs={[]}
          progress={makeProgress({ status: 'crawling' })}
        />
      );
      expect(screen.getByText('초기화 중...')).toBeInTheDocument();
    });
  });

  // 3. ESC key calls onClose
  describe('ESC key handling', () => {
    it('calls onClose when Escape is pressed', () => {
      const onClose = jest.fn();
      render(
        <AltTextOverlay
          {...defaultProps}
          onClose={onClose}
        />
      );
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when close button is clicked', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();
      render(
        <AltTextOverlay
          {...defaultProps}
          onClose={onClose}
        />
      );
      await user.click(screen.getByLabelText('오버레이 닫기'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // 4. Cancel button calls onCancel when progress is active
  describe('cancel button', () => {
    it('shows cancel button during crawling', () => {
      const onCancel = jest.fn();
      render(
        <AltTextOverlay
          {...defaultProps}
          progress={makeProgress({ status: 'crawling' })}
          onCancel={onCancel}
        />
      );
      expect(screen.getByText('진단 정지')).toBeInTheDocument();
    });

    it('shows cancel button during scanning', () => {
      const onCancel = jest.fn();
      render(
        <AltTextOverlay
          {...defaultProps}
          progress={makeProgress({ status: 'scanning' })}
          onCancel={onCancel}
        />
      );
      expect(screen.getByText('진단 정지')).toBeInTheDocument();
    });

    it('calls onCancel when cancel button is clicked', async () => {
      const user = userEvent.setup();
      const onCancel = jest.fn();
      render(
        <AltTextOverlay
          {...defaultProps}
          progress={makeProgress({ status: 'crawling' })}
          onCancel={onCancel}
        />
      );
      await user.click(screen.getByText('진단 정지'));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('does not show cancel button when completed', () => {
      render(
        <AltTextOverlay
          {...defaultProps}
          progress={makeProgress({ status: 'completed' })}
          onCancel={jest.fn()}
        />
      );
      expect(screen.queryByText('진단 정지')).not.toBeInTheDocument();
    });

    it('does not show cancel button when onCancel is not provided', () => {
      render(
        <AltTextOverlay
          {...defaultProps}
          progress={makeProgress({ status: 'crawling' })}
        />
      );
      expect(screen.queryByText('진단 정지')).not.toBeInTheDocument();
    });
  });

  // 5. Shows result summary and action buttons when completed
  describe('completed state', () => {
    const completedProps = {
      ...defaultProps,
      progress: makeProgress({ status: 'completed' }),
      resultSummary: { pages: 5, images: 120, mismatches: 8 },
      onExport: jest.fn(),
      onSaveToNotion: jest.fn(),
      onScrollToResult: jest.fn(),
    };

    it('shows result summary text', () => {
      render(<AltTextOverlay {...completedProps} />);
      expect(screen.getByText('5페이지 · 120장 · 불일치 8건')).toBeInTheDocument();
    });

    it('shows action buttons when completed', () => {
      render(<AltTextOverlay {...completedProps} />);
      expect(screen.getByText('보고서 보기')).toBeInTheDocument();
      expect(screen.getByText('엑셀 다운로드')).toBeInTheDocument();
      expect(screen.getByText('Notion 저장')).toBeInTheDocument();
    });

    it('calls onScrollToResult and onClose when "보고서 보기" is clicked', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();
      const onScrollToResult = jest.fn();
      render(
        <AltTextOverlay
          {...completedProps}
          onClose={onClose}
          onScrollToResult={onScrollToResult}
        />
      );
      await user.click(screen.getByText('보고서 보기'));
      expect(onScrollToResult).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onExport and onClose when "엑셀 다운로드" is clicked', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();
      const onExport = jest.fn();
      render(
        <AltTextOverlay
          {...completedProps}
          onClose={onClose}
          onExport={onExport}
        />
      );
      await user.click(screen.getByText('엑셀 다운로드'));
      expect(onExport).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onSaveToNotion and onClose when "Notion 저장" is clicked', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();
      const onSaveToNotion = jest.fn();
      render(
        <AltTextOverlay
          {...completedProps}
          onClose={onClose}
          onSaveToNotion={onSaveToNotion}
        />
      );
      await user.click(screen.getByText('Notion 저장'));
      expect(onSaveToNotion).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not show action buttons when handlers are not provided', () => {
      render(
        <AltTextOverlay
          {...defaultProps}
          progress={makeProgress({ status: 'completed' })}
        />
      );
      expect(screen.queryByText('보고서 보기')).not.toBeInTheDocument();
      expect(screen.queryByText('엑셀 다운로드')).not.toBeInTheDocument();
      expect(screen.queryByText('Notion 저장')).not.toBeInTheDocument();
    });

    it('does not show progress bar when completed', () => {
      render(<AltTextOverlay {...completedProps} />);
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
  });

  // Accessibility
  describe('accessibility', () => {
    it('has dialog role with aria-modal', () => {
      render(<AltTextOverlay {...defaultProps} />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('has correct aria-label during processing', () => {
      render(
        <AltTextOverlay
          {...defaultProps}
          progress={makeProgress({ status: 'scanning' })}
        />
      );
      expect(screen.getByRole('dialog')).toHaveAttribute(
        'aria-label',
        '이미지 진단 진행 중'
      );
    });

    it('has correct aria-label when completed', () => {
      render(
        <AltTextOverlay
          {...defaultProps}
          progress={makeProgress({ status: 'completed' })}
        />
      );
      expect(screen.getByRole('dialog')).toHaveAttribute(
        'aria-label',
        '이미지 진단 완료'
      );
    });

    it('has aria-live polite on status label', () => {
      render(<AltTextOverlay {...defaultProps} />);
      const statusLabel = screen.getByText('진행 중');
      expect(statusLabel).toHaveAttribute('aria-live', 'polite');
    });

    it('shows progressbar with aria attributes during processing', () => {
      render(
        <AltTextOverlay
          {...defaultProps}
          progress={makeProgress({ status: 'crawling', current: 3, total: 10 })}
        />
      );
      const progressbar = screen.getByRole('progressbar');
      expect(progressbar).toHaveAttribute('aria-valuenow', '3');
      expect(progressbar).toHaveAttribute('aria-valuemax', '10');
      expect(progressbar).toHaveAttribute('aria-label', '이미지 진단 진행 중');
    });
  });

  // Badge items
  describe('badge items', () => {
    it('renders all four badge labels', () => {
      render(<AltTextOverlay {...defaultProps} />);
      expect(screen.getByText('이미지 대체텍스트 검증')).toBeInTheDocument();
      expect(screen.getByText('OCR 기반 분석')).toBeInTheDocument();
      expect(screen.getByText('KWCAG 2.2 준수 검사')).toBeInTheDocument();
      expect(screen.getByText('실시간 모니터링')).toBeInTheDocument();
    });
  });
});
