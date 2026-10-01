# rrule-temporal playground

The interactive demo at https://ggaabe.github.io/rrule-temporal/. It uses the published `rrule-temporal` package, so
bump the dependency here after each release.

```bash
npm install
npm run dev
```

`.github/workflows/deploy-demos.yaml` builds and deploys the site to GitHub Pages whenever `demo/` changes on `main`.
