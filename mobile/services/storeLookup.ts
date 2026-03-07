/**
 * storeLookup.ts
 *
 * Calls the gateway's /api/v1/stores/locate endpoint to get the real-world
 * GPS coordinates of each supported store near the user.
 *
 * The gateway holds the Google Places API key — this file never touches it.
 */

import axios from 'axios';
import { StoreCoords } from '../store/useCartStore';

// Keep this in sync with services/api.ts
const BASE_URL = 'http://localhost:3000';

export type StoreLocation = {
  name: string;
  coords: StoreCoords | null;
};

/**
 * Given the user's current GPS position and a list of store names to look up,
 * returns the real-world coordinates of each store (or null if not found nearby).
 *
 * @param userCoords - The user's current GPS position
 * @param storeNames - Store names to search for (e.g. ["Walmart", "FreshCo"])
 */
export async function lookupStoreLocations(
  userCoords: StoreCoords,
  storeNames: string[]
): Promise<StoreLocation[]> {
  const { data } = await axios.post<{ results: StoreLocation[] }>(
    `${BASE_URL}/api/v1/stores/locate`,
    {
      lat: userCoords.lat,
      lng: userCoords.lng,
      storeNames,
    },
    { timeout: 15_000 }
  );
  return data.results;
}
