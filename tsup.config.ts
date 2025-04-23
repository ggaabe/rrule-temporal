// tsup.config.ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,

  // for CJS builds, rename .js → .cjs
  outExtension: (ctx) =>
    ctx.format === "cjs"
      ? { js: ".cjs" } // <-- value *must* start with a dot
      : {},
});
