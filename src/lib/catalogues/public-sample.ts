import { HttpRangeSource } from "../io/http-range.ts";

// Public NIST GIAB HG002 v5.0q; a user's selected file never uses this URL.
export const SAMPLE = {
  url: "/samples/HG002_GRCh38.vcf.gz",
  name: "HG002_GRCh38_v5.0q_smvar.vcf.gz",
  label: "HG002",
  size: "42 MB",
  bytes: 42_067_644,
};

export function publicSampleSource() {
  return new HttpRangeSource(SAMPLE.url, SAMPLE.name, SAMPLE.bytes);
}
