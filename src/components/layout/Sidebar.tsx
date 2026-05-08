'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import {
  Home, FileText,
  Settings, HelpCircle,
  ChevronsLeft, ChevronDown,
  Image as ImageIcon,
  History, CheckSquare,
} from 'lucide-react';
import styles from './Sidebar.module.css';

const SIDEBAR_EXPANDED = 220;
const SIDEBAR_COLLAPSED = 64;

interface NavChild {
  label: string;
  href: string;
  icon: typeof Home;
}

interface NavItem {
  label: string;
  href: string;
  icon: typeof Home;
  children?: NavChild[];
}

const mainNav: NavItem[] = [
  {
    label: '접근성 진단',
    href: '/',
    icon: Home,
    children: [
      { label: '보고서', href: '/report', icon: FileText },
      { label: '진단 이력', href: '/history', icon: History },
      { label: '체크리스트', href: '/report/checklist', icon: CheckSquare },
    ],
  },
  {
    label: '이미지 진단',
    href: '/alttext',
    icon: ImageIcon,
    children: [
      { label: '보고서', href: '/alttext/report', icon: FileText },
      { label: '진단 이력', href: '/alttext/history', icon: History },
    ],
  },
];

const bottomNav = [
  { label: '설정', href: '/settings', icon: Settings },
  { label: '도움말', href: '/help', icon: HelpCircle },
];

/** 모든 네비게이션 항목의 href를 수집 (더 구체적인 경로 우선 매칭에 사용) */
const allNavHrefs: string[] = [
  ...mainNav.flatMap(item => [item.href, ...(item.children?.map(c => c.href) ?? [])]),
  ...bottomNav.map(item => item.href),
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  /** 특정 href가 현재 경로와 일치하는지 (더 구체적인 경로가 존재하면 덜 구체적인 경로는 비활성) */
  const isActive = useCallback((href: string) => {
    if (href === '/') return pathname === '/';
    if (pathname === href) return true;
    if (pathname.startsWith(href + '/')) {
      // 더 구체적으로 매칭되는 다른 href가 있으면 현재 href는 비활성
      const hasMoreSpecific = allNavHrefs.some(
        other => other !== href && other.startsWith(href + '/') && (pathname === other || pathname.startsWith(other + '/'))
      );
      return !hasMoreSpecific;
    }
    return false;
  }, [pathname]);

  /** 부모 메뉴가 활성 상태인지 (자신 또는 자식 중 하나가 active) */
  const isParentActive = useCallback((item: NavItem) => {
    if (isActive(item.href)) return true;
    return item.children?.some(child => isActive(child.href)) ?? false;
  }, [isActive]);

  /** 현재 경로 기반으로 펼쳐야 할 메뉴 계산 */
  const computeExpandedMenus = useCallback(() => {
    const set = new Set<string>();
    for (const item of mainNav) {
      if (isParentActive(item)) {
        set.add(item.href);
      }
    }
    return set;
  }, [isParentActive]);

  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(computeExpandedMenus);

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved === 'true') setCollapsed(true);
  }, []);

  useEffect(() => {
    const width = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;
    document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
    localStorage.setItem('sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  /* pathname 변경 시 활성 부모 메뉴 자동 펼침 — 외부 라우터 상태 동기화 */
  useEffect(() => {
    if (!collapsed) {
      // eslint-disable-next-line
      setExpandedMenus(computeExpandedMenus());
    }
  }, [pathname, collapsed, computeExpandedMenus]);

  const toggleExpand = useCallback((href: string) => {
    setExpandedMenus(prev => {
      const next = new Set(prev);
      if (next.has(href)) {
        next.delete(href);
      } else {
        next.add(href);
      }
      return next;
    });
  }, []);

  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

  return (
    <aside
      className={styles.sidebar}
      style={{ width: `${sidebarWidth}px` }}
    >
      {/* 토글 버튼 */}
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
            className={styles['brand-logo']}
            priority
          />
          <span className={styles['brand-name']}>E-able</span>
        </Link>
      )}
      {collapsed && <div className={styles.brandSpacer} />}

      {/* 메인 네비게이션 */}
      <nav className={styles.nav} aria-label="메인 내비게이션">
        <ul className={styles.navList} role="list">
          {mainNav.map((item) => {
            const Icon = item.icon;
            const parentActive = isParentActive(item);
            const expanded = expandedMenus.has(item.href);
            const hasChildren = item.children && item.children.length > 0;

            return (
              <li key={item.href}>
                <div className={styles.parentRow}>
                  <Link
                    href={item.href}
                    className={`${styles.navItem} ${parentActive ? styles.navItemActive : ''} ${collapsed ? styles.navItemCollapsed : ''} ${hasChildren && !collapsed ? styles.navItemParent : ''}`}
                    aria-current={isActive(item.href) ? 'page' : undefined}
                    title={collapsed ? item.label : undefined}
                    onClick={() => {
                      if (hasChildren && !collapsed && !expanded) {
                        toggleExpand(item.href);
                      }
                    }}
                  >
                    <Icon size={17} aria-hidden="true" />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                  {hasChildren && !collapsed && (
                    <button
                      className={`${styles.expandBtn} ${expanded ? styles.expandBtnOpen : ''}`}
                      onClick={() => toggleExpand(item.href)}
                      aria-expanded={expanded}
                      aria-label={`${item.label} 하위 메뉴 ${expanded ? '접기' : '펼치기'}`}
                    >
                      <ChevronDown size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>

                {/* 서브메뉴 */}
                {hasChildren && !collapsed && (
                  <ul
                    className={`${styles.subNavList} ${expanded ? styles.subNavListOpen : ''}`}
                    role="list"
                  >
                    {item.children!.map((child) => {
                      const ChildIcon = child.icon;
                      const childActive = isActive(child.href);
                      return (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            className={`${styles.subNavItem} ${childActive ? styles.subNavItemActive : ''}`}
                            aria-current={childActive ? 'page' : undefined}
                          >
                            <ChildIcon size={15} aria-hidden="true" />
                            <span>{child.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
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
