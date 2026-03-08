/**
 * nudge.js — POST /api/v1/nudge/check
 *
 * Proxies nudge-decision requests from the mobile app to the brain's
 * agentic nudge endpoint. No caching — this is a real-time personal
 * decision based on each user's exact purchase history and timing.
 */

const express = require('express');
const { z } = require('zod');
const { checkNudge } = require('../services/brainClient');

const router = express.Router();

const NudgeSchema = z.object({
  purchase_history: z
    .array(
      z.object({
        name: z.string().min(1),
        last_bought_at_ms: z.number().int().positive(),
        store_where: z.string().min(1),
        count: z.number().int().min(1),
      })
    )
    .default([]),
  current_list: z.array(z.string()).default([]),
  // Precomputed by mobile: (now - max(lastBoughtAt)) / 86_400_000
  days_since_last_trip: z.number().nonnegative(),
});

router.post('/check', async (req, res, next) => {
  try {
    const parsed = NudgeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: parsed.error.flatten(),
      });
    }

    const result = await checkNudge(parsed.data);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
