import "server-only";

import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";

import { LANDING_PAGE_DEMO_ID, type RetrievedLandingPage } from "./landing-page-analysis.ts";

export const LANDING_PAGE_RETRIEVAL_LIMITS = {
  timeoutMs: 8_000,
  maxBytes: 1_000_000,
  maxRedirects: 3,
} as const;

export type LandingPageRetrievalErrorCode = "invalid_url" | "blocked_target" | "timeout" | "unreachable" | "too_large" | "unsupported_content" | "http_error" | "invalid_redirect";

export class LandingPageRetrievalError extends Error {
  readonly code: LandingPageRetrievalErrorCode;

  constructor(code: LandingPageRetrievalErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "LandingPageRetrievalError";
  }
}

function isBlockedIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 0) || (a === 192 && b === 88) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0);
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0]!;
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || /^fe[89ab]/.test(normalized) || normalized.startsWith("ff") || normalized.startsWith("2001:db8:") || normalized.startsWith("2001:0:") || normalized.startsWith("2002:")) return true;
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mapped) return isBlockedIpv4(mapped);
  const hexMapped = normalized.match(/::ffff:([\da-f]{1,4}):([\da-f]{1,4})$/);
  if (hexMapped) {
    const high = Number.parseInt(hexMapped[1]!, 16);
    const low = Number.parseInt(hexMapped[2]!, 16);
    return isBlockedIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  return false;
}

export function isPublicIpAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? !isBlockedIpv4(address) : family === 6 ? !isBlockedIpv6(address) : false;
}

export function validateLandingPageUrl(input: string): URL {
  let url: URL;
  try { url = new URL(input); } catch { throw new LandingPageRetrievalError("invalid_url", "Enter a valid absolute http or https URL."); }
  if (url.toString().length > 2_048) throw new LandingPageRetrievalError("invalid_url", "Landing-page URLs must be 2,048 characters or fewer.");
  if (!['http:', 'https:'].includes(url.protocol)) throw new LandingPageRetrievalError("invalid_url", "Only http and https landing-page URLs are accepted.");
  if (url.username || url.password) throw new LandingPageRetrievalError("invalid_url", "URLs containing credentials are not accepted.");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!hostname || hostname.endsWith(".local") || hostname.toLowerCase() === "localhost") throw new LandingPageRetrievalError("blocked_target", "Local and internal network targets are blocked.");
  const expectedPort = url.protocol === "https:" ? "443" : "80";
  if (url.port && url.port !== expectedPort) throw new LandingPageRetrievalError("blocked_target", "Only standard HTTP and HTTPS ports are accepted.");
  if (isIP(hostname) && !isPublicIpAddress(hostname)) throw new LandingPageRetrievalError("blocked_target", "Local and private network targets are blocked.");
  url.hash = "";
  return url;
}

type DnsResolver = (hostname: string, options: { all: true; verbatim: true }) => Promise<Array<{ address: string; family: number }>>;

export async function resolvePublicAddress(hostname: string, resolver: DnsResolver = lookup): Promise<{ address: string; family: 4 | 6 }> {
  hostname = hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(hostname);
  const addresses = literalFamily ? [{ address: hostname, family: literalFamily }] : await resolver(hostname, { all: true, verbatim: true }).catch(() => []);
  if (!addresses.length) throw new LandingPageRetrievalError("unreachable", "The landing-page host could not be resolved.");
  if (addresses.some((item) => !isPublicIpAddress(item.address))) throw new LandingPageRetrievalError("blocked_target", "The landing-page host resolves to a local, private, or reserved network address.");
  const selected = addresses[0]!;
  return { address: selected.address, family: selected.family as 4 | 6 };
}

type RawResponse = { status: number; headers: http.IncomingHttpHeaders; body: Buffer };

export function validateLandingPageResponse(response: RawResponse): void {
  if (response.status < 200 || response.status >= 300) throw new LandingPageRetrievalError("http_error", `The landing page returned HTTP ${response.status}.`);
  if (response.body.length > LANDING_PAGE_RETRIEVAL_LIMITS.maxBytes) throw new LandingPageRetrievalError("too_large", `The response exceeded the ${LANDING_PAGE_RETRIEVAL_LIMITS.maxBytes.toLocaleString()} byte limit.`);
  const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
  if (!/^(text\/html|application\/xhtml\+xml|text\/plain)(?:;|$)/.test(contentType)) throw new LandingPageRetrievalError("unsupported_content", "The response is not HTML or compatible text content.");
  if (!response.body.length) throw new LandingPageRetrievalError("unsupported_content", "The response did not contain page content.");
}

async function requestPinned(url: URL, address: string, timeoutMs: number): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request({
      protocol: url.protocol,
      hostname: address,
      family: isIP(address),
      port: url.protocol === "https:" ? 443 : 80,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      servername: url.hostname,
      headers: {
        Host: url.host,
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
        "User-Agent": "Crush-Landing-Page-Analyzer/1.0 (+read-only; no-js)",
        Connection: "close",
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > LANDING_PAGE_RETRIEVAL_LIMITS.maxBytes) {
          request.destroy(new LandingPageRetrievalError("too_large", `The response exceeded the ${LANDING_PAGE_RETRIEVAL_LIMITS.maxBytes.toLocaleString()} byte limit.`));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    request.setTimeout(timeoutMs, () => request.destroy(new LandingPageRetrievalError("timeout", "The landing page did not respond before the retrieval timeout.")));
    request.on("error", (error) => reject(error instanceof LandingPageRetrievalError ? error : new LandingPageRetrievalError("unreachable", "The landing page could not be retrieved.")));
    request.end();
  });
}

export async function retrieveLandingPage(input: string): Promise<RetrievedLandingPage> {
  const requested = validateLandingPageUrl(input);
  let current = requested;
  const deadline = Date.now() + LANDING_PAGE_RETRIEVAL_LIMITS.timeoutMs;
  for (let redirectCount = 0; redirectCount <= LANDING_PAGE_RETRIEVAL_LIMITS.maxRedirects; redirectCount += 1) {
    const beforeDns = deadline - Date.now();
    if (beforeDns <= 0) throw new LandingPageRetrievalError("timeout", "The landing page did not respond before the retrieval timeout.");
    const resolved = await promiseWithTimeout(resolvePublicAddress(current.hostname), beforeDns);
    const beforeRequest = deadline - Date.now();
    if (beforeRequest <= 0) throw new LandingPageRetrievalError("timeout", "The landing page did not respond before the retrieval timeout.");
    const response = await requestPinned(current, resolved.address, beforeRequest);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirectCount === LANDING_PAGE_RETRIEVAL_LIMITS.maxRedirects) throw new LandingPageRetrievalError("invalid_redirect", "The landing page exceeded the redirect limit.");
      const location = response.headers.location;
      if (!location) throw new LandingPageRetrievalError("invalid_redirect", "The landing page returned a redirect without a destination.");
      let next: URL;
      try { next = validateLandingPageUrl(new URL(location, current).toString()); } catch (error) { throw error instanceof LandingPageRetrievalError ? error : new LandingPageRetrievalError("invalid_redirect", "The redirect URL is invalid."); }
      current = next;
      continue;
    }
    validateLandingPageResponse(response);
    const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
    return { requestedUrl: requested.toString(), finalUrl: current.toString(), html: response.body.toString("utf8"), retrievedAt: new Date().toISOString(), source: "live_url", redirectCount, bytes: response.body.length, contentType };
  }
  throw new LandingPageRetrievalError("invalid_redirect", "The landing page exceeded the redirect limit.");
}

function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new LandingPageRetrievalError("timeout", "The landing-page host did not resolve before the retrieval timeout.")), timeoutMs);
    timer.unref?.();
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

export async function retrieveDemoLandingPage(fixtureId: typeof LANDING_PAGE_DEMO_ID): Promise<RetrievedLandingPage> {
  if (fixtureId !== LANDING_PAGE_DEMO_ID) throw new LandingPageRetrievalError("invalid_url", "Unknown demo landing page.");
  const html = await readFile(new URL("../data/northstar-landing-page.html", import.meta.url), "utf8");
  const url = "https://northstar-outdoor.example/camping-gear";
  return { requestedUrl: url, finalUrl: url, html, retrievedAt: new Date().toISOString(), source: "demo_fixture", redirectCount: 0, bytes: Buffer.byteLength(html), contentType: "text/html; charset=utf-8" };
}
