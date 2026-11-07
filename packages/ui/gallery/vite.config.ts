import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

/**
 * Inlines the built JS and CSS (fonts are already data: URIs) into index.html, so the gallery is a
 * single self-contained file the lead can publish as a review page.
 */
function inlineSingleFile(): Plugin {
  return {
    name: "np-inline-single-file",
    enforce: "post",
    generateBundle(_options, bundle) {
      const html = bundle["index.html"];
      if (html?.type !== "asset") return;
      let source = String(html.source);
      for (const [name, chunk] of Object.entries(bundle)) {
        if (chunk.type === "chunk" && chunk.isEntry) {
          const tag = new RegExp(
            `<script type="module" crossorigin src="[^"]*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"></script>`,
          );
          const code = chunk.code.replace(/<\/script/gi, "<\\/script");
          source = source.replace(tag, () => `<script type="module">${code}</script>`);
          delete bundle[name];
        } else if (chunk.type === "asset" && name.endsWith(".css")) {
          const tag = new RegExp(
            `<link rel="stylesheet" crossorigin href="[^"]*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}">`,
          );
          const css = String(chunk.source).replace(/<\/style/gi, "<\\/style");
          source = source.replace(tag, () => `<style>${css}</style>`);
          delete bundle[name];
        }
      }
      html.source = source;
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  esbuild: { jsx: "automatic" },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    modulePreload: false,
    target: "es2022",
    reportCompressedSize: true,
  },
  plugins: [inlineSingleFile()],
});
