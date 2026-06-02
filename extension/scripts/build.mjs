import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["chrome", "edge", "firefox"];
const bundles = [
  {
    output: ["src", "background.js"],
    inputs: [
      "src/shared/browser-api.js",
      "src/shared/settings.js",
      "src/background/constants.js",
      "src/background/state.js",
      "src/background/action-state.js",
      "src/background/settings-service.js",
      "src/background/index.js"
    ]
  },
  {
    output: ["src", "content.js"],
    inputs: ["src/shared/browser-api.js", "src/content/banner.js", "src/content/index.js"]
  },
  {
    output: ["src", "popup.js"],
    inputs: ["src/shared/browser-api.js", "src/shared/settings.js", "src/popup/view.js", "src/popup/index.js"]
  }
];

const staticFiles = ["popup.html"];

async function copySourceTree(outDir) {
  const sourceRoot = path.join(root, "src");
  const entries = await readdir(sourceRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    await cp(path.join(sourceRoot, entry.name), path.join(outDir, "src", entry.name), {
      recursive: true
    });
  }
}

async function bundleFiles(files, outFile) {
  const contents = await Promise.all(
    files.map((relativePath) => readFile(path.join(root, relativePath), "utf8"))
  );

  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, contents.join("\n\n"));
}

async function buildTarget(target) {
  const outDir = path.join(root, "dist", target);
  const manifestPath = path.join(root, "manifests", `manifest.${target}.json`);

  await rm(outDir, { force: true, recursive: true });
  await mkdir(outDir, { recursive: true });
  await copySourceTree(outDir);
  await cp(path.join(root, "rules"), path.join(outDir, "rules"), { recursive: true });
  await Promise.all(
    staticFiles.map((file) => cp(path.join(root, file), path.join(outDir, file)))
  );

  const manifest = await readFile(manifestPath, "utf8");
  await writeFile(path.join(outDir, "manifest.json"), manifest);

  await Promise.all(
    bundles.map((bundle) => {
      return bundleFiles(bundle.inputs, path.join(outDir, ...bundle.output));
    })
  );
}

await Promise.all(targets.map(buildTarget));
console.log(`Built ${targets.map((target) => `dist/${target}`).join(", ")}`);
