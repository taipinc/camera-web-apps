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

Optional local HTTPS is available with `npm run setup:https` and `npm run dev:https` after installing mkcert and trusting its local CA. Trust on the development computer does not automatically extend to the iPhone; prefer the tunnel or deployed site to avoid installing certificate profiles. Generated certificates and private keys remain in ignored `.certs/`.

## Frame stack controls

Choose FPS before capture. The target rate is limited by the camera and device; captures stop at 120 frames, with each image at most 480 pixels on its longest edge. Frames stay in memory and are lost on reload. A new capture replaces the previous stack.

The camera feed appears as the live front card. Stopping capture freezes the stack for dissection. Drag with one finger to rotate, two fingers to pan, and pinch to zoom. **Front view** resets rotation, pan, and zoom. Drag dials horizontally to adjust values; keyboard arrow keys also work, and Shift-drag provides finer adjustment. Rewind and slicers preserve the captured images.

## GitHub Pages deployment

Deployment is already defined in [the Pages workflow](.github/workflows/pages.yml). It runs syntax checks, tests, and the build before publishing `dist/`. CI uses Node.js 24.

1. In your GitHub repository, open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push the local `main` branch to your remote repository.
4. Watch **Actions → Deploy Pages**. The successful deployment links to the site URL, which is also available in **Settings → Pages**.

You can also run **Deploy Pages** manually from Actions once the workflow exists on the remote. If you use a default branch other than `main`, update the workflow's push branch filter. Repository subpaths are supported by relative local links and asset paths. The frame-stack app additionally needs access to jsDelivr.

See [GitHub's publishing-source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) for the repository setting.

Pushes and deployment remain under the repository owner's control. Do not commit `dist/`, captures, certificates, or private keys.
