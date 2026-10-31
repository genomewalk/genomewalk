# Genomewalk whitepaper

`genomewalk-whitepaper.tex` is the self-contained manuscript. It contains the
architecture, offline-build and byte-range diagrams and bibliography, with no external LaTeX assets or bibliography build.
Local PDF exports belong in `output/pdf/` at the repository root, which is ignored
by Git. The existing `genomewalk-whitepaper.pdf` can be kept there for reference;
a fresh checkout contains the manuscript source, not that generated export.

The manuscript uses a neutral two-column conference format. The revision removes
the separate cover page, forced section breaks and repeated explanations, reducing
the text by about one third. It includes architecture and byte-range diagrams,
related work, implementation methods, preliminary measurements and limitations.
Before submission, apply the chosen venue's
template and check its page limit, anonymisation and disclosure requirements.

[Open the editable Prism project](https://prism.openai.com/?u=51daea6e-75a6-47ab-b407-dafa5f59234e&pg=1&m=main.tex).
Access follows the project's existing workspace permissions; this is not a
public share link. The manuscript is called `main.tex` in Prism. The local and
Prism copies are separate revisions; edits do not synchronise automatically.

Open the local `.tex` file in Codex's LaTeX editor to edit and compile it, or edit
`main.tex` in Prism and use **Download PDF**. For a fresh Prism import, put the
source into a ZIP as `main.tex` and choose **Import archive**. No genome files,
catalogue datasets or credentials belong in the manuscript project.

The manuscript describes an earlier retrieval architecture and its measurements.
It has not been revised for the current streaming matcher. The historical
benchmark report files have been removed; the current [benchmark](../BENCHMARKS.md)
checks matching correctness only and does not reproduce the manuscript's transfer
comparisons. Revise the paper and its evidence before submission.
