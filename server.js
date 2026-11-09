const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = __dirname;
const PORT = process.env.PORT || 8000;
const HOST = process.env.HOST || "0.0.0.0";
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};
const BLOCKED = new Set([
  "/server.js",
  "/data.js",
  "/config.example.js",
  "/README.md",
  "/.gitignore",
  "/package.json",
  "/package-lock.json",
]);
const BLOCKED_PREFIXES = ["/data/", "/supabase/", "/.git/", "/.cursor/", "/node_modules/"];
const APP_ROUTES = new Set(["home", "plan", "activities", "events", "gear", "profile", "connections", "settings", "progress", "setup"]);

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
};

function send(res, status, data, filePath) {
  res.writeHead(status, {
    "Content-Type": TYPES[path.extname(filePath || "")] || "text/html; charset=utf-8",
    ...SECURITY_HEADERS,
  });
  res.end(data);
}

function isAppPath(pathname) {
  const base = pathname.replace(/^\/+|\/+$/g, "").split("/")[0] || "home";
  return APP_ROUTES.has(base);
}

function isBlocked(rel) {
  if (BLOCKED.has(rel)) return true;
  if (rel.includes("/.") || rel.includes("\\.")) return true;
  return BLOCKED_PREFIXES.some((prefix) => rel === prefix.slice(0, -1) || rel.startsWith(prefix));
}

function lanAddresses() {
  const addrs = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const info of list || []) {
      const v4 = info.family === "IPv4" || info.family === 4;
      if (v4 && !info.internal && !info.address.startsWith("169.254.")) addrs.push(info.address);
    }
  }
  return addrs;
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.writeHead(302, { Location: "/home" + url.search, ...SECURITY_HEADERS });
      return res.end();
    }
    const rel = decodeURIComponent(url.pathname);
    if (isBlocked(rel) || rel.startsWith("/data")) {
      res.writeHead(403, SECURITY_HEADERS);
      return res.end("Forbidden");
    }
    const file = path.join(ROOT, path.normalize(rel));
    if (!file.startsWith(ROOT + path.sep) && file !== ROOT) {
      res.writeHead(403, SECURITY_HEADERS);
      return res.end("Forbidden");
    }
    fs.readFile(file, (err, data) => {
      if (!err) return send(res, 200, data, file);
      if (!path.extname(rel) && isAppPath(rel)) {
        return fs.readFile(path.join(ROOT, "index.html"), (err2, html) => {
          if (err2) {
            res.writeHead(500, SECURITY_HEADERS);
            return res.end("Missing index.html");
          }
          send(res, 200, html, "index.html");
        });
      }
      res.writeHead(404, SECURITY_HEADERS);
      res.end("Not found");
    });
  })
  .listen(PORT, HOST, () => {
    console.log(`Training site on http://localhost:${PORT}`);
    for (const ip of lanAddresses()) {
      console.log(`On your phone (same Wi-Fi): http://${ip}:${PORT}`);
    }
  });
