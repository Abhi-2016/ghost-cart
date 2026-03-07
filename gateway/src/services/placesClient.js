/**
 * placesClient.js
 *
 * Thin wrapper around the Google Places Nearby Search API.
 * The API key lives in gateway/.env and never leaves this process.
 *
 * API docs: https://developers.google.com/maps/documentation/places/web-service/search-nearby
 */

const axios = require('axios');

const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';

const placesAxios = axios.create({
  baseURL: PLACES_BASE,
  timeout: 10_000,
});

/**
 * Search for a named store near the given coordinates.
 *
 * @param {string} storeName   - Display name to search for (e.g. "Walmart")
 * @param {number} lat         - User's latitude
 * @param {number} lng         - User's longitude
 * @param {number} radiusMetres - Search radius (default 10 km)
 * @returns {{ name: string, lat: number, lng: number } | null}
 */
async function findStore(storeName, lat, lng, radiusMetres = 10_000) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!apiKey) {
    throw new Error('GOOGLE_PLACES_API_KEY is not set in the environment.');
  }

  const response = await placesAxios.get('/nearbysearch/json', {
    params: {
      location: `${lat},${lng}`,
      radius: radiusMetres,
      keyword: storeName,
      key: apiKey,
    },
  });

  const { results, status } = response.data;

  // ZERO_RESULTS is not an error — it just means no match nearby
  if (status === 'ZERO_RESULTS' || !results || results.length === 0) {
    return null;
  }

  // Google returns results sorted by prominence / distance, so take the first
  const best = results[0];
  return {
    name: storeName, // keep our internal name, not Google's
    lat: best.geometry.location.lat,
    lng: best.geometry.location.lng,
  };
}

module.exports = { findStore };
