import { Link } from "@tanstack/react-router";
import type { PolicyDocument } from "../components/policy-page/policy-page.tsx";

export const privacyPolicy: PolicyDocument = {
  title: "Privacy Policy",
  effectiveDate: "2026-10-24",
  description: "What stays in your browser and what happens when you connect to other services.",
  sections: [
    {
      id: "about-this-policy",
      title: "About this policy",
      content: (
        <p>
          Genomewalk is a free educational website for exploring genome files. This policy covers
          opening a file, using the public sample, following source links, and contacting
          Genomewalk. No account is needed.
        </p>
      ),
    },
    {
      id: "your-genome-file-and-results",
      title: "Your genome file and results",
      content: (
        <>
          <p>You must be at least 18 years old to use the personal genome tools.</p>
          <p>
            Genomewalk reads and compares your file with public reference data within your browser.
            Your file, genotypes, and generated results are not uploaded for analysis.
          </p>
        </>
      ),
    },
    {
      id: "public-samples-and-reference-downloads",
      title: "Public samples and reference downloads",
      content: (
        <>
          <p>
            You can use the public genome sample without opening a personal genome file. Genomewalk
            reads parts of that sample as needed and downloads public reference data for the guide
            and results. Small summaries and marker files download whole. For matching, the public
            catalogue is downloaded sequentially and processed in small blocks.
          </p>
          <p>
            These downloads are requests for public data. Genomewalk performs the comparison
            locally; it does not send a list of your variants to any database to generate your
            results.
          </p>
          <p>Your browser may cache website assets and public reference files.</p>
          <p>
            The host can see public-file requests and connection metadata. Catalogue downloads do
            not request byte ranges chosen from your matches. Your genome file and genotype values
            remain in your browser.
          </p>
        </>
      ),
    },
    {
      id: "website-delivery-and-technical-information",
      title: "Website requests",
      content: (
        <>
          <p>
            GitHub Pages hosts Genomewalk, and Cloudflare delivers the website and public files.
            Your browser connects to these services to load them. These requests include technical
            information such as your IP address, the requested address, and browser details. Hosting
            services may keep access and error logs to operate and protect the website. These
            requests do not contain your genome file or results.
          </p>
          <p>
            Cloudflare automatically loads its Web Analytics script on the live website. It measures
            visited pages, referring pages, browser and device information, country-level visit
            counts, and page performance. The standard script does not collect your genome file, its
            filename, genotypes, or generated results; Genomewalk does not add these to analytics
            measurements. See{" "}
            <a
              href="https://developers.cloudflare.com/speed/observatory/rum-beacon/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Cloudflare’s analytics documentation
            </a>
            .
          </p>
          <p>
            Genomewalk also loads fonts from Google Fonts. Google receives these font requests and
            network information such as your IP address. See{" "}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
              Google’s Privacy Policy
            </a>
            .
          </p>
        </>
      ),
    },
    {
      id: "error-reports",
      title: "Usage and technical error reports",
      content: (
        <>
          <p>
            On the live website, Genomewalk uses PostHog to understand which parts of the guide are
            used and to diagnose failures. Usage events record page and chapter visits, choosing a
            personal file or the public sample, whether opening it succeeds, build-choice steps,
            chapter runs, results preparation, and opening educational explanations. These events do
            not include your build selection, the contents of explanations generated from your file,
            or your results.
          </p>
          <p>
            Error reports contain a predefined error code and description, the operation and
            processing stage, the chapter number when relevant, the app version, and locations in
            the app’s code. Reports include the browser name and major version, operating-system
            family, and broad device type when identifiable. File-related errors may include a
            recognized extension, detected format, and approximate size band. They may also include
            fixed categories for the provider recognized in the header, column layout, compression
            type, text encoding marker, and the reading check that failed. Header text, column names
            and data rows are not included. Download failures may include a public resource category
            and HTTP status.
          </p>
          <p>
            Your filename, genome contents, variants, genotypes and results are excluded, along with
            exact file sizes, raw error messages, full user-agent strings and device identifiers.
            Only fixed website paths are recorded; query strings, referring addresses and catalogue
            byte ranges are excluded. Session replay, automatic click recording, logs and
            performance tracing are disabled.
          </p>
          <p>
            A random identifier held in browser memory links events during the current page session.
            It resets when the page reloads; it is not stored in cookies or browser storage to
            recognise you on a later visit. PostHog receives ordinary network information such as
            your IP address when your browser connects. Genomewalk disables IP-based location
            enrichment and configures PostHog to discard IP addresses from stored events. See{" "}
            <a href="https://posthog.com/privacy" target="_blank" rel="noopener noreferrer">
              PostHog’s Privacy Policy
            </a>
            .
          </p>
        </>
      ),
    },
    {
      id: "external-source-links",
      title: "External source links",
      content: (
        <p>
          Opening an external source link takes you to another website. The link may identify the
          gene, variant, condition, or publication you are viewing; that site also receives your IP
          address and other request information. Its privacy policy applies. Reading your results
          does not require opening these links.
        </p>
      ),
    },
    {
      id: "contact-and-support",
      title: "Email and privacy requests",
      content: (
        <>
          <p>
            If you email Genomewalk, your email address, message, and any attachments are received
            through Gmail. This is separate from opening a genome file on the site. We use these
            messages to respond to your enquiry and keep them as needed to handle it and any
            follow-up. Gmail is covered by{" "}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
              Google’s Privacy Policy
            </a>
            .
          </p>
          <p>
            You can use the email below to ask privacy questions or request access, correction, or
            deletion of information you have sent us. Genomewalk cannot retrieve a local genome
            session or results it has never received.
          </p>
        </>
      ),
    },
    {
      id: "changes-to-this-policy",
      title: "Changes to this policy",
      content: <p>We will update the date on this page when this policy changes.</p>,
    },
  ],
};

export const termsOfUse: PolicyDocument = {
  title: "Terms of Use",
  effectiveDate: "2026-09-29",
  description: "Using Genomewalk as a free educational guide, including its medical limitations.",
  sections: [
    {
      id: "about-genomewalk",
      title: "About Genomewalk",
      content: (
        <p>
          Genomewalk is a free educational guide to genome files. It offers guided chapters, a
          public sample, and comparisons with selected reference data and published research. These
          Terms explain how to use the guide and the limits of its results.
        </p>
      ),
    },
    {
      id: "your-file-and-privacy",
      title: "Using a genome file",
      content: (
        <>
          <p>
            You must be at least 18 years old to use the personal genome tools. Use your own file or
            a file you have explicit permission to analyse.
          </p>
          <p>
            File analysis runs within your browser. Read the{" "}
            <Link to="/privacy">Privacy Policy</Link> for details about local results, website
            requests, source links, and email.
          </p>
        </>
      ),
    },
    {
      id: "medical-disclaimer",
      title: "Medical disclaimer",
      content: (
        <>
          <p>
            Genomewalk provides education, not medical advice, diagnosis, treatment, genetic
            counselling, or a clinical genetic test. Results may be incomplete, uncertain, or
            incorrect. A match does not establish that you have or will develop a condition; no
            match does not rule one out.
          </p>
          <p>
            Do not change medication or make medical or reproductive decisions based on Genomewalk
            results. Discuss potentially important findings with a qualified healthcare
            professional.
          </p>
        </>
      ),
    },
    {
      id: "what-results-can-and-cannot-tell-you",
      title: "What results can and cannot tell you",
      content: (
        <>
          <p>
            Genomewalk checks selected records, not every possible genetic finding. Results depend
            on the file’s quality, reference build, and contents, as well as the reference data
            used. Databases and studies can contain errors, conflicting interpretations, or
            information that has changed. A missing record in your file does not necessarily
            establish the bases at that position.
          </p>
          <p>
            Population frequencies and research associations do not determine an individual’s health
            or treatment needs. The public sample’s results describe that sample, not you.
          </p>
        </>
      ),
    },
    {
      id: "website-use-software-licenses-and-external-sources",
      title: "Sources and reuse",
      content: (
        <p>
          Reference data, publications, and third-party software have their own licenses and terms.
          Free access to Genomewalk does not change those permissions or grant ownership of its code
          or content. Any reuse must respect applicable rights and licenses.
        </p>
      ),
    },
    {
      id: "free-access-and-availability",
      title: "Availability and updates",
      content: (
        <>
          <p>
            Genomewalk is provided as available, without a guarantee that it will be error-free or
            work with every file or browser. Features and reference data may change, and access may
            be interrupted.
          </p>
          <p>
            We will update the date on this page when these Terms change. Nothing in these Terms
            limits rights that applicable law protects.
          </p>
        </>
      ),
    },
  ],
};
