const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");
const analyze = process.argv.includes("--analyze");

/**
 * Emits the begin/end sentinels the `$esbuild-watch` problem matcher in
 * .vscode/tasks.json keys on, and re-prints errors in the exact format its
 * regex expects (`✘ [ERROR] ...` + indented `file:line:col:`), so build
 * errors land in the Problems panel during F5 dev.
 * @type {import('esbuild').Plugin}
 */
const problemMatcherPlugin = {
  name: "esbuild-problem-matcher",
  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      for (const { text, location } of result.errors) {
        console.error(`✘ [ERROR] ${text}`);
        if (location) {
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      }
      console.log("[watch] build finished");
    });
  },
};

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    outfile: "dist/extension.js",

    // Single-file CJS bundle: VS Code loads `main` with Node's require(), so
    // every production dependency (chokidar etc.) must be compiled in.
    bundle: true,
    format: "cjs",
    platform: "node",
    // VS Code ^1.90 ships Electron 29 → Node 20; lets esbuild keep modern
    // syntax instead of down-leveling.
    target: "node20",

    // Only the API module the host injects at runtime stays external.
    external: ["vscode"],

    // Prefer deps' ESM entry points when they have one — CJS entries are
    // opaque to tree-shaking, ESM ones get dead code dropped.
    mainFields: ["module", "main"],
    treeShaking: true,

    minify: production,
    // Keep function/class names through minification so error stack traces
    // from the field remain readable (costs ~1-2% size).
    keepNames: production,
    drop: production ? ["debugger"] : [],
    define: {
      // Constant-fold `process.env.NODE_ENV` checks inside dependencies so
      // their dev-only branches tree-shake away.
      "process.env.NODE_ENV": production ? '"production"' : '"development"',
    },

    // Dev builds get an external .map (excluded from the .vsix via
    // .vscodeignore); production ships none.
    sourcemap: !production,
    sourcesContent: false,

    metafile: analyze,
    // The plugin owns all output; esbuild's own logger would double-print.
    logLevel: "silent",
    plugins: [problemMatcherPlugin],
  });

  if (watch) {
    await ctx.watch();
    return; // keep the context alive; Ctrl+C ends the task
  }

  const result = await ctx.rebuild();
  await ctx.dispose();

  if (analyze && result.metafile) {
    console.log(await esbuild.analyzeMetafile(result.metafile));
  }
  if (result.errors.length > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
