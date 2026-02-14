/**
 * Serve local media files (screenshots, generated images, TTS audio, etc.)
 * under a `/api/media/` HTTP prefix so the Control UI can render them as
 * standard `<img>` or `<audio>` elements.
 *
 * Files are resolved from `~/.openclaw/media/` with path-traversal protection.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const MEDIA_PREFIX = "/api/media/";

const MEDIA_ROOT = path.join(os.homedir(), ".openclaw", "media");

const EXT_TO_CONTENT_TYPE: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".opus": "audio/opus",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

/**
 * Handle GET /api/media/<relative-path> requests.
 * Returns `true` if the request was handled, `false` to pass through.
 */
export function handleMediaRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts?: { basePath?: string },
): boolean {
  const urlRaw = req.url;
  if (!urlRaw) return false;
  if (req.method !== "GET" && req.method !== "HEAD") return false;

  const url = new URL(urlRaw, "http://localhost");
  const pathname = url.pathname;

  const basePath = opts?.basePath ?? "";
  const fullPrefix = basePath ? `${basePath}${MEDIA_PREFIX}` : MEDIA_PREFIX;

  if (!pathname.startsWith(fullPrefix)) return false;

  const relPath = decodeURIComponent(pathname.slice(fullPrefix.length));

  // Security: block traversal
  if (!relPath || relPath.includes("..") || relPath.includes("\0") || path.isAbsolute(relPath)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Bad Request");
    return true;
  }

  const filePath = path.join(MEDIA_ROOT, relPath);

  // Ensure resolved path is still under MEDIA_ROOT
  if (!filePath.startsWith(MEDIA_ROOT + path.sep) && filePath !== MEDIA_ROOT) {
    res.statusCode = 403;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Forbidden");
    return true;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not Found");
    return true;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = EXT_TO_CONTENT_TYPE[ext] ?? "application/octet-stream";

  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "public, max-age=3600, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method === "HEAD") {
    const stat = fs.statSync(filePath);
    res.setHeader("Content-Length", stat.size);
    res.statusCode = 200;
    res.end();
    return true;
  }

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });
  return true;
}
