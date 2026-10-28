import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
let html = await readFile(path.join(root, "EvacRoute.html"), "utf8");
let css = await readFile(path.join(root, "evacroute.css"), "utf8");
let ui = await readFile(path.join(root, "evacroute-ui.js"), "utf8");
const performanceCode = await readFile(path.join(root, "evacroute-performance.js"), "utf8");
const embeddedAssets = {};
for (const file of await readdir(path.join(root, "assets/figma"))) {
  if (!file.endsWith(".svg")) continue;
  const bytes = await readFile(path.join(root, "assets/figma", file));
  embeddedAssets[path.basename(file, ".svg")] =
    "data:image/svg+xml;base64," + bytes.toString("base64");
}
for (const weight of [400, 500, 600, 700, 800]) {
  const bytes = await readFile(path.join(root, `assets/fonts/plus-jakarta-${weight}.ttf`));
  css = css.replaceAll(
    `assets/fonts/plus-jakarta-${weight}.ttf`,
    "data:font/ttf;base64," + bytes.toString("base64"),
  );
}
ui =
  "const erEmbeddedAssets = " +
  JSON.stringify(embeddedAssets) +
  ";\n" +
  ui.replaceAll("assets/figma/${name}.svg", "${erEmbeddedAssets[name]}");
html = html
  .replace(
    /<script\s+src="evacroute-performance\.js"\s*><\/script>/,
    () => `<script>\n${performanceCode}\n</script>`,
  )
  .replace(
    /<link\s+rel="stylesheet"\s+href="evacroute\.css"\s*\/?\s*>/,
    () => `<style>\n${css}\n</style>`,
  )
  .replace(/<script\s+src="evacroute-ui\.js"\s*><\/script>/, () => `<script>\n${ui}\n</script>`);
if (html.includes('href="evacroute.css"') || html.includes('src="evacroute-ui.js"')) {
  throw new Error("An external application asset was not embedded.");
}
await writeFile(path.join(root, "EvacRoute_Standalone.html"), html, "utf8");
await writeFile(path.join(root, "EvacRoute_Optimized.html"), html, "utf8");
console.log("Created EvacRoute_Standalone.html with local SVGs and fonts embedded.");
