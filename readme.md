# FoodieFlip API

Backend API for FoodieFlip recipes, feedback, and moderated submissions.

## Current Architecture

- Database: Neon Postgres via Prisma
- Published recipe images: DigitalOcean Spaces (public CDN)
- Moderation workflow: Trello cards for new recipe/image review
- API hosting target: tbd

## Image Storage Contract

Published recipe images are served only from Spaces CDN.

- Base URL: `SPACES_CDN_BASE_URL`
- Published key layout: `images/<recipeId>/original.<ext>` and `images/<recipeId>/medium-300w.<ext>`
- Recipe API response fields:
  - `imageExtension` (`jpg`, `png`, `webp`)
  - `imageUrl` (300w CDN URL)
  - `fullsizeUrl` (original CDN URL)

Notes:

- The API no longer serves local disk images.
- Frontend should render `imageUrl` / `fullsizeUrl`, not construct paths from legacy filename fields.
- small-sized image-URL not currently used but planned to be used for recipe items in user profiles

## Submission Workflow

Submission routes upload files to Spaces under submission namespaces, then create Trello cards:

- Image submissions: `submissions/images/<recipeId>/<timestamp>-<name>/...`
- Recipe submissions: `submissions/recipes/<timestamp>-<name>/...`

These uploads are for moderation context. They do not auto-publish recipes.

## Environment Variables

Required by the API process:

- `DATABASE_URL`
- `TRELLO_API_KEY`
- `TRELLO_API_TOKEN`
- `TRELLO_NEW_IMAGES_LIST_ID`
- `TRELLO_NEW_RECIPES_LIST_ID`
- `TRELLO_FEEDBACK_LIST_ID`
- `SPACES_KEY`
- `SPACES_SECRET`
- `SPACES_ENDPOINT`
- `SPACES_BUCKET`
- `SPACES_CDN_BASE_URL`

Optional:

- `ALLOWED_ORIGINS` (comma-separated, defaults to `http://localhost:4200`)
- `PORT` (defaults to `3000`)

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Ensure required environment variables are set.

3. Run dev server:

```bash
npm run dev
```

4. Build for production check:

```bash
npm run build
```

## API Routes

- `GET /api/health`
- `GET /api/recipes/random/:complexity`
- `GET /api/recipes/:shortTitle`
- `PATCH /api/recipes/vote`
- `POST /api/feedback`
- `PUT /api/submit/image`
- `POST /api/submit/recipe`
