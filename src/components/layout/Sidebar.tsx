'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Home, FileText, CheckSquare,
  Settings, HelpCircle,
  ChevronsLeft,
  Image as ImageIcon,
  History,
} from 'lucide-react';
import styles from './Sidebar.module.css';

const SIDEBAR_EXPANDED = 220;
const SIDEBAR_COLLAPSED = 64;

const mainNav = [
  { label: '진단',          href: '/',                 icon: Home },
  { label: '진단 이력',     href: '/history',           icon: History },
  { label: '보고서',        href: '/report',            icon: FileText },
  { label: '이미지 진단',   href: '/alttext',           icon: ImageIcon },
  { label: '체크리스트',    href: '/report/checklist',  icon: CheckSquare },
];

const bottomNav = [
  { label: '설정',     href: '/settings', icon: Settings },
  { label: '도움말',   href: '/help',     icon: HelpCircle },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved === 'true') setCollapsed(true);
  }, []);

  useEffect(() => {
    const width = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;
    document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
    localStorage.setItem('sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    if (href.startsWith('/#')) return pathname === '/';
    if (href === '/report') return pathname === '/report' || (pathname.startsWith('/report/') && !pathname.startsWith('/report/checklist'));
    if (href === '/alttext') return pathname === '/alttext' || pathname.startsWith('/alttext/');
    return pathname === href || pathname.startsWith(href + '/');
  };

  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

  return (
    <aside
      role="navigation"
      aria-label="메인 내비게이션"
      className={styles.sidebar}
      style={{ width: `${sidebarWidth}px` }}
    >
      {/* 토글 버튼 — 사이드바 우측 상단 절대 위치 */}
      <button
        className={`${styles.toggleBtn} ${collapsed ? styles.toggleBtnCollapsed : ''}`}
        onClick={() => setCollapsed(prev => !prev)}
        aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
        title={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
      >
        <ChevronsLeft size={16} className={styles.toggleIcon} />
      </button>

      {/* 로고 */}
      {!collapsed && (
        <Link href="/" className={styles.brandArea}>
          <Image
            src="/images/logo.png"
            alt="E-able 로고"
            width={50}
            height={32}
            style={{ objectFit: 'contain', objectPosition: 'left' }}
            priority
          />
          <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#111827' }}>E-able</span>
        </Link>
      )}
      {collapsed && <div className={styles.brandSpacer} />}

      {/* 메인 네비게이션 */}
      <nav className={styles.nav}>
        <ul className={styles.navList} role="list">
          {mainNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`${styles.navItem} ${active ? styles.navItemActive : ''} ${collapsed ? styles.navItemCollapsed : ''}`}
                  aria-current={active ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon size={17} aria-hidden="true" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* 하단 영역 */}
      <div className={styles.bottomArea}>
        <ul className={styles.bottomList} role="list">
          {bottomNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`${styles.navItem} ${active ? styles.navItemActive : ''} ${collapsed ? styles.navItemCollapsed : ''}`}
                  aria-current={active ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon size={17} aria-hidden="true" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
