import { CHAPTER_COUNT } from "../lib/navigation/journey.ts";
import { Link } from "@tanstack/react-router";
import { FileUp, ShieldCheck } from "lucide-react";
import { CONTACT_HREF } from "../lib/site.ts";

function GenomeMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="30"
      height="36"
      viewBox="0 0 30 36"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 3C6 13 24 23 24 33M24 3C24 13 6 23 6 33"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M7 7h16M11 13h8M11 23h8M7 29h16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link to="/" className="wordmark" aria-label="Genomewalk home">
        <GenomeMark />
        <span>
          genomewalk<span className="brand-period">.</span>
        </span>
      </Link>
      <nav className="header-nav" aria-label="Main navigation">
        <Link to="/" hash="specimen" className="header-upload">
          Upload raw file
          <span className="nav-superscript" aria-hidden="true">
            <FileUp size={13} strokeWidth={1.75} />
          </span>
        </Link>
        <Link to="/" hash="steps">
          Explore chapters
          <span className="nav-superscript" aria-hidden="true">
            {String(CHAPTER_COUNT).padStart(2, "0")}
          </span>
        </Link>
        <Link to="/privacy">
          Your privacy
          <span className="nav-superscript" aria-hidden="true">
            <ShieldCheck size={13} strokeWidth={1.5} />
          </span>
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <Link to="/" className="footer-brand">
          genomewalk.
        </Link>
        <span>A field guide to your genome</span>
      </div>
      <em>“Know thyself, one base at a time.”</em>
      <nav className="footer-policies" aria-label="Policies and contact">
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
        <a href={CONTACT_HREF}>Contact</a>
      </nav>
      <a href="#top" className="back-top">
        Back to top ↑
      </a>
    </footer>
  );
}
