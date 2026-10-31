console.log(`Genomewalk public reference data

Run from the project root; options follow npm's -- separator.

  npm run data:plan       Show the ordered build stages; no writes or requests
  npm run data:inputs     Check that this cache is ready for an offline rebuild
  npm run data:build      Build both references, reuse inputs, then validate
  npm run data:rebuild    Rebuild using cached inputs only; never use the network
  npm run data:refresh    Download fresh inputs and rebuild public assets
  npm run data:consumer   Rebuild only consumer rsID indexes from public assets
  npm run data:metadata   Rebuild compact summaries from existing catalogues
  npm run data:publications  Build citation labels; reuse cached PubMed metadata
  npm run data:check      Validate all existing public assets; no network or writes
  npm run test:data       Exercise the pipeline with small synthetic inputs

Individual stages: data:download, data:citations, data:frequencies,
                   data:catalog, data:markers, data:publications

Examples:
  npm run data:plan -- --only GRCh37
  npm run data:build -- --jobs 4
  npm run data:rebuild -- --data-dir ./data --out-dir /tmp/genomewalk-ref
  npm run data:catalog -- --build GRCh38
  npm run data:markers -- --help

A fresh build can take an hour or more. App development uses the shipped assets.
No command deploys the site. See scripts/README.md for prerequisites and outputs.
`);
