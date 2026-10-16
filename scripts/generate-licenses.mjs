/**
 * 从 npm 锁文件和 Cargo 解析结果生成设置页的第三方许可清单。
 * npm run build 会调用本脚本，Tauri 打包前也会运行 npm run build。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const licenseFilePattern = /^(?:licen[sc]e|copying|notice)(?:[._-].*)?$/i;

function webUrl(value) {
  if (!value || typeof value !== "string") return "";
  const url = value.replace(/^git\+/, "").replace(/\.git$/, "");
  if (/^https?:\/\//.test(url)) return url;
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) return `https://github.com/${url}`;
  return "";
}

function readLicenseFiles(packageDir, declaredFile) {
  const candidates = new Set();
  if (declaredFile) {
    candidates.add(isAbsolute(declaredFile) ? declaredFile : resolve(packageDir, declaredFile));
  }

  for (const entry of readdirSync(packageDir, { withFileTypes: true })) {
    if (entry.isFile() && licenseFilePattern.test(entry.name)) {
      candidates.add(join(packageDir, entry.name));
    }
  }

  return [...candidates]
    .sort((a, b) => a.localeCompare(b))
    .filter((path) => existsSync(path))
    .map((path) => ({ name: path.split(/[\\/]/).at(-1), text: readFileSync(path, "utf8") }))
    .filter(({ text }) => text.trim())
    .map(({ name, text }) => `=== ${name} ===\n${text}`)
    .join("\n\n");
}

function npmPackages() {
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
  const packages = new Map();

  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path.startsWith("node_modules/") || entry.link) continue;

    const packageDir = join(root, path);
    const manifestPath = join(packageDir, "package.json");
    if (!existsSync(manifestPath)) {
      if (entry.optional) continue;
      throw new Error(`npm 包未安装: ${path}。请先运行 npm ci。`);
    }

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const name = manifest.name;
    const version = manifest.version;
    if (entry.version !== version) {
      throw new Error(`npm 锁文件与已安装版本不一致: ${path}。请运行 npm ci。`);
    }
    const key = `${name}@${version}`;
    if (packages.has(key)) continue;

    const repository = typeof manifest.repository === "string"
      ? manifest.repository
      : manifest.repository?.url;
    packages.set(key, {
      ecosystem: "npm",
      name,
      version,
      license: typeof manifest.license === "string"
        ? manifest.license
        : (manifest.license?.type ?? manifest.licenses?.[0]?.type ?? entry.license ?? ""),
      homepage: webUrl(manifest.homepage) || webUrl(repository),
      licenseText: readLicenseFiles(packageDir),
    });
  }

  return [...packages.values()];
}

function rustPackages() {
  const manifestPath = join(root, "src-tauri", "Cargo.toml");
  const metadata = JSON.parse(execFileSync("cargo", [
    "metadata", "--format-version", "1", "--manifest-path", manifestPath,
  ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
  const resolvedIds = new Set(metadata.resolve.nodes.map((node) => node.id));

  return metadata.packages
    .filter((pkg) => pkg.source && resolvedIds.has(pkg.id))
    .map((pkg) => ({
      ecosystem: "Rust",
      name: pkg.name,
      version: pkg.version,
      license: pkg.license ?? "",
      homepage: webUrl(pkg.homepage) || webUrl(pkg.repository) || `https://crates.io/crates/${pkg.name}`,
      licenseText: readLicenseFiles(dirname(pkg.manifest_path), pkg.license_file),
    }));
}

const npm = npmPackages();
const rust = rustPackages();
const packages = [...npm, ...rust].sort((a, b) =>
  a.ecosystem.localeCompare(b.ecosystem) || a.name.localeCompare(b.name) || a.version.localeCompare(b.version)
);

const outDir = join(root, "src", "generated");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "licenses.json");
writeFileSync(outFile, JSON.stringify(packages, null, 2));

console.log(`[licenses] npm ${npm.length} + Rust ${rust.length} = ${packages.length} packages -> ${outFile}`);
