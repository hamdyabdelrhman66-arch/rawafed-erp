# Rawafed ERP Deployment

## Recommended Production Setup

Use Vercel for the Angular frontend only.

The backend currently stores data in local files:

- `backend/data/rawafed.sqlite`
- `backend/uploads`

That storage is not suitable for Vercel serverless functions because files are not permanent there.

Recommended:

- Frontend: Vercel
- Backend API: Render, Railway, Fly.io, or a VPS
- Database: managed PostgreSQL or another persistent database
- Uploads: S3-compatible storage, Supabase Storage, or persistent server disk

## Frontend On Vercel

1. Push this repository to GitHub.
2. Import the GitHub repo in Vercel.
3. Use:
   - Build command: `npm run build`
   - Output directory: `dist/rawafed-admission-management/browser`
   - Install command: `npm ci`

`vercel.json` is already configured for Angular routes.

## Backend URL

Local development still uses:

```text
http://127.0.0.1:4300/api
```

On production, the frontend calls:

```text
/api
```

You can set the backend URL in the browser for temporary testing:

```js
localStorage.setItem('rawafed_api_base_url', 'https://YOUR-BACKEND-DOMAIN.com/api')
```

Then reload the page.

For a permanent production setup, add a Vercel rewrite from `/api/*` to the hosted backend API after the backend URL is chosen.
