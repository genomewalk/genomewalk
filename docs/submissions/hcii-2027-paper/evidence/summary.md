# Matching correctness: hg002

Status: **PASS**. 1/1 samples passed.

| Sample | Expected results | Actual results | All fields and order match | Status |
| --- | ---: | ---: | --- | --- |
| HG002 | 426 | 426 | Yes | PASS |

Matching correctness only: the production VCF matcher is checked against a simple local reference join using the same catalogue and input rules. Every result field and array order must agree. Shared parsing and annotation helpers are covered separately by unit tests; this is not independent clinical validation.

These public samples are expected to have matches. Zero expected results, any mismatch, an unreadable input, or failed catalogue validation fails the run.

Commit: `94b10b61240596bf5092ba25d892e9c99ba82a8f`. Working tree: modified.

- HG002: [HG002_GRCh38_v5.0q_smvar.vcf.gz](https://ftp-trace.ncbi.nlm.nih.gov/ReferenceSamples/giab/release/AshkenazimTrio/HG002_NA24385_son/v5.0q/HG002_GRCh38_v5.0q_smvar.vcf.gz) — Ashkenazim trio child; bundled v5.0q teaching sample.

report.json records public input provenance, catalogue/metadata checksums and expected/actual result digests. Digests sort object keys while preserving array order. Temporary sample downloads are removed after each check; bundled files are reused.
