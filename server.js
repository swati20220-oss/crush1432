const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. Neon Database Connection Setup
const DATABASE_URL = process.env.DATABASE_URL;
let pool = null;

if (DATABASE_URL) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Neon SSL ke liye mandatory hai
  });

  // Table Auto-Creation Logic
  const initDb = async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS search_cache (
          id SERIAL PRIMARY KEY,
          search_query VARCHAR(255) UNIQUE NOT NULL,
          results JSONB NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('✅ Connected to Neon Database & search_cache table ready!');
    } catch (err) {
      console.error('❌ Neon Database connection error:', err.message);
    }
  };
  initDb();
} else {
  console.warn('⚠️ DATABASE_URL Render par missing hai. Cache memory me chalega.');
}

// 2. Multi-Key YouTube API Manager
const rawKeys = process.env.YOUTUBE_API_KEY || '';
const API_KEYS = rawKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
let currentKeyIndex = 0;

function getActiveKey() {
  if (API_KEYS.length === 0) return null;
  return API_KEYS[currentKeyIndex % API_KEYS.length];
}

function rotateToNextKey() {
  if (API_KEYS.length > 1) {
    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
    console.log(`[API Switch] Switched to Key Index: ${currentKeyIndex}`);
  }
}

// 3. Search Route: Neon DB First -> Then YouTube API Fallback
app.get('/api/search', async (req, res) => {
  try {
    const rawQuery = req.query.q ? req.query.q.trim() : 'Latest Bollywood Songs';
    const normalizedQuery = rawQuery.toLowerCase();

    // STEP A: Pehle Neon Database me check karo
    if (pool) {
      try {
        const dbResult = await pool.query(
          'SELECT results FROM search_cache WHERE search_query = $1',
          [normalizedQuery]
        );
        if (dbResult.rows.length > 0) {
          console.log(`⚡ [Neon Cache Hit] Serving from Database: "${rawQuery}"`);
          return res.json(dbResult.rows[0].results);
        }
      } catch (dbErr) {
        console.warn('DB Fetch failed, falling back to YouTube API:', dbErr.message);
      }
    }

    // STEP B: Agar DB me nahi hai, YouTube API se lao
    if (API_KEYS.length === 0) {
      return res.status(500).json({ error: 'Render par YOUTUBE_API_KEY set nahi hai.' });
    }

    let attempts = 0;
    let successData = null;
    let lastError = null;

    while (attempts < API_KEYS.length) {
      const activeKey = getActiveKey();
      const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=20&q=${encodeURIComponent(rawQuery)}&type=video&key=${activeKey}`;

      try {
        const response = await fetch(apiUrl);
        const data = await response.json();

        if (response.status === 403) {
          console.warn(`[Quota Limit] Key ${currentKeyIndex} exhausted.`);
          rotateToNextKey();
          attempts++;
          continue;
        }

        if (!response.ok) {
          throw new Error(data.error ? data.error.message : 'YouTube API Error');
        }

        successData = data;
        break;
      } catch (err) {
        lastError = err.message;
        rotateToNextKey();
        attempts++;
      }
    }

    if (!successData) {
      return res.status(500).json({ error: 'Failed to fetch tracks. ' + (lastError || '') });
    }

    // STEP C: Background me Neon DB me store karo (Agli baar ke liye instant)
    if (pool && successData.items && successData.items.length > 0) {
      pool.query(
        `INSERT INTO search_cache (search_query, results) 
         VALUES ($1, $2) 
         ON CONFLICT (search_query) DO UPDATE SET results = $2, created_at = CURRENT_TIMESTAMP`,
        [normalizedQuery, JSON.stringify(successData)]
      ).catch(e => console.error('Error saving to Neon:', e.message));
    }

    res.json(successData);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  let dbStatus = 'Disconnected';
  let totalSavedSearches = 0;

  if (pool) {
    try {
      const countRes = await pool.query('SELECT COUNT(*) FROM search_cache');
      dbStatus = 'Connected to Neon';
      totalSavedSearches = parseInt(countRes.rows[0].count);
    } catch (e) {
      dbStatus = 'Error: ' + e.message;
    }
  }

  res.json({
    server: 'Running',
    database: dbStatus,
    savedSearchesInNeon: totalSavedSearches,
    activeKeyIndex: currentKeyIndex
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🎵 RAGAA Server on Port ${PORT}`));
