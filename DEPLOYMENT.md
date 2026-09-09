# Cloudflare Pages

Repository: https://github.com/anaconda-incubation/python-map-lab

## Connect once

In the Anaconda Cloudflare account, open **Workers & Pages → Create application → Pages → Connect to Git**. Select GitHub, authorize the Cloudflare GitHub application for this repository, and select `anaconda-incubation/python-map-lab`.

Use these build settings:

| Setting | Value |
| --- | --- |
| Project name | `python-map-lab` (or an available alternative) |
| Production branch | `main` |
| Framework preset | React (Vite) |
| Root directory | Repository root (leave blank) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | 22, from `.nvmrc` |

Save and deploy. Cloudflare assigns a `pages.dev` address after a successful deployment. Future pushes to `main` deploy production automatically; other branches can receive preview deployments. No Cloudflare token needs to be stored in GitHub for this integration.

## Runtime behavior

This is a static site with no Pages Functions or server. `wrangler.jsonc` declares the output directory; `public/_headers` is copied into the build for response headers and immutable caching of hashed assets. Cloudflare Pages provides the SPA fallback automatically because there is no top-level `404.html`.

Python and NumPy load from the pinned Pyodide CDN (`cdn.jsdelivr.net`) inside a module worker. Do not add a Content Security Policy that blocks that origin, workers, or WebAssembly. First-time Python execution needs internet access. Fonts and map data are served by the site.

## Verify after deployment

- Open the `pages.dev` URL and confirm the globe and labels render.
- Select Mercator, change `central_meridian`, and run Python.
- Run AuthaGraph and the centered-distance experiment, including its optional ring.
- Expand/collapse the map, open Sources, and download a notebook.
- Open `/learn` or another unknown route directly; the app should return to the field guide rather than an HTTP error.
- Check the Cloudflare deployment log and the GitHub Production checks workflow.

For a custom domain, use the Pages project's **Custom domains → Set up a custom domain** flow. Connect the domain there before changing DNS. The production domain has not been selected in this repository.

References: [Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/), [Vite settings](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/), [SPA routing](https://developers.cloudflare.com/pages/configuration/serving-pages/).
