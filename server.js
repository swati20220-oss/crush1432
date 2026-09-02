const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// Search Endpoint (Filtered for Single Tracks)
app.get('/api/search', async (req, res) => {
  try {
    const rawQuery = req.query.q || 'Top Bollywood Songs';
    
    if (!YOUTUBE_API_KEY) {
      return res.status(500).json({ error: 'Server par YOUTUBE_API_KEY set nahi hai.' });
    }

    // "jukebox" aur "mashup" ko negate karke single official audio/video fetch karna
    const cleanQuery = `${rawQuery} official song -jukebox -mashup -album -hour`;
    const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=24&q=${encodeURIComponent(cleanQuery)}&type=video&videoCategoryId=10&key=${YOUTUBE_API_KEY}`;
    
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error ? data.error.message : 'YouTube API Error' });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
