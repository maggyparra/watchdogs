import type { Plugin } from 'vite';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Load env vars from .env.local
const loadEnvFile = (): Record<string, string> => {
  const envPath = resolve(process.cwd(), '.env.local');
  const env: Record<string, string> = {};
  
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          env[key.trim()] = valueParts.join('=').trim();
        }
      }
    });
  }
  
  return env;
};

export function xApiProxy(): Plugin {
  return {
    name: 'x-api-proxy',
    configureServer(server) {
      // Load environment variables from .env.local
      const env = loadEnvFile();
      
      server.middlewares.use('/api/x/search', async (req, res, next) => {
        if (req.method !== 'GET') {
          return next();
        }

        try {
          const url = new URL(req.url || '', `http://${req.headers.host}`);
          const query = url.searchParams.get('query');
          const maxResultsParam = url.searchParams.get('max_results') || '50';
          // X API requires max_results between 10 and 100
          const maxResults = Math.max(10, Math.min(100, parseInt(maxResultsParam, 10))).toString();

          if (!query) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Query parameter is required' }));
            return;
          }

          // Get credentials from environment
          const consumerKey = env.VITE_X_CONSUMER_KEY || process.env.VITE_X_CONSUMER_KEY;
          const consumerSecret = env.VITE_X_CONSUMER_SECRET || process.env.VITE_X_CONSUMER_SECRET;
          const accessToken = env.VITE_X_ACCESS_TOKEN || process.env.VITE_X_ACCESS_TOKEN;
          const accessTokenSecret = env.VITE_X_ACCESS_TOKEN_SECRET || process.env.VITE_X_ACCESS_TOKEN_SECRET;

          if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'X API credentials not configured' }));
            return;
          }

          // Setup OAuth
          const oauth = new OAuth({
            consumer: {
              key: consumerKey,
              secret: consumerSecret,
            },
            signature_method: 'HMAC-SHA1',
            hash_function(baseString, key) {
              return crypto.createHmac('sha1', key).update(baseString).digest('base64');
            },
          });

          const token = {
            key: accessToken,
            secret: accessTokenSecret,
          };

          const apiUrl = 'https://api.twitter.com/2/tweets/search/recent';
          const params: Record<string, string> = {
            query: query,
            max_results: maxResults,
            'tweet.fields': 'created_at,author_id,public_metrics,attachments,entities',
            expansions: 'author_id,attachments.media_keys',
            'media.fields': 'type,url,preview_image_url',
            'user.fields': 'username,name,verified,profile_image_url',
          };

          const requestData = {
            url: apiUrl,
            method: 'GET',
            data: params,
          };

          const authHeader = oauth.toHeader(oauth.authorize(requestData, token));
          
          const queryString = new URLSearchParams(params).toString();
          const fullUrl = `${apiUrl}?${queryString}`;

          const response = await fetch(fullUrl, {
            method: 'GET',
            headers: {
              Authorization: authHeader.Authorization,
              'Content-Type': 'application/json',
            },
          });

          const data = await response.json();
          
          res.writeHead(response.status, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(JSON.stringify(data));
        } catch (error: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      });
    },
  };
}

