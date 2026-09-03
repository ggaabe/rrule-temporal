// tsdown.config.ts
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/totext.ts"],
  format: ["cjs", "esm"],
  dts: true,

  // `temporal-polyfill` deliberately enables expensive per-instance debug
  // strings in unminified bundles. Production minification disables that
  // instrumentation and substantially reduces ZonedDateTime materialization
  // cost as well as the published bundle size.
  minify: true,

  // Preserve the published file names expected by package.json exports.
  outExtensions: (ctx) =>
    ctx.format === "cjs"
      ? { js: ".cjs", dts: ".d.cts" }
      : { js: ".js", dts: ".d.ts" },
  target: false,
});
