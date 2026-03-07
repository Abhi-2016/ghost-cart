const express = require('express');
const { z } = require('zod');
const brainClient = require('../services/brainClient');
const cache = require('../services/cache');

const router = express.Router();

const CartQuerySchema = z.object({
  query: z.string().min(3).max(500),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  radius_km: z.number().min(0.5).max(50).optional().default(5),
});

/**
 * POST /api/v1/cart/recommend
 * Body: { query, location: { lat, lng }, radius_km? }
 *
 * Returns AI-generated grocery recommendations with nearby store context.
 * Responses are cached by (query + lat/lng rounded to 2 dp) for 10 minutes.
 */
router.post('/recommend', async (req, res, next) => {
  try {
    const parsed = CartQuerySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { query, location, radius_km } = parsed.data;

    // Build a stable cache key — round coords to ~1 km precision
    const cacheKey = `recommend:${query}:${location.lat.toFixed(2)}:${location.lng.toFixed(2)}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ ...cached, _cache: 'HIT' });
    }

    const result = await brainClient.recommend({ query, location, radius_km });

    cache.set(cacheKey, result, 600); // TTL 10 min
    return res.json({ ...result, _cache: 'MISS' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
