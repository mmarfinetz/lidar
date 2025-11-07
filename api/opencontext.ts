/**
 * Open Context API Proxy
 * Serverless function to proxy requests to Open Context API
 * Avoids CORS issues when querying from browser
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const OPEN_CONTEXT_API = 'https://opencontext.org/subjects-search';

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
    const { bbox, type, proj, format, rows } = req.query;

    // Validate required parameters
    if (!bbox) {
      return res.status(400).json({ error: 'Missing required parameter: bbox' });
    }

    // Build query parameters
    const params = new URLSearchParams({
      bbox: bbox as string,
      type: (type as string) || 'subjects',
      proj: (proj as string) || 'oc-api:default-subjects',
      format: (format as string) || 'json',
      rows: (rows as string) || '100'
    });

    // Log the request for debugging
    console.log('🏛️ Open Context API request:', OPEN_CONTEXT_API + '?' + params.toString());

    // Fetch from Open Context API
    const response = await fetch(`${OPEN_CONTEXT_API}?${params}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'LiDAR-Scan/1.0 (Archaeological Research Tool)'
      }
    });

    if (!response.ok) {
      console.error('Open Context API error:', response.status, response.statusText);
      return res.status(response.status).json({
        error: 'Open Context API error',
        status: response.status,
        statusText: response.statusText
      });
    }

    const data = await response.json();

    // Log successful response
    console.log('✅ Open Context API response:', {
      totalRecords: data['totalResults'] || data['oc-api:has-results'] || 0,
      returned: data['oc-api:has-record-count'] || 0
    });

    // Return the data
    return res.status(200).json(data);

  } catch (error) {
    console.error('Error in Open Context proxy:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
