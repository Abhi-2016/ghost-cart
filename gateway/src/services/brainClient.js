const axios = require('axios');

const BRAIN_BASE_URL = process.env.BRAIN_BASE_URL || 'http://localhost:8000';
const BRAIN_INTERNAL_SECRET = process.env.BRAIN_INTERNAL_SECRET;

const client = axios.create({
  baseURL: BRAIN_BASE_URL,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
    // Shared secret so brain rejects requests not coming from the gateway
    ...(BRAIN_INTERNAL_SECRET && { 'X-Internal-Secret': BRAIN_INTERNAL_SECRET }),
  },
});

/**
 * Forward a recommendation request to the Python brain.
 * @param {{ query: string, location: { lat: number, lng: number }, radius_km: number }} payload
 */
async function recommend(payload) {
  const { data } = await client.post('/v1/recommend', payload);
  return data;
}

/**
 * Forward a process-intent request to the Python brain.
 * @param {{ store: { name: string, type: string }, user_list: string[], purchase_history: object[] }} payload
 */
async function processIntent(payload) {
  const { data } = await client.post('/v1/process-intent', payload);
  return data;
}

/**
 * Run the agentic restock loop on the brain.
 * @param {{ store: { name: string, type: string }, current_list: string[], purchase_history: object[] }} payload
 */
async function checkRestock(payload) {
  const { data } = await client.post('/v1/restock', payload);
  return data;
}

module.exports = { recommend, processIntent, checkRestock };
