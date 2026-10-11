# Consumer DNA experience

`src/experiences/consumer-dna/` contains the complete optional experience:

| File                                    | Purpose                                                          |
| --------------------------------------- | ---------------------------------------------------------------- |
| `index.ts`                              | Reader registration, own session initialization and page loading |
| `reader.ts`, `reader/`, `containers.ts` | Provider profiles and bounded TXT, ZIP and gzip reading          |
| `chapter-page.tsx`, `results-panel.tsx` | Independent chapter and results pages                            |
| `chapters.ts`                           | Consumer chapter dispatch and teaching content                   |
| `engine/`                               | Own chapter registry, state, matching, counts and result views   |
| `consumer.css`                          | Scoped consumer-only styling                                     |
| `consumer.test.ts`, `fixtures/`         | Synthetic tests and browser fixtures                             |

Chapter titles match the VCF experience. The pages and processing are separate;
consumer support cannot override a VCF chapter function.

## Synthetic fixtures

The tiny [23andMe fixture](../src/experiences/consumer-dna/fixtures/23andme-synthetic.txt)
and [AncestryDNA fixture](../src/experiences/consumer-dna/fixtures/ancestry-synthetic.txt)
exercise reader and browser flows. They contain invented calls and do not describe
a real person. Never replace them with personal exports. Keep these files with
the optional experience so removing it also removes its browser fixtures.

## Supported profiles

23andMe requires `rsid`, `chromosome`, `position`, `genotype` columns and the
original provider header. Its declared build must be 37 or 38 for matching.
AncestryDNA uses `rsid`, `chromosome`, `position`, `allele1`, `allele2`. When its
header omits build/strand, the documented export profile supplies forward GRCh37;
the UI identifies that provenance. Explicit conflicting, reversed or unsupported
metadata disables matching. No coordinates are lifted between assemblies.

Sources reviewed for this implementation:

- [23andMe: accessing raw genetic data](https://support.23andme.org/hc/en-001/articles/42965156401687-Accessing-Your-Raw-Genetic-Data)
- [AncestryDNA: downloading DNA data](https://ancestry.my.site.com/FrCa/articles/en_US/Support_Site/Downloading-DNA-Data)
- [ClinVar: variant representation](https://www.ncbi.nlm.nih.gov/clinvar/docs/ftp_primer/)

These are specific format profiles, not a guarantee of every historical or future
provider export. Unknown files fail with a useful error instead of being guessed.

`--`, `00` and N encodings preserve missing alleles. I/D codes remain counted but
are not converted to sequence variants. Ancestry 23 and 24 map to X and Y; other
unrecognized chromosome codes are retained rather than assigned a guessed
meaning. Consumer catalogue interpretation excludes sex chromosomes, mitochondrial
calls, one-letter calls and indel codes. Both alleles at a supported site must be
A/C/G/T. No genotype is inferred from a missing row.

Duplicate rows are counted separately from distinct sites. Agreeing calls are
combined; allele order does not matter. If calls differ (including a called row
paired with a missing or I/D-coded row), the site is omitted from the displayed
ClinVar results and no personal reading is assigned in the gnomAD examples.
The results page reports how many candidate sites were omitted. These records
remain in the file counts; a difference between call encodings is not necessarily
a contradiction between measurements. Heterozygosity is descriptive of the
exported panel only and is omitted from the summary when records conflict.

Chapter 4 shares a responsive chromosome illustration gallery and disclosure styles
with VCF. The gallery shows exact counts beneath banded chromosome symbols; height
follows the count, with a small minimum for legibility, rather than physical DNA
length. MT uses a circular symbol. Explanations start collapsed, and chromosomes
with no reported rows stay visible with a zero count. Extra provider chromosome
codes remain visible. Consumer counts include all reported rows; VCF counts remain
passing variant rows. Unavailable or uncalculated
features have no placeholder disclosures.

The genetic-sex disclosure appears only for a clear X/Y call pattern. GRCh37 and
GRCh38 select the intervals between PAR1 and PAR2 on both chromosomes; unknown,
conflicting and unsupported builds produce no estimate. Complete A/C/G/T calls
are counted at distinct sites, agreeing repeats count once, and conflicting sites
are excluded. Missing, partial and I/D calls are not usable DNA evidence. Two
different letters on non-PAR Y count as inconsistent evidence, not a valid Y call.
Both views share the same short introductory paragraph and XX/XY strand diagram.
The paragraph explains one X for an XY estimate and two X chromosomes for an XX
estimate; the diagram highlights the corresponding pair.
Consumer examples use letters (AG, AA), while VCF examples use genotype codes
(0/1, 1/1). The distinct X-site counts and Y evidence follow the diagram.
Single-letter calls remain distinct from matching pairs, and the estimate label
stays tentative.

This is an educational heuristic, not PLINK's frequency-based F statistic or a
validated clinical classifier. Its guardrails require at least 200 called X sites,
an X call rate of at least 80%, called X sites spanning at least 20 Mb, and at
least 100 reported Y sites spanning 5 Mb. An XY estimate additionally requires at
most 1% differing X calls, at least 50 usable Y calls spanning 5 Mb, at least a
10% Y call rate, and at most 1% differing calls among complete Y calls. An XX
estimate requires at least 10% differing X calls, no single-letter X calls, and
no complete Y calls. Intermediate or discordant patterns stay unresolved and
have no placeholder disclosure. These thresholds have not been calibrated for
every provider/chip or population and must not be presented as a confidence score
or a chromosome count. No reference sequence download or extra file scan is needed.

Coordinate sources: [PLINK X boundaries](https://www.cog-genomics.org/plink/2.0/data#split_par),
[Ensembl GRCh37 Y](https://grch37.ensembl.org/info/genome/genebuild/assembly.html),
[Ensembl GRCh38 Y](https://www.ensembl.org/info/genome/genebuild/human_PARS.html).

Chapter 3 samples up to 50,000 rows for an annotated diagram of actual row types.
Callouts open matching collapsible explanations. Provider column names, original
row numbers, repeated addresses and call values are preserved. Unavailable
example types are omitted; no example rows are invented. On narrow screens,
explanations sit above their rows and reasons sit below them. A check means the
row meets the matching rules, not that a catalogue entry was found.

Chapter 4 performs the full count independently of that preview. It distinguishes
rows from sites and explains eligibility, missing calls and coded alleles in
collapsed summaries. Agreeing repeats combine into one result; differing records
at a candidate site are omitted from results. Preview caches never substitute
for full-file statistics.

## Coordinate matching and rsID cross-checks

The separate `lookup/` module loads `/ref/consumer-dna/<build>/rsids.json.gz`.
It checks the source-file hash before using the lookup with a catalogue or marker
file. Requests are for fixed public files; no personal rsIDs or genotypes are
sent to an API.

The file's build, chromosome and position select **all** candidate alleles.
Complete reported letters must fit those candidates, and a ClinVar result requires
the alternate allele to be reported. Internal or unindexed IDs do not prevent a
coordinate match. An rsID mapping that lists only some alleles at the same position
does not exclude the other coordinate candidates.

If an indexed rsID points only to other locations, the record is withheld rather
than relocated or interpreted at either location. “Needs review” shows the file
row and both locations, separate from the matched-result counts. This is an
identity disagreement, not an additional health finding. Both the results and
gnomAD example views use this rule; selecting a new file clears these issues.
Multiple carried alleles can produce separate results. Duplicate checks include
every row at a candidate position, even if its rsID or ploidy prevents it from
matching on its own. Frequencies remain attached to exact
matched alleles, not to an rsID in isolation. The VCF experience is unchanged.

This remains forward-strand GRCh37/GRCh38 matching. The index does not guess
unknown builds, flip strands, lift coordinates, or interpret I/D encodings.
Only supplied, attributed merge mappings can resolve retired IDs; none are
added to the initial shipped sidecars. See the [builder documentation](../scripts/README.md#consumer-rsid-lookups).

## Removing the feature

1. Replace all of `src/experiences/optional.ts` with:

   ```ts
   import type { Experience } from "./types.ts";
   export const optionalExperiences: Experience[] = [];
   ```

2. Delete `src/experiences/consumer-dna/` to remove the pages, logic, tests and
   fixtures. Delete `scripts/consumer/` and `public/ref/consumer-dna/` as well;
   the existing build and validation commands automatically skip the absent
   consumer stage. No VCF source file or route needs editing.
3. Run `npm run check`. Test discovery skips absent optional folders. The picker
   automatically describes and accepts only VCF files.
4. Update the supported-file list in README if publishing that VCF-only edition.

The declared `fflate` dependency remains required by the shared browser BGZF
reader and the offline reference reader. Keep `src/lib/` when removing an experience.

## Adding a provider

Add a verified header/schema profile and synthetic fixtures before adding its
name to the picker. Check build, strand, chromosome aliases, missing calls,
haploid conventions and I/D representation. Test compressed and plain exports,
contradictory metadata and duplicate sites. Never add a person's real file to
tests. Ethnicity estimates and relative matching require a separate design.
