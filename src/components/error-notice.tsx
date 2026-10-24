import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./error-notice.module.css";

type ErrorNoticeProps = {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function ErrorNotice({ title, children, action, className = "" }: ErrorNoticeProps) {
  return (
    <div className={`${styles["notice"]} ${className}`} role="alert" aria-atomic="true">
      <CircleAlert className={styles["icon"]} size={20} strokeWidth={1.6} aria-hidden="true" />
      <div className={styles["content"]}>
        <p className={styles["title"]}>{title}</p>
        <div className={styles["description"]}>{children}</div>
        {action && <div className={styles["actions"]}>{action}</div>}
      </div>
    </div>
  );
}
