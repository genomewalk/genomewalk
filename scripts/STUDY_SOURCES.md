# Study-backed interpretation audit

Reviewed 14 September 2026. Every displayed marker interpretation needs named,
linked research supporting the actual wording. gnomAD supplies frequency
counts; it is not the source of these trait or drug-response interpretations.
The same gate runs during data generation and browser rendering. The ALDH2
story and introductory example are omitted if their source is absent.

| Marker                 | Linked research                                                                                                                                                           | Scope of the displayed interpretation                                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ALDH2, rs671           | [Brooks et al., PLoS Medicine 2009](https://doi.org/10.1371/journal.pmed.1000050)                                                                                         | Research review of reduced enzyme activity, flushing and alcohol-related oesophageal cancer risk. The risk text specifically describes drinking with one copy; the zero-copy reading does not promise that someone never flushes.    |
| HERC2/OCA2, rs12913832 | [Sturm et al., American Journal of Human Genetics 2008](https://doi.org/10.1016/j.ajhg.2007.11.005)                                                                       | Eye-colour association in a largely northern-European cohort. Wording allows brown or intermediate colours for heterozygotes and notes that other variants matter. The paper's reverse-strand T/C corresponds to the dataset's A/G.  |
| ABCC11, rs17822931     | [Yoshiura et al., Nature Genetics 2006](https://doi.org/10.1038/ng1733); [Martin et al., Journal of Investigative Dermatology 2010](https://doi.org/10.1038/jid.2009.254) | The first paper supports wet/dry earwax; the second supports reduced secretion of key underarm odour precursors. Both are linked because these are separate claims.                                                                  |
| VKORC1, rs9923231      | [Sconce et al., Blood 2005](https://doi.org/10.1182/blood-2005-03-1108)                                                                                                   | Association with relative warfarin sensitivity/dose requirements, with other genes, age and body size contributing. Removed the single-marker “standard warfarin dose” conclusion. The paper's G/A corresponds to the dataset's C/T. |
| MCM6/LCT, rs4988235    | [Enattah et al., Nature Genetics 2002](https://doi.org/10.1038/ng826); [Tishkoff et al., Nature Genetics 2007](https://doi.org/10.1038/ng1946)                            | The first paper supports this lactase-persistence association; the second identifies other persistence variants in African populations. Absence of this allele therefore does not establish lactose intolerance.                     |

## Candidates excluded from the published marker data

The base list retains ten candidates without reviewed study citations. They
are not shipped or displayed: ACTN3 rs1815739, CYP1A2 rs762551, FTO rs9939609,
COMT rs4680, CYP2C19 rs4244285 and rs12248560, CYP2C9 rs1057910, SLCO1B1
rs4149056, CYP2D6 rs3892097 and ABO rs8176719. Their candidate wording is not
approved evidence and must be checked before any future inclusion.

ClinVar classifications in the results list are attributed catalogue claims,
with their own review status and source links; they are not presented as these
hand-written study-backed trait readings.
