const express = require('express');
const { z } = require('zod');
const brainClient = require('../services/brainClient');
const cache = require('../services/cache');

const router = express.Router();

// Validate the incoming request shape before it touches the brain.
const IntentSchema = z.object({
  store: z.object({
    name: z.string().min(1),
    type: z.string().min(1),
  }),
  user_list: z.array(z.string()).optional().default([]),
  purchase_history: z
    .array(
      z.object({
        item: z.string(),
        last_purchased_days_ago: z.number().int().min(0),
      })
    )
    .optional()
    .default([]),
});

/**
 * POST /api/v1/intent/process-intent
 * Body: { store: { name, type }, user_list?, purchase_history? }
 *
 * Cache key = store name + sorted item list, so the same
 * store + list combo never hits the brain twice within 10 minutes.
 */
router.post('/process-intent', async (req, res, next) => {
  try {
    const parsed = IntentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { store, user_list, purchase_history } = parsed.data;

    // Sort the list so "Milk, Eggs" and "Eggs, Milk" share the same cache entry.
    const sortedList = [...user_list].sort().join(',');
    const cacheKey = `intent:${store.name}:${sortedList}`;

    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ ...cached, _cache: 'HIT' });
    }

    const result = await brainClient.processIntent({ store, user_list, purchase_history });

    cache.set(cacheKey, result, 600);
    return res.json({ ...result, _cache: 'MISS' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
