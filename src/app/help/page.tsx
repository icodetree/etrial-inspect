'use client';

import { useState, useEffect } from 'react';
import styles from './page.module.css';
import {
  Book,
  Play,
  BarChart3,
  Download,
  Database,
  AlertCircle,
  Settings,
} from 'lucide-react';

const sections = [
  { id: 'overview', title: '시스템 개요', icon: Book },
  { id: 'audit', title: '진단 수행하기', icon: Play },
  { id: 'audit-types', title: '진단 항목 이해', icon: Settings },
  { id: 'results', title: '결과 보기', icon: BarChart3 },
  { id: 'export', title: '내보내기', icon: Download },
  { id: 'notion', title: 'Notion 연동', icon: Database },
  { id: 'troubleshooting', title: '문제 해결', icon: AlertCircle },
] as const;

export default function HelpPage() {
  const [activeSection, setActiveSection] = useState('overview');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: '-20% 0px -80% 0px' },
    );

    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const handleTocClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    id: string,
  ) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setActiveSection(id);
  };

  return (
    <div className={styles.helpLayout}>
      {/* Left TOC */}
      <nav className={styles.toc} aria-label="목차">
        <h2 className={styles.tocTitle}>사용 가이드</h2>
        <ul className={styles.tocList}>
          {sections.map(({ id, title, icon: Icon }) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className={`${styles.tocItem} ${activeSection === id ? styles.tocItemActive : ''}`}
                aria-current={activeSection === id ? 'true' : undefined}
                onClick={(e) => handleTocClick(e, id)}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{title}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Right Content */}
      <main className={styles.content} aria-label="사용 가이드 본문">
        {/* 1. 시스템 개요 */}
        <section id="overview" className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Book size={24} aria-hidden="true" />
            시스템 개요
          </h2>
          <div className={styles.sectionContent}>
            <p>
              <strong>E-able 웹접근성 자동 진단 시스템</strong>은 KWCAG
              2.2(한국형 웹 콘텐츠 접근성 지침) 기반의 웹사이트 접근성 자동 진단
              도구입니다. 웹접근성, SEO, AI 친화도를 종합적으로 분석하여
              개선점을 제시합니다.
            </p>

            <h3 className={styles.subsectionTitle}>주요 기능</h3>
            <div className={styles.featureGrid}>
              <div className={styles.featureCard}>
                <strong>웹접근성 자동 진단</strong>
                KWCAG 2.2 33개 항목 기반 자동 검출
              </div>
              <div className={styles.featureCard}>
                <strong>SEO 최적화 분석</strong>
                Sitemap, Meta, 구조화 데이터 검사
              </div>
              <div className={styles.featureCard}>
                <strong>AI 친화도 분석</strong>
                llms.txt, GEO 분석
              </div>
              <div className={styles.featureCard}>
                <strong>다중 페이지 크롤링</strong>
                사이트 전체 일괄 진단
              </div>
              <div className={styles.featureCard}>
                <strong>스크린샷 시각화</strong>
                위반사항 위치를 바운딩 박스로 표시
              </div>
              <div className={styles.featureCard}>
                <strong>보고서 내보내기</strong>
                PDF / Excel / JSON 형식 지원
              </div>
              <div className={styles.featureCard}>
                <strong>Notion 연동</strong>
                진단 이력을 Notion에 저장/관리
              </div>
              <div className={styles.featureCard}>
                <strong>대규모 진단</strong>
                GitHub Actions를 통한 원격 진단
              </div>
            </div>

            <h3 className={styles.subsectionTitle}>지원 환경</h3>
            <ul>
              <li>Chrome 기반 브라우저 (권장)</li>
              <li>PC 및 모바일 뷰포트 진단 지원</li>
              <li>로컬 개발 환경 및 Vercel 배포 지원</li>
            </ul>
          </div>
        </section>

        {/* 2. 진단 수행하기 */}
        <section id="audit" className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Play size={24} aria-hidden="true" />
            진단 수행하기
          </h2>
          <div className={styles.sectionContent}>
            <h3 className={styles.subsectionTitle}>기본 진단 절차</h3>
            <ol className={styles.stepList}>
              <li>대시보드에서 대상 URL을 입력합니다.</li>
              <li>
                진단 옵션(접근성, SEO, AI)을 선택합니다.
              </li>
              <li>
                필요한 경우 크롤링 설정(최대 페이지, 깊이)을 조정합니다.
              </li>
              <li>
                <strong>[전체 검사]</strong> 버튼을 클릭합니다.
              </li>
            </ol>

            <div className={styles.infoBox}>
              진단 중에는 하단의 터미널 패널에서 실시간 로그를 확인할 수
              있습니다. 진단이 완료되면 자동으로 결과 요약이 표시됩니다.
            </div>

            <h3 className={styles.subsectionTitle}>
              로그인이 필요한 사이트
            </h3>
            <ol className={styles.stepList}>
              <li>
                &quot;로그인 필요&quot; 토글을 활성화하면 로그인 URL을 입력할 수 있습니다.
              </li>
              <li>
                진단 시작 시 브라우저 창이 열립니다.
              </li>
              <li>
                로그인을 완료한 후 창을 닫으면 자동으로 진단이 시작됩니다.
              </li>
            </ol>

            <h3 className={styles.subsectionTitle}>
              대규모 진단 (GitHub Actions)
            </h3>
            <p>
              로컬 환경의 제한(시간, 메모리)을 넘어선 대규모 사이트 진단 시
              사용합니다.
            </p>
            <ul>
              <li>GitHub Actions가 설정되어 있어야 합니다.</li>
              <li>
                <strong>[대규모 진단]</strong> 버튼을 클릭하면 원격으로 진단이
                실행됩니다.
              </li>
              <li>
                진단 완료 후 결과가 자동으로 동기화됩니다.
              </li>
            </ul>

            <div className={styles.warningBox}>
              대규모 진단은 GitHub Actions 워크플로우가 사전에 구성되어 있어야
              합니다. 설정 방법은 프로젝트 README를 참고하세요.
            </div>
          </div>
        </section>

        {/* 3. 진단 항목 이해 */}
        <section id="audit-types" className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Settings size={24} aria-hidden="true" />
            진단 항목 이해
          </h2>
          <div className={styles.sectionContent}>
            <h3 className={styles.subsectionTitle}>
              웹접근성 (KWCAG 2.2)
            </h3>
            <p>
              한국형 웹 콘텐츠 접근성 지침 2.2의 33개 검사항목을 기반으로
              진단합니다. axe-core 엔진을 활용한 자동 검출 결과를 KWCAG
              항목에 매핑하여 제공합니다.
            </p>
            <ul>
              <li>
                <strong>인식의 용이성</strong> — 대체 텍스트, 멀티미디어 자막,
                색상 대비, 명확한 지시사항 등
              </li>
              <li>
                <strong>운용의 용이성</strong> — 키보드 접근, 초점 이동, 충분한
                시간, 깜빡임 제한 등
              </li>
              <li>
                <strong>이해의 용이성</strong> — 기본 언어, 사용자 입력 도움,
                예측 가능한 콘텐츠 등
              </li>
              <li>
                <strong>견고성</strong> — 마크업 오류 방지, 보조기술 호환성 등
              </li>
            </ul>

            <h3 className={styles.subsectionTitle}>위반 심각도</h3>
            <table
              className={styles.severityTable}
              aria-label="위반 심각도 분류"
            >
              <thead>
                <tr>
                  <th scope="col">심각도</th>
                  <th scope="col">설명</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <span className={styles.badgeCritical}>Critical</span>
                  </td>
                  <td>
                    즉시 수정 필요. 콘텐츠 접근 자체가 불가능한 수준의 위반
                  </td>
                </tr>
                <tr>
                  <td>
                    <span className={styles.badgeSerious}>Serious</span>
                  </td>
                  <td>
                    주요 기능에 영향. 우선적으로 수정을 권장
                  </td>
                </tr>
                <tr>
                  <td>
                    <span className={styles.badgeModerate}>Moderate</span>
                  </td>
                  <td>
                    일부 사용자에게 불편을 초래할 수 있는 수준
                  </td>
                </tr>
                <tr>
                  <td>
                    <span className={styles.badgeMinor}>Minor</span>
                  </td>
                  <td>개선을 권장하는 사항</td>
                </tr>
              </tbody>
            </table>

            <h3 className={styles.subsectionTitle}>SEO 최적화</h3>
            <ul>
              <li>Sitemap.xml 존재 여부 및 유효성</li>
              <li>robots.txt 설정 확인</li>
              <li>Meta 태그 (title, description, OG 태그)</li>
              <li>구조화 데이터 (JSON-LD)</li>
              <li>모바일 최적화 상태</li>
            </ul>

            <h3 className={styles.subsectionTitle}>AI 친화도 (GEO)</h3>
            <ul>
              <li>llms.txt 파일 존재 여부</li>
              <li>AI 크롤러 접근 허용 상태</li>
              <li>구조화된 콘텐츠 제공 수준</li>
            </ul>
          </div>
        </section>

        {/* 4. 결과 보기 */}
        <section id="results" className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <BarChart3 size={24} aria-hidden="true" />
            결과 보기
          </h2>
          <div className={styles.sectionContent}>
            <h3 className={styles.subsectionTitle}>리포트 페이지</h3>
            <p>
              진단 완료 후 자동으로 리포트 페이지로 이동할 수 있습니다.
              접근성 / SEO / GEO 탭으로 분석 결과를 확인합니다.
            </p>

            <h3 className={styles.subsectionTitle}>위반사항 목록</h3>
            <ul>
              <li>원칙, 영향도, KWCAG 항목별로 필터링할 수 있습니다.</li>
              <li>
                각 위반사항의 영향받는 코드와 해결방안을 확인합니다.
              </li>
              <li>
                스크린샷 버튼으로 해당 요소의 위치를 시각적으로 확인합니다.
              </li>
            </ul>

            <div className={styles.infoBox}>
              위반사항 카드를 클릭하면 상세 정보가 펼쳐집니다. 코드 스니펫과
              함께 수정 가이드가 표시되므로 즉시 개선 작업에 착수할 수
              있습니다.
            </div>

            <h3 className={styles.subsectionTitle}>
              체크리스트 (33개 항목)
            </h3>
            <ul>
              <li>
                보고서 &gt; 체크리스트 메뉴에서 KWCAG 2.2 전체 항목의
                적합/부적합을 확인합니다.
              </li>
              <li>
                자동 검출 수준(자동/반자동/수동)을 함께 표시합니다.
              </li>
              <li>
                적합/부적합 매트릭스를 통해 전체 현황을 한눈에 파악할 수
                있습니다.
              </li>
            </ul>
          </div>
        </section>

        {/* 5. 내보내기 */}
        <section id="export" className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Download size={24} aria-hidden="true" />
            내보내기
          </h2>
          <div className={styles.sectionContent}>
            <h3 className={styles.subsectionTitle}>엑셀 (Excel)</h3>
            <p>
              위반사항 목록을 Excel 파일로 다운로드합니다. 필터링/정렬이
              가능한 테이블 형태로 제공되어 팀 내 공유 및 관리에
              유용합니다.
            </p>

            <h3 className={styles.subsectionTitle}>PDF 보고서</h3>
            <p>
              WebWatch 양식 기반의 공식 보고서를 생성합니다. 다음 항목을
              포함합니다:
            </p>
            <ul>
              <li>표지 및 종합결과 요약</li>
              <li>항목별 체크리스트 (적합/부적합)</li>
              <li>O/X 매트릭스 (페이지 x 항목)</li>
              <li>페이지별 상세 위반 결과</li>
              <li>스크린샷 및 바운딩 박스</li>
            </ul>

            <div className={styles.warningBox}>
              대용량 보고서(50+ 페이지)는 PDF 생성에 시간이 오래 걸릴 수
              있습니다. 스크린샷 제외 옵션을 사용하면 생성 속도가
              개선됩니다.
            </div>

            <h3 className={styles.subsectionTitle}>JSON</h3>
            <p>
              원본 진단 데이터를 JSON으로 다운로드합니다. 프로그래밍
              방식으로 데이터를 활용하거나, 외부 시스템과 연동할 때
              유용합니다.
            </p>
          </div>
        </section>

        {/* 6. Notion 연동 */}
        <section id="notion" className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Database size={24} aria-hidden="true" />
            Notion 연동
          </h2>
          <div className={styles.sectionContent}>
            <h3 className={styles.subsectionTitle}>설정 방법</h3>
            <ol className={styles.stepList}>
              <li>
                Notion에서 Integration을 생성합니다 (
                <a
                  href="https://www.notion.so/my-integrations"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  notion.so/my-integrations
                </a>
                ).
              </li>
              <li>Integration의 API Key를 복사합니다.</li>
              <li>
                Notion 데이터베이스를 생성하고 Integration에 접근 권한을
                부여합니다.
              </li>
              <li>
                <code>.env</code> 파일에 다음 값을 설정합니다:
              </li>
            </ol>
            <div className={styles.codeBlock} role="figure" aria-label="환경 변수 설정 예시">
              <code>
                NOTION_API_KEY=your-api-key
                <br />
                NOTION_DATABASE_ID=your-database-id
              </code>
            </div>

            <h3 className={styles.subsectionTitle}>이력 관리</h3>
            <ul>
              <li>
                진단 완료 후 <strong>&quot;Notion 저장&quot;</strong> 버튼으로 결과를
                저장합니다.
              </li>
              <li>
                대시보드 하단의 진단 이력에서 저장된 결과를 확인합니다.
              </li>
              <li>
                <strong>&quot;리포트 보기&quot;</strong>를 클릭하면 저장된 결과를 다시 열 수
                있습니다.
              </li>
            </ul>

            <div className={styles.infoBox}>
              Notion에 저장된 이력은 팀원과 공유할 수 있으며, 시간 경과에
              따른 접근성 점수 변화를 추적하는 데 활용됩니다.
            </div>
          </div>
        </section>

        {/* 7. 문제 해결 */}
        <section id="troubleshooting" className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <AlertCircle size={24} aria-hidden="true" />
            문제 해결
          </h2>
          <div className={styles.sectionContent}>
            <h3 className={styles.subsectionTitle}>브라우저 실행 오류</h3>
            <ul>
              <li>
                Playwright / Chromium이 설치되어 있는지 확인합니다.
              </li>
              <li>
                macOS: &quot;보안 및 개인 정보 보호&quot;에서 Chromium 실행을
                허용합니다.
              </li>
              <li>
                Vercel 배포 시 <code>@sparticuz/chromium</code> 패키지가
                포함되어야 합니다.
              </li>
            </ul>

            <h3 className={styles.subsectionTitle}>
              Notion 연동 오류
            </h3>
            <ul>
              <li>API Key와 Database ID가 올바른지 확인합니다.</li>
              <li>
                Integration이 해당 데이터베이스에 접근 권한이 있는지
                확인합니다.
              </li>
              <li>
                데이터베이스에 필요한 속성(URL, Date, Score 등)이 있는지
                확인합니다.
              </li>
            </ul>

            <h3 className={styles.subsectionTitle}>
              대규모 진단 타임아웃
            </h3>
            <ul>
              <li>
                Vercel 무료 플랜은 함수 실행 시간이 제한됩니다.
              </li>
              <li>
                대규모 사이트는 GitHub Actions를 통한 진단을 권장합니다.
              </li>
              <li>
                최대 페이지 수와 깊이를 조절하여 진단 범위를 줄입니다.
              </li>
            </ul>

            <h3 className={styles.subsectionTitle}>PDF 생성 실패</h3>
            <ul>
              <li>
                PDF 생성에는 서버측 Playwright가 필요합니다.
              </li>
              <li>
                대용량 보고서(50+ 페이지)는 생성 시간이 길어질 수
                있습니다.
              </li>
              <li>
                스크린샷 제외 옵션을 사용하면 속도가 개선됩니다.
              </li>
            </ul>

            <div className={styles.warningBox}>
              위 방법으로 해결되지 않는 경우, 브라우저 개발자 도구의
              콘솔(Console)에서 에러 메시지를 확인하고 프로젝트 이슈
              트래커에 보고해 주세요.
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
