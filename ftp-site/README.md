# FTP static pages

This folder is ready to upload to `wayan.com` by FTP.

Files:
- `index.html`
- `about.html`
- `assets/site.css`

Before upload, replace every `APP_URL_TO_REPLACE` in `index.html` and `about.html` with the deployed Next app URL, for example the Render URL.

Suggested remote folder:
- `/public_html/proposal-compliance-checker/`

Suggested public URLs:
- `https://wayan.com/proposal-compliance-checker/`
- `https://wayan.com/proposal-compliance-checker/about.html`

The working checker itself needs a server runtime because `/api/review` calls OpenAI. FTP can host these static pages, but not the Next API route.
