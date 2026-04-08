'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, FileText, Clock, CheckSquare,
  Settings, HelpCircle, Sparkles,
} from 'lucide-react';
import styles from './Sidebar.module.css';

const mainNav = [
  { label: '진단',        href: '/',                 icon: Home },
  { label: '보고서',      href: '/report',            icon: FileText },
  { label: '이력',        href: '/#history',          icon: Clock },
  { label: '체크리스트',  href: '/report/checklist',  icon: CheckSquare },
];

const bottomNav = [
  { label: '설정',     href: '/settings', icon: Settings },
  { label: '도움말',   href: '/help',     icon: HelpCircle },
];

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    if (href.startsWith('/#')) return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <aside
      role="navigation"
      aria-label="메인 내비게이션"
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '220px',
        borderRight: '1px solid #e5e7eb',
        backgroundColor: '#ffffff',
      }}
    >
      {/* 로고 */}
      <Link href="/" className={styles.brandArea}>
        <div className={styles.brandIcon}>
          <span>E</span>
        </div>
        <span className={styles.brandName}>E-able</span>
      </Link>

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
                  className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon size={17} aria-hidden="true" />
                  {item.label}
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
            return (
              <li key={item.href}>
                <Link href={item.href} className={styles.navItem}>
                  <Icon size={17} aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* 업그레이드 카드 */}
        <div className={styles.upgradeCard}>
          <div className={styles.upgradeTitle}>
            <Sparkles size={15} aria-hidden="true" />
            <span>Pro 업그레이드</span>
          </div>
          <p className={styles.upgradeDesc}>
            고급 보고서와 AI 분석 기능을 사용해보세요.
          </p>
          <button className={styles.upgradeBtn} type="button">
            업그레이드
          </button>
        </div>
      </div>
    </aside>
  );
}
