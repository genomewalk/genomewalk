# Result evidence and provenance

Genomewalk's result summaries are reading aids, not clinical classifications.
Citation provenance reviewed 4 October 2026.

## Build the reference files

Run `npm run data:citations`, then `npm run data:catalog -- --build GRCh38`
and `npm run data:catalog -- --build GRCh37`. `npm run data:build` includes these
steps and validates the finished indexes. See [README.md](README.md) for prerequisites.
The VCF release date and XML `ReleaseDate` describe different source snapshots,
retained internally for reproducibility and omitted from the user interface.
Use `--fresh` with the citation downloader to refresh the XML and its extracted
citation lists together.

Catalogues preserve VariationID, AlleleID, all distinct condition labels,
CLNSIG, CLNREVSTAT, rsIDs, HGVS, germline-classification PubMed citations, release date, citation-source date,
CLNSIGCONF and the GRCh38 gnomAD source key. The original first twelve columns remain
compatible with previous readers. GRCh37 frequencies are linked by ClinVar AlleleID to
the GRCh38 gnomAD v4.1 record, and the outbound link uses that source coordinate.

The appended `conditionmedgenids` column preserves MedGen identifiers from CLNDISDB,
paired with CLNDN before filtering or deduplicating names. Its pipe-separated groups
align with `conditions`; commas separate multiple identifiers for a name. Expanded
condition names link directly to NCBI MedGen when there is one unambiguous identifier.
Missing, misaligned or multi-concept references remain plain text. These links are
generated from source identifiers, with no hand-maintained condition mapping or
runtime lookup of the user's results. Variant-specific ClinVar links remain in Sources.

Sources:

- https://www.ncbi.nlm.nih.gov/clinvar/docs/ftp_primer/
- https://www.ncbi.nlm.nih.gov/clinvar/docs/review_status/
- https://ftp.ncbi.nlm.nih.gov/pub/clinvar/xml/ClinVarVCVRelease_00-latest.xml.gz

PubMed references are attached by exact ClinVar VariationID, using only the direct
`Citation/ID[@Source="PubMed"]` children of the XML aggregate
`ClassifiedRecord/Classifications/GermlineClassification`. This matches the scope
of ClinVar's germline citations table. Assertion-method references, condition-level
citations and text-mined references are separate source fields and are not merged
into this list. No paper-specific exclusions are applied. Counts represent unique
PubMed IDs in our source snapshot, not a count of independent experiments or proof
of a personal finding. No automatic personal interpretation is generated from
these citation lists. The citation download is bulk public data, never a query of
an uploaded genome.

## Automatic categories and concise results

`src/experiences/vcf/engine/result-evidence.ts` derives categories from the preserved ClinVar
classification labels. It has no gene, rsID or exact-variant exception list:

- Disease evidence: retained pathogenic, likely pathogenic and conflicting classes.
- Drug response: `drug_response`.
- Traits: `Affects`, ClinVar's term for a non-disease phenotype.
- Associations: risk-factor, risk-allele, association and protective labels.
- Other records: remaining retained classes.

See https://www.ncbi.nlm.nih.gov/clinvar/docs/clinsig/ for the vocabulary.
Categories can overlap; All results remains one row per variant. This is the
selected catalogue, not all ClinVar: benign and uncertain-significance records
are excluded by the catalogue builder. No comprehensive trait coverage or
inheritance classification is inferred from condition/gene names.

The separate cited examples in chapter 7 still use `markers.json`. They are no
longer merged into Your results. Results only report carried alternate alleles
matched to the catalogue. Missing lines and reference blocks do not add results.
Incomplete or contradictory calls remain flagged, and duplicate records remain
merged by chromosome, position, reference and alternate allele.

The simpler detail table shows Bottom line, You & ClinVar, Conditions, Trust,
Frequency, and Sources. The combined row shows the called allele(s) alongside the
exact matched ClinVar allele and classification; missing/conflicting calls stay explicit. ClinVar and PubMed links come from the catalogue. Technical
release/index dates remain in the catalogue for provenance and are not displayed.
Expanded result and chapter containers share the same vertical spacing.
The population figures show allele-copy percentages. Very small non-zero values
retain a minimum visual fill, disclosed next to the figures; the printed number
is authoritative. Missing frequencies are not drawn as zero.

The consumer experience owns a separate copy of its evidence renderer.
