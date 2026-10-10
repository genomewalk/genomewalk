export const normChrom = (c: string) => {
  const x = String(c).replace(/^chr/i, "");
  return x === "M" ? "MT" : x;
};

export const varKey = (chrom: string, pos: string | number, ref: string, alt: string) =>
  `${normChrom(chrom)}:${pos}:${ref}:${alt}`;

export const gtIdx = (f: string[]) =>
  ((f[9] || "").split(":")[0] || "")
    .split(/[/|]/)
    .filter((x) => x !== "" && x !== ".")
    .map(Number);
