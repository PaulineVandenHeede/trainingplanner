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
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
const BLOCKED = new Set(["/server.js", "/data.js"]);
const APP_ROUTES = new Set(["home", "plan", "activities", "events", "gear", "profile", "connections", "progress", "setup"]);

function send(res, status, data, filePath) {
  res.writeHead(status, {
    "Content-Type": TYPES[path.extname(filePath || "")] || "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(data);
}

function isAppPath(pathname) {
  const base = pathname.replace(/^\/+|\/+$/g, "").split("/")[0] || "home";
  return APP_ROUTES.has(base);
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
      res.writeHead(302, { Location: "/home" + url.search });
      return res.end();
    }
    const rel = decodeURIComponent(url.pathname);
    if (rel.includes("/.") || rel.startsWith("/data/") || rel.startsWith("/data") || BLOCKED.has(rel)) {
      res.writeHead(403);
      return res.end("Forbidden");
    }
    const file = path.join(ROOT, path.normalize(rel));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end("Forbidden");
    }
    fs.readFile(file, (err, data) => {
      if (!err) return send(res, 200, data, file);
      if (!path.extname(rel) && isAppPath(rel)) {
        return fs.readFile(path.join(ROOT, "index.html"), (err2, html) => {
          if (err2) {
            res.writeHead(500);
            return res.end("Missing index.html");
          }
          send(res, 200, html, "index.html");
        });
      }
      res.writeHead(404);
      res.end("Not found");
    });
  })
  .listen(PORT, HOST, () => {
    console.log(`Training site on http://localhost:${PORT}`);
    for (const ip of lanAddresses()) {
      console.log(`On your phone (same Wi-Fi): http://${ip}:${PORT}`);
    }
  });
