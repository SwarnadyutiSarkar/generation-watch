# Deploying Generation Watch to Vercel (free)

GitHub Pages and plain Netlify only host static files. This app also has a small API (`/api/...`) for World Bank,
GDELT, ACLED and UCDP, so use **Vercel**, which hosts both from one GitHub repo. `vercel.json` and `api/index.js` are
already set up.

## 1. Put the project on GitHub
1. Create a new empty repository on github.com (e.g. `generation-watch`).
2. In the project folder:
   ```bash
   git init
   git add .
   git commit -m "Generation Watch"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/generation-watch.git
   git push -u origin main
   ```
   (`node_modules`, `dist` and `.env` are git-ignored. Do not commit `.env`.)

## 2. Import it into Vercel
1. Go to vercel.com, sign in with GitHub, click **Add New → Project**, pick the repo.
2. Framework preset: **Vite** (auto-detected). Leave build settings as they are.
3. (Optional) **Environment Variables**, add if you have them:
   - `ACLED_EMAIL`, `ACLED_PASSWORD` (your myACLED login)
   - `UCDP_ACCESS_TOKEN`, and `UCDP_GED_VERSION` if UCDP publishes a newer candidate version
4. Click **Deploy**. You get a `https://your-project.vercel.app` link in about a minute.

Every `git push` to `main` redeploys automatically.

## 3. After deploying
- Overview, map, 30 case studies, World Bank data and GDELT news work with no keys.
- ACLED/UCDP stay "Not configured" until you add the variables (Project → Settings → Environment Variables, then Redeploy).
- If you change `server.ts` or anything it imports, run `npm run build:api` locally and commit the regenerated `api/index.js`.

## Notes
- Visitor data (imports, edits) lives in each visitor's own browser (IndexedDB), not on the server.
- ACLED's Terms of Use restrict redistribution of its data. Before putting ACLED credentials on a *public* site,
  read ACLED's Terms of Use & Attribution Policy or ask ACLED. UCDP is CC BY 4.0 (attribution required).
- Vercel's free Hobby plan is for non-commercial use.
- Large CSV imports (Mass Mobilization) are parsed in the browser, so Vercel's request size limits do not apply.
