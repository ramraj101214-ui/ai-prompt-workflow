require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const rateLimit = require('express-rate-limit');

const app = express();

const port = process.env.PORT || 3000;
const nodeEnv = process.env.NODE_ENV || 'development';

/* =========================================================
   ENVIRONMENT CHECK
========================================================= */

if (
  !process.env.GEMINI_API_KEY ||
  process.env.GEMINI_API_KEY === 'your_key_here'
) {
  console.error('❌ GEMINI_API_KEY not properly configured in .env');
  process.exit(1);
}

/* =========================================================
   SECURITY HEADERS
========================================================= */

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  // Updated CSP to allow new UI dependencies: FontAwesome, Google Fonts
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; " +
    "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; " +
    "img-src 'self' data:;"
  );

  // Do NOT use HSTS on localhost HTTP development server
  if (nodeEnv === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  }

  next();
});

/* =========================================================
   CORS
========================================================= */

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean)
  : ['http://localhost:3000'];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
  })
);

/* =========================================================
   BODY PARSER
========================================================= */

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

/* =========================================================
   RATE LIMITER
========================================================= */

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    error: 'Too many requests. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', limiter);

/* =========================================================
   STATIC FRONTEND
========================================================= */

app.use(express.static(path.join(__dirname, 'public')));

/* =========================================================
   GEMINI
========================================================= */

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

/*
  Primary model first.
  Fallback model if the primary is temporarily unavailable.
*/
const MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
];

/* =========================================================
   HELPER FUNCTIONS
========================================================= */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableError(error) {
  const status = Number(error?.status);
  const message = error?.message || '';

  return (
    [429, 500, 502, 503, 504].includes(status) ||
    /UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|temporarily/i.test(
      message
    )
  );
}

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: nodeEnv
  });
});

/* =========================================================
   GENERATE RESPONSE
========================================================= */

app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, temperature } = req.body;

    /* -------------------------
       VALIDATE PROMPT
    ------------------------- */

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        error: 'Prompt must be a non-empty string.'
      });
    }

    if (prompt.trim().length === 0) {
      return res.status(400).json({
        error: 'Prompt cannot be empty or whitespace only.'
      });
    }

    if (prompt.length > 10000) {
      return res.status(400).json({
        error:
          'Prompt exceeds maximum length of 10000 characters.'
      });
    }

    /* -------------------------
       TRY MODELS
    ------------------------- */

    let response = null;
    let lastError = null;

    for (const model of MODELS) {
      console.log(`🤖 Trying model: ${model}`);

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          console.log(
            `   Attempt ${attempt}/2`
          );

          response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            generationConfig: {
              temperature: parseFloat(temperature) || 0.7,
              maxOutputTokens: 2048
            }
          });

          if (response?.text) {
            console.log(
              `✅ Response received from ${model}`
            );

            break;
          }

          throw new Error(
            `Empty response from ${model}`
          );

        } catch (error) {
          lastError = error;

          console.error(
            `❌ ${model} attempt ${attempt} failed:`,
            error.message
          );

          /*
             Don't retry permanent errors.
          */

          if (!isRetryableError(error)) {
            throw error;
          }

          /*
             Stop retrying this model after 2 attempts.
          */

          if (attempt === 2) {
            console.log(
              `⚠️ ${model} unavailable. Trying next model...`
            );

            break;
          }

          /*
             2 sec → 4 sec
          */

          const delay =
            2000 * Math.pow(2, attempt - 1);

          console.log(
            `⏳ Retrying in ${delay / 1000}s...`
          );

          await sleep(delay);
        }
      }

      /*
         If we received a valid response,
         stop trying other models.
      */

      if (response?.text) {
        break;
      }
    }

    /* =====================================================
       NO RESPONSE FROM ANY MODEL
    ===================================================== */

    if (!response?.text) {
      throw (
        lastError ||
        new Error('Gemini returned an empty response.')
      );
    }

    /* =====================================================
       SUCCESS
    ===================================================== */

    return res.json({
      result: response.text
    });

  } catch (error) {

    console.error(
      '❌ Gemini API Error:',
      error.message
    );

    console.error('Error Details:', {
      message: error.message,
      status: error.status,
      code: error.code
    });

    const status = Number(error?.status);
    const message = error?.message || '';

    let statusCode = 500;
    let errorMessage = 'Server error.';

    /* =====================================================
       ERROR HANDLING
    ===================================================== */

    if (
      status === 503 ||
      /UNAVAILABLE|high demand/i.test(message)
    ) {
      statusCode = 503;
      errorMessage =
        'Gemini is temporarily busy. Please try again.';
    }

    else if (
      status === 429 ||
      /RESOURCE_EXHAUSTED/i.test(message)
    ) {
      statusCode = 429;
      errorMessage =
        'Gemini request limit reached. Please try again later.';
    }

    else if (
      status === 401 ||
      status === 403 ||
      /API_KEY|PERMISSION_DENIED/i.test(message)
    ) {
      statusCode = 401;
      errorMessage =
        'Gemini API key is invalid or not authorized.';
    }

    else if (
      status === 404 ||
      /NOT_FOUND/i.test(message)
    ) {
      statusCode = 404;
      errorMessage =
        'The selected Gemini model is unavailable.';
    }

    else if (
      status === 400 ||
      /INVALID_ARGUMENT/i.test(message)
    ) {
      statusCode = 400;
      errorMessage =
        'Invalid request sent to Gemini API.';
    }

    else if (
      status === 500 ||
      status === 502 ||
      status === 504
    ) {
      statusCode = 503;
      errorMessage =
        'Gemini service is temporarily unavailable. Please try again.';
    }

    /* =====================================================
       RESPONSE
    ===================================================== */

    return res.status(statusCode).json({
      error: errorMessage,

      ...(nodeEnv === 'development' && {
        debug: message
      })
    });
  }
});

/* =========================================================
   START SERVER
========================================================= */

const server = app.listen(port, () => {
  console.log('');
  console.log('======================================');
  console.log('🤖 AI ASSISTANT SERVER');
  console.log('======================================');
  console.log(
    `✅ Server: http://localhost:${port}`
  );
  console.log(
    `❤️ Health: http://localhost:${port}/health`
  );
  console.log(
    `📡 Environment: ${nodeEnv}`
  );
  console.log(
    `🔒 API Key configured: ${
      process.env.GEMINI_API_KEY ? 'Yes' : 'No'
    }`
  );
  console.log(
    `🧠 Primary model: ${MODELS[0]}`
  );
  console.log(
    `🔄 Fallback model: ${MODELS[1]}`
  );
  console.log('======================================');
  console.log('');
});

/* =========================================================
   GRACEFUL SHUTDOWN
========================================================= */

function shutdown(signal) {
  console.log(
    `⚠️ ${signal} received, shutting down...`
  );

  server.close(() => {
    console.log('✅ Server closed.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error(
      '❌ Forced shutdown after timeout.'
    );
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
