# LiDAR Scan - Serverless API Functions

This directory contains Vercel serverless functions that act as backend proxies for archaeological database APIs. These proxies solve CORS (Cross-Origin Resource Sharing) issues when querying external databases from the browser.

## Available Endpoints

### 1. Open Context API Proxy

**Endpoint:** `/api/opencontext`

**Purpose:** Proxies requests to the Open Context archaeological database (opencontext.org)

**Query Parameters:**
- `bbox` (required): Bounding box in format `west,south,east,north`
- `type` (optional): Search type, default: `subjects`
- `proj` (optional): Projection type, default: `oc-api:default-subjects`
- `format` (optional): Response format, default: `json`
- `rows` (optional): Number of results, default: `100`

**Example:**
```
GET /api/opencontext?bbox=-112.5,36.2,-112.1,36.4&rows=50
```

**Response:**
Returns GeoJSON with archaeological sites from Open Context database.

---

### 2. ARIADNE Portal API Proxy

**Endpoint:** `/api/ariadne`

**Purpose:** Proxies requests to the ARIADNE Portal (European archaeological infrastructure)

**Query Parameters:**
- `bbox` (required): Bounding box in format `west,south,east,north`
- `q` (optional): Solr query, default: `*:*` (all records)
- `rows` (optional): Number of results, default: `100`
- `start` (optional): Result offset, default: `0`

**Example:**
```
GET /api/ariadne?bbox=5.0,45.0,10.0,48.0&rows=100
```

**Response:**
Returns Solr-formatted JSON with archaeological sites from ARIADNE Portal.

---

## Enabling Archaeological Database Queries

By default, external archaeological database queries are **disabled** to avoid errors when backend proxies are not available.

### To Enable:

Add to your `.env` file:
```bash
VITE_ENABLE_ARCHAEOLOGICAL_DATABASES=true
```

This enables:
- ✅ Open Context database queries
- ✅ ARIADNE Portal database queries
- ✅ Enhanced archaeological site detection

Without this flag:
- ❌ External databases disabled
- ✅ Curated local database still works
- ✅ USGS 3DEP and other sources unaffected

---

## Deployment

These serverless functions are automatically deployed when pushing to Vercel:

1. **Push to GitHub:**
   ```bash
   git push origin main
   ```

2. **Vercel detects** files in `api/` directory
3. **Automatically deploys** as serverless functions
4. **Available at** `https://your-domain.vercel.app/api/opencontext`

---

## Local Development

### Option 1: Vercel CLI
```bash
npm install -g vercel
vercel dev
```

This runs serverless functions locally at `http://localhost:3000/api/*`

### Option 2: Mock Data
Without running serverless functions locally, the app will:
- Use curated local archaeological database
- Skip external database queries (if feature flag disabled)
- Function normally with slightly reduced archaeological site coverage

---

## Architecture

```
Browser → Frontend (/api/opencontext) → Vercel Serverless → Open Context API
Browser → Frontend (/api/ariadne) → Vercel Serverless → ARIADNE Portal
```

**Why proxies?**
- Avoids CORS restrictions
- Hides API complexity from frontend
- Allows request logging and rate limiting
- Can add authentication if needed

---

## Error Handling

Both APIs gracefully handle errors:
- **404/503 errors:** Return empty result set
- **Network failures:** Logged but don't crash app
- **Parse errors:** Skip problematic records, continue processing

Archaeological data is **supplementary**, not critical. The app functions fully without it.

---

## Rate Limiting

Open Context has rate limiting configured:
- Default: 60 requests/minute
- Override in `.env`: `VITE_OPENCONTEXT_RATE_LIMIT=120`

ARIADNE currently has no rate limiting implemented.

---

## Testing

Test endpoints locally or in production:

```bash
# Open Context
curl "https://your-domain.vercel.app/api/opencontext?bbox=-112.5,36.2,-112.1,36.4"

# ARIADNE Portal
curl "https://your-domain.vercel.app/api/ariadne?bbox=5.0,45.0,10.0,48.0"
```

---

## Troubleshooting

### 404 Errors in Console
If you see 404 errors for `/api/opencontext` or `/api/ariadne`:
1. Check that files exist in `api/` directory
2. Ensure Vercel deployment succeeded
3. Verify `VITE_ENABLE_ARCHAEOLOGICAL_DATABASES=true` in `.env` (if you want these enabled)
4. Check Vercel function logs for errors

### Empty Results
If queries return empty results:
1. Check bounding box coordinates are valid
2. Try a known archaeological region (e.g., Greece, Maya region)
3. Check external API status (Open Context, ARIADNE)
4. Review Vercel function logs

### CORS Errors
If you still see CORS errors:
1. Ensure requests go through `/api/*` endpoints (not direct to external APIs)
2. Check CORS headers in serverless function code
3. Verify Vercel deployment

---

## Contributing

When adding new archaeological database proxies:

1. Create new file in `api/` directory (e.g., `api/newdb.ts`)
2. Follow existing pattern (CORS headers, error handling)
3. Add to `ArchaeologicalDatabaseService.databases` array
4. Implement parser in `ArchaeologicalDatabaseService`
5. Update this README
6. Test thoroughly

---

## Security

- ✅ No API keys exposed to frontend
- ✅ Rate limiting prevents abuse
- ✅ Input validation on all parameters
- ✅ Error messages don't leak sensitive info
- ⚠️ Consider adding authentication for production
- ⚠️ Monitor Vercel function usage/costs

---

## Related Files

- `/src/core/ArchaeologicalDatabaseService.ts` - Frontend database client
- `/src/core/DataAvailabilityService.ts` - Data source prioritization
- `/api/opencontext.ts` - Open Context proxy
- `/api/ariadne.ts` - ARIADNE Portal proxy
- `/vercel.json` - Vercel configuration

---

## Support

For issues or questions:
- Check Vercel function logs: https://vercel.com/dashboard
- Review Open Context docs: https://opencontext.org/about/services
- Review ARIADNE docs: https://ariadne-infrastructure.eu/

---

**Last Updated:** 2025-11-07
