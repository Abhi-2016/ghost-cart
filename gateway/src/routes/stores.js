/**
 * stores.js — POST /api/v1/stores/locate
 *
 * Given the user's GPS coordinates and a list of store names,
 * returns the real-world GPS location of each store using Google Places.
 *
 * Results are cached for 24 hours (stores don't move) to minimise API spend.
 */

const express = require('express');
const { z } = require('zod');
const cache = require('../services/cache');
const { findStore } = require('../services/placesClient');

const router = express.Router();

// --- Zod validation schema ---
const LocateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  storeNames: z.array(z.string().min(1)).min(1).max(20),
});

// TTL for store location cache: 24 hours in seconds
const STORE_CACHE_TTL = 60 * 60 * 24;

/**
 * POST /api/v1/stores/locate
 *
 * Body: { lat: number, lng: number, storeNames: string[] }
 * Response: { results: [{ name: string, coords: { lat, lng } | null }] }
 */
router.post('/locate', async (req, res, next) => {
  try {
    const parsed = LocateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const { lat, lng, storeNames } = parsed.data;

    // Run all store lookups in parallel
    const results = await Promise.all(
      storeNames.map(async (name) => {
        // Cache key: precision of 0.1° ≈ 11 km — enough for "near this city"
        const cacheKey = `places:${name}:${lat.toFixed(1)}:${lng.toFixed(1)}`;
        const cached = cache.get(cacheKey);

        if (cached !== undefined) {
          return { name, coords: cached, _cache: 'HIT' };
        }

        // Miss → call Google Places
        let coords = null;
        try {
          const found = await findStore(name, lat, lng);
          if (found) {
            coords = { lat: found.lat, lng: found.lng };
          }
        } catch (err) {
          // Log but don't crash the whole request for one store lookup failure
          console.error(`[StoreLookup] Google Places error for "${name}":`, err.message);
        }

        // Store null results too (so we don't hammer Google for unknown stores)
        cache.set(cacheKey, coords, STORE_CACHE_TTL);
        return { name, coords, _cache: 'MISS' };
      })
    );

    return res.json({ results });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
