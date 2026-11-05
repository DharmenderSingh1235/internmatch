const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
const apiBase = String(process.env.API_BASE_URL || "").trim().replace(/\/+$/, "");
if (apiBase) {
  let parsed;
  try { parsed = new URL(apiBase); } catch { throw new Error("API_BASE_URL must be a valid Render HTTPS URL."); }
  if (parsed.protocol !== "https:") throw new Error("API_BASE_URL must use HTTPS.");
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith(".html")) fs.copyFileSync(path.join(root, entry.name), path.join(output, entry.name));
}
for (const directory of ["css", "js", "data"]) {
  fs.cpSync(path.join(root, directory), path.join(output, directory), { recursive: true });
}
if (apiBase) {
  fs.writeFileSync(path.join(output, "js", "runtime-config.js"), `window.IM_API_BASE = ${JSON.stringify(apiBase)};\n`, { encoding: "utf8" });
  for (const name of fs.readdirSync(output).filter((file) => file.endsWith(".html"))) {
    const file = path.join(output, name);
    const html = fs.readFileSync(file, "utf8");
    const tag = '<script src="js/runtime-config.js"></script>\n';
    if (!html.includes(tag)) fs.writeFileSync(file, html.replace(/<\/head>/i, `${tag}</head>`), "utf8");
  }
}
fs.copyFileSync(path.join(root, "netlify-headers"), path.join(output, "_headers"));
console.log(apiBase
  ? `Prepared static site in dist/ with API ${apiBase}`
  : "Prepared static site in dist/ using its built-in API default. Set Netlify API_BASE_URL to the Render URL when the Render service is ready.");
