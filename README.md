# Camera web apps

A static collection of browser-based iPhone apps:

- **Camera:** photo capture, camera switching, video recording, save, and share.
- **Frame stack:** capture a sequence of stills and inspect it as an orthographic 3D stack, with rewind, plane cuts, and topographical cuts.

## Local development

Use Node.js 20 or later. No dependency installation is required.

```sh
npm run dev
```

Open `http://localhost:8080`. Set `PORT` to use another port. The frame-stack app loads pinned Three.js modules from jsDelivr, so it needs an internet connection.

```sh
npm run check
npm test
npm run build
```

The build replaces `dist/` with a copy of `public/`. Automated tests cover geometry, noise, capture timing, and dial interactions; camera and WebGL behavior still require browser and actual iPhone testing.

## iPhone testing

Camera access on an iPhone requires a trusted HTTPS origin. Use the deployed GitHub Pages URL or a temporary HTTPS tunnel to the development server. A tunnel exposes the site externally; close it when testing is finished. A plain HTTP LAN address will not provide camera access.

### Cloudflare Quick Tunnel (recommended)

No Cloudflare account or domain is required. On macOS with Homebrew, install the tunnel client once:

```sh
brew install cloudflared
```

From the repository root, start the development server in one terminal:

```sh
npm run dev
```

In a second terminal, expose that server through a temporary HTTPS URL:

```sh
cloudflared tunnel --url http://localhost:8080
```

Keep both commands running. Copy the `https://<random-name>.trycloudflare.com` URL printed by `cloudflared` and open it in Safari on your iPhone. Choose **Frame stack**, or append `/app/frame-stack/` to the URL, then allow camera access when prompted. No iPhone certificate profile is needed; the tunnel provides trusted HTTPS while the local server continues using HTTP.

The URL is public: anyone with it can access the development site while the tunnel is running. Press **Ctrl+C** in the tunnel terminal when finished, and in the server terminal to stop development serving. A new tunnel session generates a new URL. If you set a custom `PORT`, use the same port in the tunnel command. If the tunnel shows a **502** error, check that `http://localhost:8080` opens on the development computer and that the ports match.

See [Cloudflare's Quick Tunnel documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) for details and other installation options.

### Optional local HTTPS

Optional local HTTPS is available with `npm run setup:https` and `npm run dev:https` after installing mkcert and trusting its local CA. Trust on the development computer does not automatically extend to the iPhone; prefer the tunnel or deployed site to avoid installing certificate profiles. Generated certificates and private keys remain in ignored `.certs/`.

## Frame stack controls

Click the circular FPS control to cycle through 1, 3, 6, 12, 24, 30, 48, and 60 before capture. The target rate is limited by the camera and device; choose a duration of 4 (default), 6, 8, 10, or 12 seconds with the adjacent seconds button. Capture stops at that duration or at the selected FPS × seconds frame limit, with each image at most 480 pixels on its longest edge. Frames stay in memory and are lost on reload. A new capture replaces the previous stack.

The power button starts the camera and becomes the record button in the same position. Press again to capture, and again to stop early; a completed timed capture closes the camera. The 3D view fills the viewport space remaining above the controls and resizes as slicer controls or screen orientation change. The frame counter overlays the 3D view during capture and disappears when capture stops. The camera feed appears as the live front card. Stopping capture freezes the stack for dissection. Drag with one finger to rotate, two fingers to pan, and pinch to zoom. The view button animates rotation, pan, and zoom to **Front view**; when already facing front, it animates to a centered isometric view of the full stack. When capture stops, Circular Plane (scissors) and Topography (waveform) buttons replace the capture controls, while Clear and the view button stay in place. Slicing is always active during review. Plane depth starts at 0%; topography noise detail starts at 1. Both modes end with an Opacity dial (0–100%, default 100%) that changes every stack image without altering its source. Show surface defaults to off. Clear the stack to return to capture setup. Drag dials right or up to increase values, left or down to decrease them; keyboard arrow keys also work, and Shift-drag provides finer adjustment. Slicers preserve the captured images. High FPS options request the selected camera frame rate, but actual throughput depends on camera and device performance.

## GitHub Pages deployment

Deployment is already defined in [the Pages workflow](.github/workflows/pages.yml). It runs syntax checks, tests, and the build before publishing `dist/`. CI uses Node.js 24.

1. In your GitHub repository, open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push the local `main` branch to your remote repository.
4. Watch **Actions → Deploy Pages**. The successful deployment links to the site URL, which is also available in **Settings → Pages**.

You can also run **Deploy Pages** manually from Actions once the workflow exists on the remote. If you use a default branch other than `main`, update the workflow's push branch filter. Repository subpaths are supported by relative local links and asset paths. The frame-stack app additionally needs access to jsDelivr.

See [GitHub's publishing-source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) for the repository setting.

Pushes and deployment remain under the repository owner's control. Do not commit `dist/`, captures, certificates, or private keys.

## Shared UI controls

Reusable controls live in `public/shared/controls.css`, `controls.js`, and `dials.js`; currently only frame-stack opts into them. Load `controls.css` after `shared/style.css`. Use `.circle-button` for icon buttons (with an accessible label), `.record-button` with `aria-pressed` for capture state, `.switch-control` for a labeled native checkbox switch, and `.segmented-control` for native radio choices. Lucide SVG assets and their license are under `public/shared/icons/`.

For cycling buttons, declare `data-cycle-values`, an optional `data-cycle-label`, a starting `value`, and a child with `data-cycle-value`, then call `initializeCycleButtons()`. Value changes emit an `input` event. For arc dials, use `.dial` containing a labeled range input and an output named `<input-id>-value`, then call `initializeDials()`. Dispatch `dialsupdate` after changing range bounds, disabling, hiding, or resetting controls programmatically.
