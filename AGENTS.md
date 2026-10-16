# Repository Guidelines

## Project Structure & Module Organization

The React and TypeScript frontend lives in `src/`. `src/App.tsx` switches between the launcher and settings views; feature components are in `src/components/launcher/` and `src/components/settings/`, while reusable UI primitives are in `src/components/ui/`. Put shared logic in `src/lib/` and types in `src/types/`. The Tauri desktop entry point and native commands are in `src-tauri/src/main.rs`; desktop permissions and packaging settings are in `src-tauri/capabilities/` and `src-tauri/tauri.conf.json`. App icons are in `src-tauri/icons/`. `scripts/generate-licenses.mjs` produces `src/generated/licenses.json`; avoid editing that generated file by hand.

## Build, Test, and Development Commands

- `npm ci`: install the locked JavaScript dependencies.
- `npm run dev`: start the Vite frontend for browser development.
- `npm run tauri dev`: run the desktop app with the Rust backend.
- `npm run build`: regenerate license data, type-check TypeScript, and build the frontend into `dist/`.
- `npm run tauri build`: package the desktop app; requires the Rust toolchain and Tauri platform prerequisites.
- `cargo check --manifest-path src-tauri/Cargo.toml`: check native code without packaging.

## Coding Style & Naming Conventions

Follow the existing two-space indentation in TypeScript, TSX, JSON, and configuration files; use four spaces in Rust. Use double quotes and semicolons in TypeScript. Name React components and their files in PascalCase (`GamePathField.tsx`), functions and variables in camelCase, and Rust functions in snake_case. Prefer the `@/` alias for imports from `src/`. Keep Tailwind classes with the component they style. Run `cargo fmt --manifest-path src-tauri/Cargo.toml` for Rust changes. No ESLint or Prettier configuration is currently present.

## Testing Guidelines

There is no automated test framework or coverage threshold yet. Run `npm run build` for frontend changes and `cargo check --manifest-path src-tauri/Cargo.toml` for native changes. Manually exercise affected launcher and settings flows in `npm run tauri dev`, especially file selection, version requests, and program launching. If adding tests, place them beside the code they cover with a `.test.ts` or `.test.tsx` suffix and add a documented test script.

## Commit & Pull Request Guidelines

This repository has no commits yet, so no historical message convention exists. Use a short imperative subject such as `Add game path validation`. In pull requests, describe the behavior changed, list the checks performed, link related issues, and include screenshots for visible UI changes. Call out changes to Tauri capabilities or external program launching so reviewers can inspect their impact.
