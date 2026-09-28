// Turn Vite's single-file build into the page fragment the Artifact host expects
// (no <html>/<head>/<body>; <title> and <style> first, then content, then script).
import { readFileSync, writeFileSync } from "fs";
const html = readFileSync("dist/index.html", "utf8");
const pick = (re) => [...html.matchAll(re)].map((m) => m[0]);
const title = pick(/<title>[\s\S]*?<\/title>/g)[0] ?? "<title>FlowPilot Feedback Workspace</title>";
const links = pick(/<link[^>]+fonts\.(googleapis|gstatic)[^>]*>/g).join("\n");
const styles = pick(/<style[^>]*>[\s\S]*?<\/style>/g).join("\n");
const scripts = pick(/<script[^>]*>[\s\S]*?<\/script>/g).join("\n");
const out = `${title}\n${links}\n${styles}\n<div id="root"></div>\n${scripts}\n`;
writeFileSync("dist/flowpilot-workspace.html", out);
console.log(`artifact page: ${(out.length / 1024).toFixed(0)} KB`);
