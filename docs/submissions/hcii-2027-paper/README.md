# Genomewalk — HCII 2027 poster short paper

Expanded 10-page working draft prepared using the official Springer computer-science proceedings LaTeX template, version 2.25 (3 September 2026). The same template covers CCIS. This is the current Genomewalk paper and replaces the earlier generic whitepaper, which described the retired byte-range retrieval design.

## Files

- `main.tex`: editable manuscript, with references included at the end.
- `Genomewalk-HCII-2027-Short-Paper.pdf`: verified 10-page PDF.
- `llncs.cls` and `splncs04.bst`: unmodified official Springer files. The bibliography is currently inline; the supplied style is available if it is later moved to BibTeX.
- `figures/`: nine full desktop chapter screenshots, their capture manifest, and the editable TikZ source and vector PDF of the processing diagram.
- `evidence/report.json`: the public-sample correctness run supporting the paper.
- `evidence/summary.md`: concise description of that run.

Author: Neville Mehta, Independent Researcher, United States. Correspondence: genomewalk123@gmail.com. No ORCID has been invented. The title follows the poster proposal.

This is a draft for author review, not an acceptance notice or completed conference submission. Confirm any conference-specific instructions supplied after acceptance before uploading the final source and PDF. No upload, registration, or payment was performed when preparing this paper.

## Build and editing

Open `main.tex` or this directory in the Codex LaTeX editor. Alternatively, upload the source ZIP as an Overleaf project and choose `main.tex` as the main document.

With a current TeX distribution including `newtx`, `txfonts`, `float`, `wrapfig`, and `hyperref`, run from this directory:

```sh
pdflatex -interaction=nonstopmode -halt-on-error main.tex
pdflatex -interaction=nonstopmode -halt-on-error main.tex
```

The source keeps the template's default page geometry and type sizes. The PDF was exported with pdfLaTeX, all fonts embedded, and checked page by page. The built-in document compiler also successfully checked the source. Font-package or compiler versions can change line breaks. This expanded draft is ten pages. Each chapter screenshot occupies half the text width on the right, with its description wrapping alongside and, where long enough, beneath the image and caption. Chapter descriptions and screenshots are kept together without forced chapter page breaks. Ragged-bottom page alignment avoids stretched vertical gaps. The chapter descriptions and full-resolution, uncropped screenshot files are unchanged.

## What changed from the existing whitepaper

- Reused the motivation, teaching progression, public-data preparation, matching constraints, and privacy explanation where still applicable.
- Replaced the retired membership-index and selective catalogue byte-range architecture with complete filtered catalogue streaming, a sorted VCF merge join, and the compatibility paths for unsorted VCFs and consumer exports.
- Removed retired download-savings results and the old seven-sample transfer comparison.
- Used the current public HG002 GRCh38 v5.0q sample and a newly run correctness comparison: 426 expected results, 426 actual results, every field and ordering equal.
- Kept software correctness distinct from clinical validation, memory/latency measurement, and usability or learning outcomes.

The catalogue is a selected, enriched ClinVar subset, not the full ClinVar database. Public sample reading may still use HTTP ranges, and offline enrichment may still use Tabix; those are separate from catalogue matching in the browser.

## HCI-focused revision

The manuscript follows this structure: introduction; related applications and design goals; learning experience; public-data preparation and local processing; conclusion and further work. A short HG002 classroom activity closes Section 3, and the software-consistency result is summarized at the end of Section 4.2; the separate walkthrough/verification section and table have been removed. It identifies introductory learners as the primary intended readers and explains the purpose of the interface choices. CyanoHABIT is included as a relevant HCII poster precedent alongside the existing genomics references.

No user study has been conducted. The concluding section states this explicitly; the abstract focuses on the application and learning workflow. The HG002 activity is illustrative, and the 426-result comparison remains a software consistency check rather than evidence of usability, learning gains or clinical validity. The conclusion outlines possible additional chapters, instructor feedback, proposed studies of understanding and an invitation to laboratories, schools and universities to collaborate. The Springer class, fonts, page geometry, title and author formatting, and processing diagram are preserved. Section 3 retains its two-paragraph introduction and now covers each of the nine chapters, with a full desktop screenshot and a short explanation. The `float` and `wrapfig` packages control figure placement and wrapping without changing the template typography.

## Evidence and figures

The correctness run reused the existing bundled sample and local reference assets. It did not download additional personal or benchmark genomes. Run from the repository root:

```sh
npm run benchmark -- --out-dir output/benchmarks/hg002
```

The preserved report records runtime, source state, public input provenance, reference hashes and equality results. It ran on 15 November 2026 UTC (15 November Pacific). The working tree contained pre-existing manuscript edits. It is a one-sample software-consistency check; the production and reference paths share some helpers.

Figures 1–9 are full, uncropped desktop viewport screenshots captured from the locally served application on 16 November 2026 (Pacific), with the public HG002 GRCh38 v5.0q sample selected. They contain no mouse-pointer overlay. The viewport is 1440 CSS pixels wide, which displays the application's maximum 1328-pixel content width. Captures use a device scale factor of two: Chapters 1–8 are 2880 × 2160 PNGs; Chapter 9 is 2880 × 2400. Original PNG files are embedded without downsampling and are included in `figures/chapters/`. The capture manifest records viewport dimensions, scroll position and file hashes.

Chapter 2's opening row is a constructed teaching example, and Chapters 6–8 use illustrative or public catalogue examples; these are not represented as observations in HG002. Chapter 9 is scrolled to the expanded HG002 ATIC/rs4673993 match after searching for that identifier. Chapter 4 shows the expanded SNP/indel breakdown. No screenshot content was altered.

Figure 10 reuses the original whitepaper's three-stage diagram and colours, updated to show complete filtered catalogue streaming rather than an index and selective byte-range requests. It is unchanged in this chapter expansion. Its shapes and icons are drawn in TikZ; the editable source and vector PDF are included. To rebuild it, run `pdflatex figure-2-local-processing.tex` from `figures/` (requires TikZ and TeX Gyre Heros), then rebuild the manuscript.

Acknowledgments and the interests statement are omitted from this working draft at the author's request. Review applicable disclosure requirements before final submission.

## Official instructions and template

- [HCII 2027 posters](https://2027.hci.international/posters.html): accepted-poster extended abstracts are 4–11 pages, typically six, with editable source and PDF. These are separate from the initial proposal.
- [Springer author and editor information](https://link.springer.com/series/558/information-for-authors-and-editors): official proceedings templates, including CCIS.
- [Official LaTeX template ZIP](https://cms-resources.apps.public.k8s.springernature.io/springer-cms/rest/v1/content/27851904/data/LaTeX2e%20Proceedings%20Template%20ZIP).
- [Springer book publishing policies](https://www.springernature.com/gp/policies/book-publishing-policies).

The manuscript abstract is 166 words before keywords, within the template's 150–250-word guidance. All ten figures have captions, in-text references and alternative descriptions. The 426-result consistency check is presented in prose rather than a table.
