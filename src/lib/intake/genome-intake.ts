export function chooseGenomeFile<T extends { name: string }>(files: Iterable<T> | ArrayLike<T>) {
  const list = Array.from(files);
  if (list.length === 1) return list[0]!;
  const genomes = list.filter((file) => /\.vcf\.(gz|bgz)$/i.test(file.name));
  if (genomes.length === 1) {
    const genome = genomes[0]!;
    const companions = new Set([`${genome.name}.tbi`, `${genome.name}.csi`]);
    if (list.every((file) => file === genome || companions.has(file.name))) return genome;
  }
  throw new Error("Choose one DNA file at a time. A VCF can be accompanied by its index file.");
}

// A new choice or route change cancels the previous import. Even readers that
// cannot stop immediately must pass isCurrent before committing their result.
export function createIntakeRequests() {
  let current: AbortController | null = null;
  return {
    begin() {
      current?.abort();
      current = new AbortController();
      return current;
    },
    isCurrent(request: AbortController) {
      return current === request && !request.signal.aborted;
    },
    cancel() {
      current?.abort();
      current = null;
    },
  };
}
