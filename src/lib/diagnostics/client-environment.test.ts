import assert from "node:assert/strict";
import test from "node:test";
import { getClientEnvironment, browserNames, osNames, deviceTypes } from "./client-environment.ts";

test("classifies common browsers and desktop operating systems with major versions only", () => {
  for (const [userAgent, browser, version, os] of [
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0.7390.108 Safari/537.36",
      "Chrome",
      "141",
      "Windows",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0.0.0 Safari/537.36 Edg/141.0.3537.71",
      "Edge",
      "141",
      "Windows",
    ],
    [
      "Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0",
      "Firefox",
      "142",
      "Linux",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15",
      "Safari",
      "18",
      "macOS",
    ],
    [
      "Mozilla/5.0 (X11; CrOS x86_64 16371.17.0) AppleWebKit/537.36 Chrome/141.0.0.0 Safari/537.36",
      "Chrome",
      "141",
      "Chrome OS",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/141.0.0.0 Safari/537.36 OPR/122.0.0.0",
      "Opera",
      "122",
      "Windows",
    ],
    [
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/141.0.0.0 Safari/537.36",
      "Chrome",
      "141",
      "Linux",
    ],
  ] as const) {
    assert.deepEqual(getClientEnvironment({ userAgent }), {
      browser_name: browser,
      browser_major: version,
      os_name: os,
      device_type: "desktop",
    });
  }
});

test("recognizes mobile browsers without leaking model or OS version", () => {
  for (const [userAgent, browser, version, os] of [
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1",
      "Safari",
      "18",
      "iOS",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 CriOS/141.0.7390.96 Mobile/15E148 Safari/604.1",
      "Chrome",
      "141",
      "iOS",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 FxiOS/142.0 Mobile/15E148 Safari/605.1.15",
      "Firefox",
      "142",
      "iOS",
    ],
    [
      "Mozilla/5.0 (Linux; Android 15; PRIVATE_MODEL) AppleWebKit/537.36 Chrome/141.0.0.0 Mobile Safari/537.36 EdgA/141.0.0.0",
      "Edge",
      "141",
      "Android",
    ],
    [
      "Mozilla/5.0 (Linux; Android 15; PRIVATE_MODEL) AppleWebKit/537.36 SamsungBrowser/29.0 Chrome/136.0.0.0 Mobile Safari/537.36",
      "Samsung Internet",
      "29",
      "Android",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 OPiOS/5.3.1 Mobile/15E148 Safari/605.1.15",
      "Opera",
      "5",
      "iOS",
    ],
  ] as const) {
    assert.deepEqual(getClientEnvironment({ userAgent }), {
      browser_name: browser,
      browser_major: version,
      os_name: os,
      device_type: "mobile",
    });
  }
});

test("classifies tablets, including the iPad desktop user-agent", () => {
  const mac =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15";
  assert.equal(getClientEnvironment({ userAgent: mac, maxTouchPoints: 5 }).os_name, "iOS");
  assert.equal(getClientEnvironment({ userAgent: mac, maxTouchPoints: 5 }).device_type, "tablet");
  assert.equal(getClientEnvironment({ userAgent: mac, maxTouchPoints: 0 }).device_type, "desktop");
  assert.equal(getClientEnvironment({ userAgent: mac, maxTouchPoints: Infinity }).os_name, "macOS");
  assert.equal(
    getClientEnvironment({
      userAgent:
        "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1",
    }).device_type,
    "tablet",
  );
  assert.equal(
    getClientEnvironment({
      userAgent:
        "Mozilla/5.0 (Linux; Android 15; PRIVATE_MODEL) AppleWebKit/537.36 Chrome/141.0.0.0 Safari/537.36",
    }).device_type,
    "tablet",
  );
  assert.equal(getClientEnvironment({ userAgent: "Android TV" }).device_type, "unknown");
});

test("unknown environments stay coarse and empty/server input has no inferred device", () => {
  const unknown = { browser_name: "Unknown", os_name: "Unknown", device_type: "unknown" };
  assert.deepEqual(getClientEnvironment({}), unknown);
  assert.deepEqual(getClientEnvironment({ userAgent: "" }), unknown);
  assert.deepEqual(getClientEnvironment(), unknown);
  assert.deepEqual(getClientEnvironment({ userAgent: "PRIVATE_DEVICE PRIVATE_NAME" }), {
    browser_name: "Other",
    os_name: "Other",
    device_type: "unknown",
  });
});

test("only reviewed labels and bounded major versions can leave the classifier", () => {
  const secret = "PRIVATE_PERSON_ID_GENOME";
  for (const version of ["0", "0001", "1000", "999999999999", `141.${secret}`, `141-${secret}`]) {
    const result = getClientEnvironment({
      userAgent: `Chrome/${version} ${secret} Android Mobile ${secret}`,
    });
    assert.equal(result.browser_major, undefined);
    assert.ok(!JSON.stringify(result).includes(secret));
    assert.ok(browserNames.includes(result.browser_name));
    assert.ok(osNames.includes(result.os_name));
    assert.ok(deviceTypes.includes(result.device_type));
    assert.deepEqual(Object.keys(result).sort(), ["browser_name", "device_type", "os_name"]);
  }
  assert.equal(getClientEnvironment({ userAgent: "Chrome/999.0.0" }).browser_major, "999");
  assert.equal(
    getClientEnvironment({ userAgent: `Chrome/141.2.3 ${secret}` }).browser_major,
    "141",
  );
});
