// Vercel Serverless Function: Open Context proxy with CORS
// Routes GET /api/opencontext?bbox=...&type=subjects&proj=...&format=json&rows=...

import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET,OPTIONS');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    // Log the request for debugging
    console.log('Open Context proxy request:', req.query);
    
    const base = 'https://opencontext.org/subjects-search/';
    const url = new URL(base);

    // Copy all query params through to Open Context
    const query = req.query || {};
    for (const key of Object.keys(query)) {
      // Vercel may provide arrays for repeated params; handle both cases
      const value = (query as any)[key];
      if (Array.isArray(value)) {
        for (const v of value) url.searchParams.append(key, String(v));
      } else if (value != null) {
        url.searchParams.set(key, String(value));
      }
    }

    console.log('Fetching from:', url.toString());

    const upstream = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; lidar-scan/1.0)',
        'Cache-Control': 'no-cache'
      }
      // Note: timeout not supported in standard fetch API, use AbortController if needed
    });

    console.log('Open Context response status:', upstream.status);
    console.log('Open Context response headers:', Object.fromEntries(upstream.headers.entries()));

    if (!upstream.ok) {
      console.error('Open Context API error:', upstream.status, upstream.statusText);
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.status(upstream.status).json({ 
        error: 'Open Context API error', 
        status: upstream.status,
        statusText: upstream.statusText 
      });
      return;
    }

    const contentType = upstream.headers.get('content-type') || 'application/json';
    const body = await upstream.text();

    // Log response for debugging
    console.log('Open Context response type:', contentType);
    console.log('Open Context response length:', body.length);
    console.log('Open Context response preview:', body.substring(0, 200));

    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.status(upstream.status).send(body);
  } catch (err: any) {
    console.error('Open Context proxy error:', err);
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.status(502).json({ 
      error: 'Failed to fetch from Open Context', 
      details: err?.message || String(err) 
    });
  }
}

