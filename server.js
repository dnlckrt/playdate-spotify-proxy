// Spotify Proxy für Playdate (Render.com Version)
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(cors());

let spotifyToken = null;
let tokenExpiry = 0;

// HARDCODED CREDENTIALS - Change these to your values!
const SPOTIFY_CLIENT_ID = "5c33c0c9cfd645688c80d577666a1711";
const SPOTIFY_CLIENT_SECRET = "0bcf51df874649bbb74a52ebc1d102de";
const SPOTIFY_REFRESH_TOKEN = "AQAuLogtlUeFjALskTBpn-7E5GbB1ZKE1AO2eJESL60q0oyBlprPDq2UyQiVJLCWS5b-ugJUvNJnLZFzO_kQ34OWDxGTpUSQX_JxEmaA1jDUluQLlZKa1nveD3lOpJAurFg";

// Token refresh
async function refreshToken(clientId, clientSecret, refreshToken) {
    try {
        const response = await axios.post(
            'https://accounts.spotify.com/api/token',
            new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
                }
            }
        );
        
        spotifyToken = response.data.access_token;
        tokenExpiry = Date.now() + (response.data.expires_in * 1000);
        console.log('✅ Token refreshed');
        return spotifyToken;
    } catch (error) {
        console.error('❌ Token refresh failed:', error.response?.data || error.message);
        return null;
    }
}

// Token refresh endpoint - POST version
app.post('/auth/refresh', async (req, res) => {
    const { clientId, clientSecret, refreshToken: userRefreshToken } = req.body;
    
    if (!clientId || !clientSecret || !userRefreshToken) {
        return res.status(400).json({ error: 'Missing credentials' });
    }
    
    const token = await refreshToken(clientId, clientSecret, userRefreshToken);
    
    if (token) {
        res.json({ access_token: token, expires_in: 3600 });
    } else {
        res.status(401).json({ error: 'Token refresh failed' });
    }
});

// Token refresh endpoint - GET version (for Playdate compatibility)
app.get('/auth/refresh', async (req, res) => {
    const { clientId, clientSecret, refreshToken: userRefreshToken } = req.query;
    
    if (!clientId || !clientSecret || !userRefreshToken) {
        return res.status(400).json({ error: 'Missing credentials' });
    }
    
    const token = await refreshToken(clientId, clientSecret, userRefreshToken);
    
    if (token) {
        res.json({ access_token: token, expires_in: 3600 });
    } else {
        res.status(401).json({ error: 'Token refresh failed' });
    }
});

// SIMPLE refresh endpoint - uses hardcoded credentials (for Playdate)
app.get('/refresh', async (req, res) => {
    console.log('🔄 Simple refresh requested...');
    
    const token = await refreshToken(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN);
    
    if (token) {
        res.json({ success: true, expires_in: 3600 });
    } else {
        res.status(401).json({ error: 'Token refresh failed' });
    }
});

// Spotify API Proxy
app.all('/spotify/*', async (req, res) => {
    console.log('📥 Request:', req.method, req.params[0]);
    const spotifyPath = req.params[0];
    
    // Check if we have a valid token
    if (!spotifyToken || Date.now() >= tokenExpiry) {
        return res.status(401).json({ error: 'No valid token. Call /auth/refresh first.' });
    }
    
    try {
        const response = await axios({
            method: req.method,
            url: `https://api.spotify.com/v1/${spotifyPath}`,
            headers: {
                'Authorization': `Bearer ${spotifyToken}`,
                'Content-Type': 'application/json'
            },
            params: req.query,
            data: req.body
        });
        
        console.log('✅ Success:', req.method, req.params[0]);
        res.json(response.data);
    } catch (error) {
        console.error(`❌ Spotify API Error [${req.method} ${spotifyPath}]:`, error.response?.data || error.message);
        res.status(error.response?.status || 500).json(
            error.response?.data || { error: 'Proxy error' }
        );
    }
});

// Health check
app.get('/health', (req, res) => {
    console.log('💓 Health check');
    res.json({ 
        status: 'ok', 
        hasToken: !!spotifyToken,
        tokenExpiry: new Date(tokenExpiry).toISOString(),
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({ 
        message: '🎵 Spotify Proxy for Playdate',
        status: 'running',
        endpoints: {
            health: '/health',
            auth: '/auth/refresh',
            spotify: '/spotify/*'
        },
        docs: 'Send requests to /spotify/* endpoints with proper Authorization header'
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎵 Spotify Proxy running on port ${PORT}`);
    console.log(`🌍 Ready to accept connections`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('👋 SIGTERM received, shutting down gracefully');
    process.exit(0);
});
