# Camera web apps

A static collection of browser-based iPhone apps:

- **Camera:** photo capture, camera switching, video recording, save, and share.
- **Slit camera:** capture complete frames and display their center pixel columns side by side with Canvas 2D; no external dependencies.
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

In landscape, the header is hidden and the main buttons stack vertically on the right of the canvas. During dissection, the dials form a second vertical rail on the left. Each rail uses a flex column with buttons, dials, and text sized to the available height so every control stays visible. Portrait keeps the controls below the view.

Click the circular FPS control to cycle through 1, 3, 6, 12, 24, 30, 48, and 60 before capture. The target rate is limited by the camera and device; choose a duration of 4 (default), 6, 8, 10, or 12 seconds with the adjacent seconds button. Capture stops at that duration or at the selected FPS × seconds frame limit, with each image at most 480 pixels on its longest edge. Frames stay in memory and are lost on reload. A new capture replaces the previous stack.

When the view is empty, **New** starts the camera without recording and **Load** opens a video picker. Load decodes the first 360 frames (or all frames of a shorter video), adding each to the front of the stack at its original presentation time. Imported images keep the 480-pixel longest-edge limit. Clear can cancel loading. Decoding uses the browser’s WebCodecs support and a pinned Mediabunny 1.66.0 module loaded from jsDelivr only on import; unsupported formats or browsers show an error. Files stay on the device. Slow devices may take longer than the original video duration to preserve every frame.

The camera button cycles through the physical rear lenses and front camera exposed by the browser, omitting duplicate composite rear-camera entries when physical lenses are available. Its indicator shows the active lens or a user icon for the front camera. Explicit zoom labels are preserved; telephoto lenses with no exposed zoom ratio are labeled Tele. Browser device lists do not necessarily expose every native Camera app lens or zoom setting.

The power button starts the camera and becomes the record button in the same position. Press again to capture, and again to stop early; a completed timed capture closes the camera. The 3D view fills the viewport space remaining above the controls and resizes as slicer controls or screen orientation change. The frame counter overlays the 3D view during capture and disappears when capture stops. The camera feed appears as the live front card. Rotating the device updates its canvas, texture, and plane proportions as the video dimensions change, including before recording. Orientation stays unlocked during recording; previously captured frames retain their original proportions. Stopping capture freezes the stack for dissection. Drag with one finger to rotate, two fingers to pan, and pinch to zoom. The view button animates rotation, pan, and zoom to **Front view**; when already facing front, it animates to a centered isometric view of the full stack. When capture stops, Circular Plane (scissors) and Topography (waveform) buttons replace the capture controls, while Clear and the view button stay in place. Slicing is always active during review. Plane depth starts at 0%; topography noise detail starts at 1. Both modes end with an Opacity dial (0–100%, default 100%) that changes every stack image without altering its source. The opacity dial uses an exponential curve for finer control over low per-frame opacity: 50% on the dial applies about 3% alpha and 75% applies about 18%, while 0% is fully transparent and 100% fully opaque. Show surface defaults to off. Clear the stack to return to capture setup. Drag dials right or up to increase values, left or down to decrease them; keyboard arrow keys also work, and Shift-drag provides finer adjustment. Slicers preserve the captured images. High FPS options request the selected camera frame rate, but actual throughput depends on camera and device performance.

## Slit camera controls

Open **Slit camera** from the app grid. The power button starts a camera preview; tap Capture to record, or Stop capture to finish early. FPS (1–60) and camera selection use the same cycling controls as frame-stack. Duration cycles through 4, 6, 8, 10, 12, 16, 20, and 30 seconds. Recording stops at the selected duration or FPS × duration frames, whichever comes first; there is no fixed 120-frame cap. Actual FPS depends on the device. Clear releases the stored images; a new capture replaces them.

Each complete source frame is retained in memory at a maximum 480-pixel longest edge, together with its timestamp. One sampled pixel column per frame is drawn to the output, in chronological order from left to right; the default is the center column. The output has one native column per captured frame and is scaled to fit the view without smoothing. If device orientation changes during capture, source images retain their individual dimensions and the displayed columns are scaled to the first frame's height. After capture, the Column arc dial starts at 50% (the center). Drag it or use the arrow keys to resample all retained frames, from 0% (leftmost column) to 100% (rightmost column). Sources and timestamps remain untouched. The Sweep arc dial also starts at 50%, sampling the same Column position in every frame. At 0%, sampling sweeps from the first frame's left edge through Column at the sequence midpoint to the last frame's right edge; at 100%, the direction reverses. Intermediate values blend between a flat sampling path and the full sweep. A smooth monotonic cubic curve passes through the midpoint anchor without overshooting; Column at 50% gives an evenly spaced full sweep. Frame index, not timestamp, determines progress along the curve; a single frame always samples Column. Amplitude adds a sine-wave offset to the Column + Sweep sampling path: 0% disables the wave (default), 50% gives ±25% of image width, and 100% gives ±50%. Frequency selects 1–10 whole cycles across the entire frame sequence (default 1), independent of capture duration or timestamps. Whole cycles leave the first, middle, and last sampling positions unchanged; combined positions outside the image are clamped to its edges, producing flattened wave peaks. Clear or a new capture resets Column and Sweep to 50%, Amplitude to 0%, and Frequency to 1 cycle. There are no export controls yet. Longer captures retain more full frames and consume more memory: 30 seconds at 60 FPS permits up to 1,800 full frames. Reloading loses all images. Hiding or leaving the page stops capture and releases camera tracks. Landscape hides the header and moves capture controls to the right rail and the editing dials to the left rail.

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

Reusable controls live in `public/shared/controls.css`, `controls.js`, and `dials.js`; frame-stack and slit-camera opt into the button controls. Load `controls.css` after `shared/style.css`. Use `.circle-button` for icon buttons (with an accessible label), `.record-button` with `aria-pressed` for capture state, `.switch-control` for a labeled native checkbox switch, and `.segmented-control` for native radio choices. Lucide SVG assets and their license are under `public/shared/icons/`.

For cycling buttons, declare `data-cycle-values`, an optional `data-cycle-label`, a starting `value`, and a child with `data-cycle-value`, then call `initializeCycleButtons()`. Value changes emit an `input` event. For arc dials, use `.dial` containing a labeled range input and an output named `<input-id>-value`, then call `initializeDials()`. Dispatch `dialsupdate` after changing range bounds, disabling, hiding, or resetting controls programmatically.
