# Automatically refreshed profile cards

The README uses custom SVG layouts generated from real GitHub API data. The portrait and brand artwork stay fixed; the numbers update automatically.

## Refreshes

`.github/workflows/update-profile.yml` runs every six hours, on generator changes, or via **Actions → Refresh profile cards → Run workflow**. It fetches GitHub data, runs tests, generates four SVGs, updates a readable text summary, and commits the results. Image URLs receive a content hash to avoid reusing an older cached graphic.

GitHub Actions schedules and GitHub's image cache can introduce delays. These are periodically regenerated images, not a JavaScript dashboard or a per-view HTTP API. If GitHub rejects a data request, the workflow fails and leaves the previously published cards intact.

No personal access token, Vercel project, or external stats service is needed. The workflow uses its temporary `GITHUB_TOKEN` and repository-scoped `contents: write` permission to commit generated files.

## Data definitions

- **Public repositories:** all public repositories owned by this account, including forks.
- **Stars:** total stars on owned public repositories, excluding forks.
- **Followers:** current GitHub follower count.
- **Contributions:** GitHub's contribution calendar for its rolling one-year window, as visible to the workflow token.
- **Active days:** dates in that window with at least one contribution.
- **Longest streak:** consecutive active calendar dates within that window.
- **Language mix:** primary language per owned public repository, excluding forks and repositories without a detected language. This is not code-byte share or coding time.
- **README Generator card:** current stars, forks, and primary language from that public repository.

KIIT Connect remains linked to its live site. Only KIIT Connect and README Generator appear as featured projects. No private repository names or source content are queried by the repository listing.

## Develop locally

Requires Node.js 22 and either an authenticated GitHub CLI or a GitHub token supplied through `GITHUB_TOKEN` / `GH_TOKEN` in the environment. Do not put tokens in source files.

```sh
node --test scripts/update-profile.test.mjs
node scripts/update-profile.mjs
```

Edit `scripts/update-profile.mjs` to change the SVG layout or metrics. GitHub data is collected with pagination, and XML-escaped before rendering. `data/github-summary.json` contains the public data used to render the cards.

GitHub documentation: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
