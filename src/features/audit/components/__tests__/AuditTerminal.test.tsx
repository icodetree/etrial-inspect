/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

jest.mock('@/app/page.module.css', () =>
  new Proxy({}, { get: (_, key) => key })
);

jest.mock('@/components/ui/Button', () => ({
  Button: (props: any) => <button {...props} />,
}));

import { AuditTerminal } from '../AuditTerminal';
import { LogEntry, ProgressState } from '../../hooks/useAudit';

const idleProgress: ProgressState = {
  status: 'idle',
  currentUrl: '',
  totalFound: 0,
  processed: 0,
  violations: 0,
  message: '',
};

const completedProgress: ProgressState = {
  status: 'completed',
  currentUrl: '',
  totalFound: 5,
  processed: 5,
  violations: 3,
  message: '완료',
};

const defaultProps = {
  logs: [] as LogEntry[],
  progress: idleProgress,
  onExport: jest.fn(),
  onSaveToNotion: jest.fn(),
  resultSummary: null,
};

describe('AuditTerminal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders empty state message when logs is []', () => {
    render(<AuditTerminal {...defaultProps} />);
    expect(screen.getByText(/스캔 준비 완료/)).toBeInTheDocument();
    expect(screen.getByText(/입력을 기다리는 중/)).toBeInTheDocument();
  });

  it('renders log entries with time and message', () => {
    const logs: LogEntry[] = [
      { time: '10:00:01', message: '크롤링 시작' },
      { time: '10:00:05', message: '페이지 발견: /about' },
    ];

    render(<AuditTerminal {...defaultProps} logs={logs} />);

    expect(screen.getByText('[10:00:01]')).toBeInTheDocument();
    expect(screen.getByText('크롤링 시작')).toBeInTheDocument();
    expect(screen.getByText('[10:00:05]')).toBeInTheDocument();
    expect(screen.getByText('페이지 발견: /about')).toBeInTheDocument();
  });

  it('does not show action buttons when progress is not completed', () => {
    render(<AuditTerminal {...defaultProps} />);

    expect(screen.queryByText(/엑셀 다운로드/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Notion 저장/)).not.toBeInTheDocument();
  });

  it('calls onExport when export button clicked', async () => {
    const user = userEvent.setup();
    const onExport = jest.fn();

    render(
      <AuditTerminal
        {...defaultProps}
        progress={completedProgress}
        resultSummary={{ pages: 5, violations: 3 }}
        onExport={onExport}
      />
    );

    const exportButton = screen.getByText(/엑셀 다운로드/);
    await user.click(exportButton);

    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('calls onSaveToNotion when save button clicked', async () => {
    const user = userEvent.setup();
    const onSaveToNotion = jest.fn();

    render(
      <AuditTerminal
        {...defaultProps}
        progress={completedProgress}
        resultSummary={{ pages: 5, violations: 3 }}
        onSaveToNotion={onSaveToNotion}
      />
    );

    const notionButton = screen.getByText(/Notion 저장/);
    await user.click(notionButton);

    expect(onSaveToNotion).toHaveBeenCalledTimes(1);
  });

  it('displays result summary when completed', () => {
    render(
      <AuditTerminal
        {...defaultProps}
        progress={completedProgress}
        resultSummary={{ pages: 5, violations: 3 }}
      />
    );

    expect(screen.getByText(/진단 완료/)).toBeInTheDocument();
    expect(screen.getByText(/총 페이지: 5/)).toBeInTheDocument();
    expect(screen.getByText(/발견된 위반: 3/)).toBeInTheDocument();
  });
});
