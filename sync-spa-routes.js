#!/usr/bin/env node
/** Keep GitHub Pages SPA entrypoints in sync with index.html. */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const APP_ROUTES = [
  "home",
  "plan",
  "activities",
  "events",
  "gear",
  "profile",
  "connections",
  "settings",
  "progress",
  "setup",
  "create-plan",
];

fs.writeFileSync(path.join(ROOT, "404.html"), html);
fs.writeFileSync(path.join(ROOT, ".nojekyll"), "");

for (const route of APP_ROUTES) {
  const dir = path.join(ROOT, route);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
}

console.log(`Synced 404.html + ${APP_ROUTES.length} route folders from index.html`);
