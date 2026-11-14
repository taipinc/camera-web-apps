# Camera web apps

Static, browser-only apps for iPhone. Arial, square corners, no shadows, no descriptive text in the interface. Captures stay in memory until exported or the page is closed. No uploads or external services.

## Local development

Node.js 20 or later. No dependencies to install.

```sh
npm run dev
```

Open http://localhost:8080 on this computer. Localhost supports camera access; an HTTP address on the local network does not.

## HTTPS on an iPhone

Install [mkcert](https://github.com/FiloSottile/mkcert) on the development Mac and create a trusted development certificate:

```sh
brew install mkcert
mkcert -install
npm run setup:https
npm run dev:https
```

The setup script includes localhost and the computer's current IPv4 addresses in the certificate. Re-run it if your network address changes.

On your iPhone:

1. AirDrop the **rootCA.pem** certificate from the folder printed by `mkcert -CAROOT`. Never transfer `rootCA-key.pem`.
2. Install the downloaded profile in Settings → General → VPN & Device Management.
3. Enable full trust under Settings → General → About → Certificate Trust Settings.
4. Connect to the same Wi-Fi as the Mac. Open the `https://…:8443` Network URL printed by the server in Safari. Allow incoming connections on the Mac if its firewall asks.

The local server exposes only `public/`. Certificates and private keys stay in ignored `.certs/` and are never included in the build.

## GitHub Pages

Repository: https://github.com/taipinc/camera-web-apps

1. Push this project to `main`.
2. In the repository, open Settings → Pages and choose **GitHub Actions** as the source.
3. Run the **Deploy Pages** workflow, or push to `main` to trigger it.
4. Enable **Enforce HTTPS** if that option is available.

Expected URL after deployment: https://taipinc.github.io/camera-web-apps/

All links are relative so both a repository subpath and a custom domain work. GitHub Pages supports HTTPS: [GitHub documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https).

## Structure

```text
public/index.html          App grid
public/app/camera/         Camera app
public/shared/             Shared styles and browser helpers
scripts/                   Local HTTP/HTTPS server and static build
```

Add each new app under `public/app/<name>/` and link it from the homepage.

## Camera

Start, flip front/rear, capture a photo, record video, save, share, clear, and close. Microphone access is requested when recording starts; video records without audio if microphone access is denied. Camera tracks stop when the page is hidden or left. The latest capture remains available when returning to the page. Each new capture replaces the previous one.

```sh
npm run check
npm run build
```

The build copies only public assets into `dist/`. No backend, Apple developer account, or app installation is required. Actual capture and export behavior should be verified on the target iPhone over trusted HTTPS.
