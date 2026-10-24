/** Coarse, best-effort diagnostics only. Never return the original user-agent string. */
export const browserNames = [
  "Chrome",
  "Edge",
  "Firefox",
  "Safari",
  "Opera",
  "Samsung Internet",
  "Other",
  "Unknown",
] as const;
export const osNames = [
  "Windows",
  "macOS",
  "iOS",
  "Android",
  "Linux",
  "Chrome OS",
  "Other",
  "Unknown",
] as const;
export const deviceTypes = ["desktop", "mobile", "tablet", "unknown"] as const;

export interface ClientEnvironment {
  browser_name: (typeof browserNames)[number];
  browser_major?: string;
  os_name: (typeof osNames)[number];
  device_type: (typeof deviceTypes)[number];
}

interface ClientEnvironmentInput {
  userAgent?: string;
  maxTouchPoints?: number;
}

export function getClientEnvironment(input?: ClientEnvironmentInput): ClientEnvironment {
  const source =
    input ?? (typeof window !== "undefined" && typeof navigator !== "undefined" ? navigator : {});
  const ua = typeof source.userAgent === "string" ? source.userAgent : "";
  const ipad =
    /\biPad\b/i.test(ua) ||
    (/\bMacintosh\b/i.test(ua) &&
      typeof source.maxTouchPoints === "number" &&
      Number.isFinite(source.maxTouchPoints) &&
      source.maxTouchPoints > 1);
  const os: ClientEnvironment["os_name"] = !ua
    ? "Unknown"
    : ipad || /\b(?:iPhone|iPod)\b/i.test(ua)
      ? "iOS"
      : /\bWindows\b/i.test(ua)
        ? "Windows"
        : /\bAndroid\b/i.test(ua)
          ? "Android"
          : /\bCrOS\b/i.test(ua)
            ? "Chrome OS"
            : /\b(?:Macintosh|Mac OS X)\b/i.test(ua)
              ? "macOS"
              : /\bLinux\b/i.test(ua)
                ? "Linux"
                : "Other";
  const device: ClientEnvironment["device_type"] =
    ipad || /\bTablet\b/i.test(ua)
      ? "tablet"
      : /\b(?:iPhone|iPod|Mobile|Windows Phone)\b/i.test(ua)
        ? "mobile"
        : os === "Android"
          ? /\b(?:TV|Watch)\b/i.test(ua)
            ? "unknown"
            : "tablet"
          : ["Windows", "macOS", "Linux", "Chrome OS"].includes(os)
            ? "desktop"
            : "unknown";
  const browsers: [ClientEnvironment["browser_name"], RegExp][] = [
    ["Edge", /\b(?:Edg|EdgA|EdgiOS|Edge)\/([^\s;]+)/i],
    ["Opera", /\b(?:OPR|OPiOS)\/([^\s;]+)/i],
    ["Samsung Internet", /\bSamsungBrowser\/([^\s;]+)/i],
    ["Firefox", /\b(?:Firefox|FxiOS)\/([^\s;]+)/i],
    ["Chrome", /\b(?:Chrome|CriOS|HeadlessChrome)\/([^\s;]+)/i],
    ["Safari", /\bVersion\/([^\s;]+).*\bSafari\//i],
  ];
  for (const [browser, pattern] of browsers) {
    const version = pattern.exec(ua)?.[1];
    if (!version) continue;
    // Reject malformed/oversized versions; only the major number may leave the browser.
    const major = /^([1-9]\d{0,2})(?:\.\d+)*$/.exec(version)?.[1];
    return {
      browser_name: browser,
      ...(major ? { browser_major: major } : {}),
      os_name: os,
      device_type: device,
    };
  }
  return {
    browser_name: ua ? "Other" : "Unknown",
    os_name: os,
    device_type: device,
  };
}
