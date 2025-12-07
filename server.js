import express from 'express';
import cors from 'cors';
import { createServer } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import dotenv from 'dotenv';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// OAuth 1.0a setup
const oauth = new OAuth({
  consumer: {
    key: process.env.VITE_X_CONSUMER_KEY,
    secret: process.env.VITE_X_CONSUMER_SECRET,
  },
  signature_method: 'HMAC-SHA1',
  hash_function(baseString, key) {
    return crypto.createHmac('sha1', key).update(baseString).digest('base64');
  },
});

const token = {
  key: process.env.VITE_X_ACCESS_TOKEN,
  secret: process.env.VITE_X_ACCESS_TOKEN_SECRET,
};

// Proxy endpoint for X API
app.get('/api/x/search', async (req, res) => {
  try {
    const { query, max_results = '50' } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    const url = 'https://api.twitter.com/2/tweets/search/recent';
    const params = {
      query: query,
      max_results: max_results,
      'tweet.fields': 'created_at,author_id,public_metrics,attachments,entities',
      expansions: 'author_id,attachments.media_keys',
      'media.fields': 'type,url,preview_image_url',
      'user.fields': 'username,name,verified',
    };

    const requestData = {
      url: url,
      method: 'GET',
    };

    const authHeader = oauth.toHeader(oauth.authorize(requestData, token));
    
    const queryString = new URLSearchParams(params).toString();
    const fullUrl = `${url}?${queryString}`;

    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        Authorization: authHeader.Authorization,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('X API Proxy Error:', error);
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  app.use(vite.ssrLoadModule);
  app.use('*', async (req, res) => {
    try {
      const url = req.originalUrl;
      const template = await vite.transformIndexHtml(url, `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Stanford Watch</title>
          </head>
          <body>
            <div id="root"></div>
            <script type="module" src="/index.tsx"></script>
          </body>
        </html>
      `);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      console.error(e);
      res.status(500).end(e.message);
    }
  });

  const port = 3000;
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

startServer();

