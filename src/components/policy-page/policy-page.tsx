import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { SiteHeader, SiteFooter } from "../brand.tsx";
import { CONTACT_EMAIL, CONTACT_HREF } from "../../lib/site.ts";
import styles from "./policy-page.module.css";

export type PolicyDocument = {
  title: string;
  description: string;
  effectiveDate: string;
  sections: { id: string; title: string; content: ReactNode }[];
};

const policyDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function PolicyPage({
  document,
  page,
}: {
  document: PolicyDocument;
  page: "privacy" | "terms";
}) {
  const contents = (
    <ol>
      {document.sections.map((section, index) => (
        <li key={section.id}>
          <a href={`#${section.id}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {section.title}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <div id="top" className="site-shell">
      <SiteHeader />
      <main className={`${styles["policy-page"]} page-width`} aria-labelledby="policy-title">
        <Link to="/" className="backlink">
          <ArrowLeft size={15} /> Back to Genomewalk
        </Link>
        <header className={styles["policy-heading"]}>
          <span className="section-eyebrow">
            GENOMEWALK / {page === "privacy" ? "YOUR PRIVACY" : "USING THE GUIDE"}
          </span>
          <h1 id="policy-title">{document.title}</h1>
          <p>{document.description}</p>
          <div className={styles["policy-meta"]}>
            <span>
              Effective{" "}
              <time dateTime={document.effectiveDate}>
                {policyDate.format(new Date(document.effectiveDate))}
              </time>
            </span>
            <nav aria-label="Policy documents">
              <Link to="/privacy" aria-current={page === "privacy" ? "page" : undefined}>
                Privacy
              </Link>
              <Link to="/terms" aria-current={page === "terms" ? "page" : undefined}>
                Terms
              </Link>
            </nav>
          </div>
        </header>
        <div className={styles["policy-layout"]}>
          <aside className={styles["policy-sidebar"]}>
            <nav className={styles["policy-desktop-contents"]} aria-label="On this page">
              <p className={styles["policy-small-label"]}>ON THIS PAGE</p>
              {contents}
            </nav>
            <details className={styles["policy-mobile-contents"]}>
              <summary>On this page</summary>
              <nav aria-label="On this page">{contents}</nav>
            </details>
          </aside>
          <article className={styles["policy-copy"]} aria-label={document.title}>
            {document.sections.map((section, index) => (
              <section id={section.id} key={section.id} aria-labelledby={`${section.id}-title`}>
                <h2 id={`${section.id}-title`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {section.title}
                </h2>
                {section.content}
              </section>
            ))}
            <div className={styles["policy-contact"]}>
              <span className={styles["policy-small-label"]}>QUESTIONS ABOUT GENOMEWALK?</span>
              <a href={CONTACT_HREF}>
                {CONTACT_EMAIL} <span aria-hidden="true">↗</span>
              </a>
            </div>
          </article>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
