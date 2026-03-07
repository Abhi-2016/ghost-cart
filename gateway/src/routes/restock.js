/**
 * restock.js — POST /api/v1/restock/check
 *
 * Proxies restock requests from the mobile app to the brain's agentic
 * restock endpoint. No caching — restock decisions are personal and
 * time-sensitive (based on each user's purchase history).
 */

const express = require('express');
const { z } = require('zod');
const { checkRestock } = require('../services/brainClient');

const router = express.Router();

const RestockSchema = z.object({
  store: z.object({
    name: z.string().min(1),
    type: z.string().min(1),
  }),
  current_list: z.array(z.string()).default([]),
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
});

router.post('/check', async (req, res, next) => {
  try {
    const parsed = RestockSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: parsed.error.flatten(),
      });
    }

    const result = await checkRestock(parsed.data);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
