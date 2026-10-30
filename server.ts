/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bootstrap() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json());

  // CORS and iframe headers
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    next();
  });

  // Construct standard Redirect URI
  const getRedirectUri = (req: express.Request): string => {
    if (process.env.APP_URL) {
      return `${process.env.APP_URL.replace(/\/$/, '')}/auth/callback`;
    }
    const host = req.get('host') || `localhost:${PORT}`;
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    return `${protocol}://${host}/auth/callback`;
  };

  // Endpoint: Check if server-side GitHub OAuth app credentials are configured
  app.get('/api/auth/github/status', (_req, res) => {
    const clientId = process.env.CLIENT_ID || process.env.GITHUB_CLIENT_ID || '';
    const hasSecret = Boolean(process.env.CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET);
    res.json({
      configured: Boolean(clientId && hasSecret),
      hasClientId: Boolean(clientId),
      clientId: clientId ? `${clientId.substring(0, 4)}...` : null,
      appUrl: process.env.APP_URL || null,
    });
  });

  // Endpoint: Get GitHub OAuth Authorization URL
  app.get('/api/auth/github/url', (req, res) => {
    const queryClientId = req.query.client_id as string | undefined;
    const clientId = queryClientId || process.env.CLIENT_ID || process.env.GITHUB_CLIENT_ID;

    if (!clientId) {
      res.status(400).json({
        error: 'Missing GitHub Client ID. Set CLIENT_ID environment variable or provide client_id parameter.',
      });
      return;
    }

    const redirectUri = (req.query.redirect_uri as string) || getRedirectUri(req);
    const state = (req.query.state as string) || Math.random().toString(36).substring(2, 15);
    const scope = (req.query.scope as string) || 'repo,read:user,gist';

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      state,
      allow_signup: 'true',
    });

    const url = `https://github.com/login/oauth/authorize?${params.toString()}`;
    res.json({ url, redirectUri, state });
  });

  // Endpoint: Exchange authorization code for GitHub access token
  app.post('/api/auth/github/exchange', async (req, res) => {
    const { code, clientId: clientProvidedId, clientSecret: clientProvidedSecret, redirectUri } = req.body;

    if (!code) {
      res.status(400).json({ error: 'Authorization code is required' });
      return;
    }

    const clientId = clientProvidedId || process.env.CLIENT_ID || process.env.GITHUB_CLIENT_ID;
    const clientSecret = clientProvidedSecret || process.env.CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      res.status(400).json({
        error: 'GitHub OAuth Client ID or Client Secret is missing. Please configure them in environment variables or enter them in the app settings.',
      });
      return;
    }

    try {
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri || getRedirectUri(req),
        }),
      });

      const data = await response.json();

      if (data.error) {
        res.status(400).json({
          error: data.error,
          error_description: data.error_description || 'GitHub OAuth token exchange failed',
        });
        return;
      }

      res.json({
        accessToken: data.access_token,
        tokenType: data.token_type,
        scope: data.scope,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error during token exchange';
      res.status(500).json({ error: 'Server error during GitHub token exchange', details: message });
    }
  });

  // OAuth Callback Route: Serves clean popup closer HTML
  const callbackHandler = (_req: express.Request, res: express.Response) => {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>GitHub Authorization - MP.R Studio</title>
          <style>
            body {
              background: #090d14;
              color: #f1f5f9;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              text-align: center;
              padding: 24px;
            }
            .card {
              background: #0f172a;
              border: 1px solid #1e293b;
              border-radius: 12px;
              padding: 32px 24px;
              max-width: 400px;
            }
            .spinner {
              width: 32px;
              height: 32px;
              border: 3px solid rgba(245, 158, 11, 0.2);
              border-top-color: #f59e0b;
              border-radius: 50%;
              animation: spin 0.8s linear infinite;
              margin: 0 auto 16px;
            }
            @keyframes spin { to { transform: rotate(360deg); } }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="spinner"></div>
            <h2 style="margin: 0 0 8px; font-size: 18px;">Connecting to GitHub...</h2>
            <p style="margin: 0; font-size: 14px; color: #94a3b8;">
              Authentication complete. This window will close automatically.
            </p>
          </div>
          <script>
            (function() {
              const params = new URLSearchParams(window.location.search);
              const code = params.get('code');
              const state = params.get('state');
              const error = params.get('error');
              const errorDescription = params.get('error_description');

              if (window.opener) {
                window.opener.postMessage({
                  type: 'OAUTH_AUTH_SUCCESS',
                  provider: 'github',
                  code: code,
                  state: state,
                  error: error ? (errorDescription || error) : null
                }, '*');
                setTimeout(function() {
                  window.close();
                }, 300);
              } else {
                setTimeout(function() {
                  window.location.href = '/';
                }, 1500);
              }
            })();
          </script>
        </body>
      </html>
    `);
  };

  app.get(['/auth/callback', '/auth/callback/'], callbackHandler);

  // Vite dev middleware or production static files
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[MP.R Server] Running on http://0.0.0.0:${PORT} (env: ${isProd ? 'production' : 'development'})`);
  });
}

bootstrap().catch((err) => {
  console.error('[MP.R Server] Failed to bootstrap:', err);
  process.exit(1);
});
