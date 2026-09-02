const express = require('express');
const cors = require('cors');
const path = require('path');

// Express application initialize
const app = express();

// Middleware setup
app.use(cors());
app.use(express.json());

// Public folder jahan index.html rakhi hai use serve karna
app.use(express.static(path.join(__dirname, 'public')));

// Render ke Environment Variables se API key lena
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// 1. Health Check Route (Check karne ke liye server live hai ya nahi)
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'RAGAA Backend Server Running Successfully!' });
});

// 2. YouTube Search API Endpoint
app.get('/api/search', async (req, res) => {
  try {
    const rawQuery = req.query.q ? req.query.q.trim() : 'Latest Bollywood Songs';

    // Agar API Key Render me nahi dali gayi ho to clear message dena
    if (!YOUTUBE_API_KEY) {
      console.error('Error: YOUTUBE_API_KEY environment variable is not defined.');
      return res.status(500).json({ 
        error: 'Server configuration error: YOUTUBE_API_KEY Render par missing hai. Environment variables check karein.' 
      });
    }

    // Exact user query YouTube API par bhejna taaki exact song mile
    const youtubeEndpoint = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=20&q=${encodeURIComponent(rawQuery)}&type=video&key=${YOUTUBE_API_KEY}`;

    const apiResponse = await fetch(youtubeEndpoint);
    const data = await apiResponse.json();

    // Agar YouTube API ne koi error throw kiya (jaise quota ya invalid key)
    if (!apiResponse.ok) {
      console.error('YouTube API Error Response:', data);
      const errorMessage = data.error && data.error.message ? data.error.message : 'Failed to fetch tracks from YouTube API.';
      return res.status(apiResponse.status).json({ error: errorMessage });
    }

    // Successful response browser ko return karna
    res.json(data);
  } catch (error) {
    console.error('Server Internal Error:', error);
    res.status(500).json({ error: 'Internal Server Error: ' + error.message });
  }
});

// 3. Fallback Route: Agar koi direct URL open kare to index.html serve ho
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 4. Port Configuration (Render automatically PORT provide karta hai)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🎵 RAGAA Server is running on Port: ${PORT}`);
  console.log(`=========================================`);
});
