/**
 * ARIADNE Portal API Proxy
 * Serverless function to proxy requests to ARIADNE infrastructure
 * Avoids CORS issues when querying from browser
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

// ARIADNE Portal API endpoint
const ARIADNE_API = 'https://portal.ariadne-infrastructure.eu/api/search';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { bbox, q, rows, start } = req.query;

    // Validate required parameters
    if (!bbox) {
      return res.status(400).json({ error: 'Missing required parameter: bbox' });
    }

    // Parse bounding box
    const bboxArray = (bbox as string).split(',').map(Number);
    if (bboxArray.length !== 4) {
      return res.status(400).json({ error: 'Invalid bbox format. Expected: west,south,east,north' });
    }

    const [west, south, east, north] = bboxArray;

    // Create spatial query using WKT ENVELOPE
    // ARIADNE uses Solr spatial queries
    const spatialQuery = `ENVELOPE(${west}, ${east}, ${north}, ${south})`;

    // Build query parameters for ARIADNE
    const params = new URLSearchParams({
      q: (q as string) || '*:*', // Default to all records
      fq: `spatial:"Intersects(${spatialQuery})"`, // Spatial filter
      rows: (rows as string) || '100',
      start: (start as string) || '0',
      wt: 'json'
    });

    // Log the request for debugging
    console.log('🏛️ ARIADNE API request:', ARIADNE_API + '?' + params.toString());

    // Fetch from ARIADNE API
    const response = await fetch(`${ARIADNE_API}?${params}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'LiDAR-Scan/1.0 (Archaeological Research Tool)'
      }
    });

    if (!response.ok) {
      console.error('ARIADNE API error:', response.status, response.statusText);

      // ARIADNE might not be available or might have changed endpoints
      // Return a friendly error but don't crash
      if (response.status === 404) {
        console.warn('ARIADNE API endpoint not found - API may have changed');
        return res.status(200).json({
          response: {
            numFound: 0,
            docs: []
          },
          note: 'ARIADNE API endpoint not available'
        });
      }

      return res.status(response.status).json({
        error: 'ARIADNE API error',
        status: response.status,
        statusText: response.statusText
      });
    }

    const data = await response.json();

    // Log successful response
    console.log('✅ ARIADNE API response:', {
      totalRecords: data.response?.numFound || 0,
      returned: data.response?.docs?.length || 0
    });

    // Return the data
    return res.status(200).json(data);

  } catch (error) {
    console.error('Error in ARIADNE proxy:', error);

    // Return empty result instead of error to avoid breaking the app
    // Archaeological data is supplementary, not critical
    return res.status(200).json({
      response: {
        numFound: 0,
        docs: []
      },
      note: 'ARIADNE API temporarily unavailable'
    });
  }
}
