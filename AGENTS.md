# AGENTS.md — Repository Guidelines

## Project Structure & Module Organization

The React and TypeScript frontend lives in `src/`. `src/App.tsx` switches between four views: the launcher home (`src/components/launcher/`), an accounts manager (`src/components/accounts/`), a sync page (`src/components/sync/`), and settings (`src/components/settings/`). Reusable UI primitives are in `src/components/ui/`. Put shared logic in `src/lib/` and types in `src/types/`. Static images (backgrounds, logo) are in `src/assets/`.

The Tauri desktop entry point and native commands are in `src-tauri/src/main.rs`, with KeePass vault handling split into `src-tauri/src/keepass.rs` and sync engine code in `src-tauri/src/sync_system/`. Desktop permissions and packaging settings are in `src-tauri/capabilities/` and `src-tauri/tauri.conf.json`; app icons are in `src-tauri/icons/`, and sync source definitions live in `src-tauri/sync-sources/`.

`scripts/generate-licenses.mjs` produces `src/generated/licenses.json`; avoid editing that generated file by hand.

OpenSpec drives spec-driven development here: `openspec/` holds `config.yaml`, `specs/` (main specs), and `changes/` (change proposals); shared workflow skills are in `.agents/skills/`. See `openspec/config.yaml` for the authoritative project context. Keep AGENTS.md and the OpenSpec context in sync when either changes.

## Build, Test, and Development Commands

- `npm ci`: install the locked JavaScript dependencies.
- `npm run dev`: start the Vite frontend for browser development.
- `npm run generate:licenses`: regenerate `src/generated/licenses.json` only.
- `npm run tauri dev`: run the desktop app with the Rust backend.
- `npm run build`: regenerate license data, type-check TypeScript, and build the frontend into `dist/`.
- `npm run tauri build`: package the desktop app; requires the Rust toolchain and Tauri platform prerequisites.
- `cargo check --manifest-path src-tauri/Cargo.toml`: check native code without packaging.

## Coding Style & Naming Conventions

Follow the existing two-space indentation in TypeScript, TSX, JSON, and configuration files; use four spaces in Rust. Use double quotes and semicolons in TypeScript. Name React components and their files in PascalCase (`GamePathField.tsx`), functions and variables in camelCase, and Rust functions in snake_case. Prefer the `@/` alias for imports from `src/`. Keep Tailwind classes with the component they style. Run `cargo fmt --manifest-path src-tauri/Cargo.toml` for Rust changes. No ESLint or Prettier configuration is currently present.

## Testing Guidelines

There is no automated test framework or coverage threshold yet. Run `npm run build` for frontend changes and `cargo check --manifest-path src-tauri/Cargo.toml` for native changes. Manually exercise affected launcher and settings flows in `npm run tauri dev`, especially file selection, version requests, and program launching. If adding tests, place them beside the code they cover with a `.test.ts` or `.test.tsx` suffix and add a documented test script.

## Commit & Pull Request Guidelines

History is short, so no strong message convention exists yet; follow the existing short imperative subjects (e.g. `Add game path validation`). In pull requests, describe the behavior changed, list the checks performed, link related issues, and include screenshots for visible UI changes. Call out changes to Tauri capabilities, external program launching, or KeePass vault handling so reviewers can inspect their impact.
