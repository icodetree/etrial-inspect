/** @jest-environment jsdom */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

jest.mock('../HistoryList.module.css', () =>
  new Proxy({}, { get: (_, key) => key })
);

import { HistoryList } from '../HistoryList';

const mockHistoryItems = [
  {
    id: 'item-1',
    url: 'https://example.com',
    date: '2026-05-01T00:00:00Z',
    score: 85,
    violationCount: 12,
    reportLink: null,
  },
  {
    id: 'item-2',
    url: 'https://test.co.kr',
    date: '2026-05-02T00:00:00Z',
    score: 92,
    violationCount: 5,
    reportLink: null,
  },
];

describe('HistoryList', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows loading state initially', () => {
    // Never resolve fetch so component stays in loading state
    fetchMock.mockReturnValue(new Promise(() => {}));

    render(<HistoryList />);

    expect(screen.getByText('히스토리 불러오는 중...')).toBeInTheDocument();
  });

  it('renders history items after fetch', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => mockHistoryItems,
    });

    render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText('https://example.com')).toBeInTheDocument();
    });

    expect(screen.getByText('https://test.co.kr')).toBeInTheDocument();
    expect(screen.getByText('SEO 85점')).toBeInTheDocument();
    expect(screen.getByText('위반 12건')).toBeInTheDocument();
    expect(screen.getByText('SEO 92점')).toBeInTheDocument();
    expect(screen.getByText('위반 5건')).toBeInTheDocument();
  });

  it('shows empty state when API returns []', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText('저장된 이력이 없습니다.')).toBeInTheDocument();
    });
  });

  it('delete button triggers confirm and DELETE API call', async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => mockHistoryItems,
    });

    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText('https://example.com')).toBeInTheDocument();
    });

    // Set up the DELETE response before clicking
    fetchMock.mockResolvedValueOnce({ ok: true });

    const deleteButtons = screen.getAllByText('삭제');
    await user.click(deleteButtons[0]);

    expect(confirmSpy).toHaveBeenCalledWith(
      '정말 삭제하시겠습니까? (Notion에서 숨김 처리됩니다)'
    );

    // Verify DELETE API call
    expect(fetchMock).toHaveBeenCalledWith('/api/history/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId: 'item-1' }),
    });

    // Optimistic update: item-1 should be removed from DOM
    await waitFor(() => {
      expect(screen.queryByText('https://example.com')).not.toBeInTheDocument();
    });
  });

  it('does not delete when confirm is cancelled', async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => mockHistoryItems,
    });

    jest.spyOn(window, 'confirm').mockReturnValue(false);

    render(<HistoryList />);

    await waitFor(() => {
      expect(screen.getByText('https://example.com')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByText('삭제');
    await user.click(deleteButtons[0]);

    // Item should still be in DOM
    expect(screen.getByText('https://example.com')).toBeInTheDocument();

    // No DELETE call should have been made
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the initial list fetch
  });
});
