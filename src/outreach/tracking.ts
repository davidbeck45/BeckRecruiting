import { randomBytes } from "node:crypto";
import { config } from "../config.js";

export function newToken(): string {
  return randomBytes(16).toString("hex");
}

export function openPixelUrl(token: string): string {
  return `${config.publicBaseUrl}/t/o/${token}.gif`;
}

export function clickUrl(token: string): string {
  return `${config.publicBaseUrl}/t/c/${token}`;
}

/**
 * Turn a composed plain-text body into tracked HTML:
 * - FILM_LINK placeholder becomes the tracked click-redirect to the athlete's film
 * - an invisible open pixel is appended
 * - CAN-SPAM footer with opt-out link
 */
export function renderTrackedHtml(body: string, token: string): string {
  const tracked = body
    .split("\n")
    .map((line) => escapeHtml(line))
    .join("<br>\n")
    .replace(/FILM_LINK/g, `<a href="${clickUrl(token)}">Watch my highlight film</a>`);

  return `<!doctype html><html><body style="font-family: Arial, sans-serif; font-size: 14px; color: #111;">
${tracked}
<br><br>
<span style="color:#888;font-size:11px">Sent on behalf of the athlete via Beck Recruiting.
<a href="${config.publicBaseUrl}/t/u/${token}" style="color:#888">Unsubscribe from athlete outreach</a></span>
<img src="${openPixelUrl(token)}" width="1" height="1" alt="" style="display:none">
</body></html>`;
}

export function renderTrackedText(body: string, token: string): string {
  return (
    body.replace(/FILM_LINK/g, clickUrl(token)) +
    `\n\n--\nSent on behalf of the athlete via Beck Recruiting. Unsubscribe: ${config.publicBaseUrl}/t/u/${token}`
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 1x1 transparent GIF for open tracking
export const PIXEL_GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
