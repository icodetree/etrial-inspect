import styles from './loading.module.css';

export default function Loading() {
  return (
    <div className={styles.container} role="status" aria-label="리포트 로딩 중">
      <div className={styles.spinner} aria-hidden="true" />
      <p className={styles.message}>Notion에서 리포트를 불러오는 중...</p>
    </div>
  );
}
