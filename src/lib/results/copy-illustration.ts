/** Decorative chromosome copies; the adjacent label supplies accessible text. */
export function copyIllustration(call: {
  copies: number;
  ploidy: number | null;
  partialCall: boolean;
  conflictingRecords?: boolean;
}): string {
  if (
    call.partialCall ||
    call.conflictingRecords ||
    (call.ploidy !== 1 && call.ploidy !== 2) ||
    !Number.isInteger(call.copies) ||
    call.copies < 1 ||
    call.copies > call.ploidy
  )
    return "";

  const chromosome = '<path d="M16 10 C28 36 28 60 16 86"/><path d="M44 10 C32 36 32 60 44 86"/>';
  const paired = call.ploidy === 2;
  return `<svg class="mh-copies" viewBox="0 0 ${paired ? 132 : 60} 96" width="${paired ? 36 : 16}" height="26" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="14" stroke-linecap="round">
    <g>${chromosome}</g>
    ${paired ? `<g transform="translate(72 0)" opacity="${call.copies === 2 ? 1 : 0.2}">${chromosome}</g>` : ""}
  </svg>`;
}
