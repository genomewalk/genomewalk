export const log = (...args: unknown[]) =>
  console.log(new Date().toISOString().slice(11, 19), ...args);

export const mb = (bytes: number | undefined) => (bytes! / 1e6).toFixed(1) + " MB";
