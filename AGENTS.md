# Repository Guidelines

## Project Structure & Module Organization

This is a static website for browser-based iPhone apps with no npm dependencies or install step. `public/index.html` contains the square app grid. Each app lives under `public/app/<name>/`, with its own `index.html` and JavaScript modules. `camera` captures photos and video; `frame-stack` captures timestamped image frames and dissects them in 3D. Shared browser helpers and styles belong in `public/shared/`. Local development and build utilities live in `scripts/`. `.github/workflows/pages.yml` defines GitHub Pages deployment. Generated `dist/` and local `.certs/` are ignored. Automated tests live under `tests/`. `README.md` documents local development and GitHub Pages setup.

## Build, Test, and Development Commands

Use Node.js 20 or later; no dependency installation is required.

- `npm run dev`: serve `public/` at `http://localhost:8080`.
- `npm run check`: check JavaScript syntax in the currently listed source files and scripts; extend this list when adding modules.
- `npm test`: run Node's built-in test runner for slicing geometry, noise generation, capture timing, and dial interaction recovery. These tests do not establish browser or camera coverage.
- `npm run build`: replace `dist/` with a copy of `public/`.

`npm run setup:https` and `npm run dev:https` support optional mkcert certificates. Prefer a temporary HTTPS tunnel for iPhone testing without installing certificate profiles; disclose that the tunnel exposes the site externally.

## Coding Style & Naming Conventions

Use JavaScript ES modules, two-space indentation, semicolons, and single-quoted strings. Use descriptive camelCase identifiers and lowercase, hyphen-separated app directory names. Keep links relative so GitHub Pages repository subpaths work. No formatter or linter is configured.

Keep the interface minimal: Arial, square corners, no shadows, and no explanatory copy beyond necessary controls and errors. Load dependencies only where needed. The frame-stack app loads pinned Three.js modules from jsDelivr through its import map; keep core and addons on the same version. Keep other apps independent of Three.js.

## Frame Stack Guidelines

Keep image planes upright in XY, facing +Z. The newest captured frame stays at the front; older frames move along -Z without vertical offsets. Use orthographic projection, one-finger rotation, two-finger pan/pinch, and a frontal reset. Keep the view sticky while the controls scroll.

Capture stills directly from the camera at a session-selected target FPS; actual FPS is limited by the camera and device. Preserve the current 120-frame cap and 480-pixel longest edge unless the user requests changes. Store source images and timestamps separately from meshes. Reuse one canvas for the live front card and remove it when capture stops so dissection shows the recorded stack. Slicing and rewind hide pixels or frames without modifying source images.

Keep controls compact: one capture row, a borderless full-width flex layout for dissection, and arc dials adjusted by horizontal dragging. Use an accent color during dragging instead of a focus border; retain keyboard operation and visible keyboard focus feedback. Recover pointer state after release, cancellation, capture loss, hidden controls, and page interruptions. Release textures, geometries, materials, canvases, and camera tracks when no longer needed.

## Testing Guidelines

Use Node's built-in test runner for meaningful automated checks; name new tests `*.test.mjs` under `tests/`. No coverage threshold is configured. Run syntax checks, tests, and the build before review. Manually verify camera permissions, switching, capture, recording, export, and track cleanup on an actual iPhone over trusted HTTPS. For frame-stack changes, also verify live preview, FPS selection, sticky layout, dial recovery, rewind, plane/topography cuts, rotation on all three axes, orthographic zoom/pan, and frontal reset on iPhone. Report untested behavior explicitly.

## Commit & Pull Request Guidelines

Use concise imperative commit subjects, such as `Add frame stack dissection tools`. PRs should describe behavior, validation, related issues, and screenshots for visual changes.

Keep work local for review. The user handles pushes and deployment unless explicitly requested otherwise. Never upload captures, certificates, or private keys.

## Deployment

GitHub Pages is configured in `.github/workflows/pages.yml`: pushes to `main` and manual workflow runs check syntax, run tests, build, and publish `dist/`. CI uses Node.js 24. Configure the repository's Settings → Pages → Build and deployment → Source as GitHub Actions before the first deployment. Keep app links and local assets relative for repository subpaths. Do not commit generated `dist/` or local certificates. The user performs remote pushes and deployment actions unless explicitly requested otherwise.
