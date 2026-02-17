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

// CREDENTIALS (hardcoded - no need to send from Playdate!)
const SPOTIFY_CLIENT_ID = "5c33c0c9cfd645688c80d577666a1711";
const SPOTIFY_CLIENT_SECRET = "0bcf51df874649bbb74a52ebc1d102de";
const SPOTIFY_REFRESH_TOKEN = "AQAuLogtlUeFjALskTBpn-7E5GbB1ZKE1AO2eJESL60q0oyBlprPDq2UyQiVJLCWS5b-ugJUvNJnLZFzO_kQ34OWDxGTpUSQX_JxEmaA1jDUluQLlZKa1nveD3lOpJAurFg";

// Token refresh
async function doRefreshToken() {
    try {
        const response = await axios.post(
            'https://accounts.spotify.com/api/token',
            new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: SPOTIFY_REFRESH_TOKEN
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64')
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

// Auto-refresh token before it expires
async function ensureToken() {
    if (!spotifyToken || Date.now() >= tokenExpiry - 60000) {
        await doRefreshToken();
    }
    return spotifyToken;
}

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

// Simple refresh endpoint (called by Playdate on startup)
app.get('/refresh', async (req, res) => {
    console.log('🔄 Refresh requested');
    const token = await doRefreshToken();
    
    if (token) {
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Token refresh failed' });
    }
});

// Simplified player endpoint
app.get('/player', async (req, res) => {
    console.log('📥 Player');
    const token = await ensureToken();
    
    if (!token) {
        return res.status(401).json({ error: 'No token' });
    }
    
    try {
        const response = await axios.get(
            'https://api.spotify.com/v1/me/player',
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        
        const data = response.data;
        const images = data.item?.album?.images || [];
        const coverUrl = images[images.length - 1]?.url || null;
        
        res.json({
            is_playing: data.is_playing,
            progress_ms: data.progress_ms,
            track_name: data.item?.name || 'Unknown',
            artist_name: data.item?.artists?.[0]?.name || 'Unknown',
            album_name: data.item?.album?.name || '',
            duration_ms: data.item?.duration_ms || 0,
            cover_url: coverUrl,
            shuffle: data.shuffle_state,
            repeat_mode: data.repeat_state
        });
        console.log('✅ Player:', data.item?.name);
    } catch (error) {
        console.error('❌ Player error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});

// Playlists
app.get('/playlists', async (req, res) => {
    console.log('📥 Playlists');
    const token = await ensureToken();
    if (!token) return res.status(401).json({ error: 'No token' });
    
    try {
        const response = await axios.get(
            'https://api.spotify.com/v1/me/playlists?limit=20',
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const playlists = response.data.items.map(p => ({ id: p.id, name: p.name }));
        res.json({ playlists });
        console.log('✅ Playlists:', playlists.length);
    } catch (error) {
        console.error('❌', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});

// Play playlist
app.post('/play_playlist', async (req, res) => {
    const playlistId = req.query.id;
    console.log('📥 Play playlist:', playlistId);
    const token = await ensureToken();
    if (!token) return res.status(401).json({ error: 'No token' });
    
    try {
        await axios.put(
            'https://api.spotify.com/v1/me/player/play',
            { context_uri: `spotify:playlist:${playlistId}` },
            { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
        );
        res.json({ success: true });
        console.log('✅ Playing playlist');
    } catch (error) {
        console.error('❌', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});

// Shuffle
app.post('/shuffle', async (req, res) => {
    const shuffleState = req.query.state;
    console.log('📥 Shuffle:', shuffleState);
    const token = await ensureToken();
    if (!token) return res.status(401).json({ error: 'No token' });
    
    try {
        await axios.put(
            `https://api.spotify.com/v1/me/player/shuffle?state=${shuffleState}`,
            {},
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        res.json({ success: true });
        console.log('✅ Shuffle:', shuffleState);
    } catch (error) {
        console.error('❌', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});

// Repeat
app.post('/repeat', async (req, res) => {
    const repeatState = req.query.state;
    console.log('📥 Repeat:', repeatState);
    const token = await ensureToken();
    if (!token) return res.status(401).json({ error: 'No token' });
    
    try {
        await axios.put(
            `https://api.spotify.com/v1/me/player/repeat?state=${repeatState}`,
            {},
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        res.json({ success: true });
        console.log('✅ Repeat:', repeatState);
    } catch (error) {
        console.error('❌', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});

// Play
app.post('/spotify/me/player/play', async (req, res) => {
    console.log('📥 Play');
    const token = await ensureToken();
    if (!token) return res.status(401).json({ error: 'No token' });
    
    try {
        await axios.put(
            'https://api.spotify.com/v1/me/player/play',
            {},
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        res.json({ success: true });
        console.log('✅ Playing');
    } catch (error) {
        console.error('❌', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});

// Pause
app.post('/spotify/me/player/pause', async (req, res) => {
    console.log('📥 Pause');
    const token = await ensureToken();
    if (!token) return res.status(401).json({ error: 'No token' });
    
    try {
        await axios.put(
            'https://api.spotify.com/v1/me/player/pause',
            {},
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        res.json({ success: true });
        console.log('✅ Paused');
    } catch (error) {
        console.error('❌', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});

// Next
app.post('/spotify/me/player/next', async (req, res) => {
    console.log('📥 Next');
    const token = await ensureToken();
    if (!token) return res.status(401).json({ error: 'No token' });
    
    try {
        await axios.post(
            'https://api.spotify.com/v1/me/player/next',
            {},
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        res.json({ success: true });
        console.log('✅ Next');
    } catch (error) {
        console.error('❌', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});

// Previous
app.post('/spotify/me/player/previous', async (req, res) => {
    console.log('📥 Previous');
    const token = await ensureToken();
    if (!token) return res.status(401).json({ error: 'No token' });
    
    try {
        await axios.post(
            'https://api.spotify.com/v1/me/player/previous',
            {},
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        res.json({ success: true });
        console.log('✅ Previous');
    } catch (error) {
        console.error('❌', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});

// Volume
app.post('/spotify/me/player/volume', async (req, res) => {
    const volume = req.query.volume_percent;
    console.log('📥 Volume:', volume);
    const token = await ensureToken();
    if (!token) return res.status(401).json({ error: 'No token' });
    
    try {
        await axios.put(
            `https://api.spotify.com/v1/me/player/volume?volume_percent=${volume}`,
            {},
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        res.json({ success: true });
        console.log('✅ Volume:', volume);
    } catch (error) {
        console.error('❌', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});

// Devices
app.get('/spotify/me/player/devices', async (req, res) => {
    console.log('📥 Devices');
    const token = await ensureToken();
    if (!token) return res.status(401).json({ error: 'No token' });
    
    try {
        const response = await axios.get(
            'https://api.spotify.com/v1/me/player/devices',
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        res.json(response.data);
        console.log('✅ Devices:', response.data.devices?.length);
    } catch (error) {
        console.error('❌', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎵 Spotify Proxy running on port ${PORT}`);
    console.log('🌍 Ready to accept connections');
    
    // Auto-refresh token on startup
    doRefreshToken().then(() => {
        console.log('🚀 Ready!');
    });
});
