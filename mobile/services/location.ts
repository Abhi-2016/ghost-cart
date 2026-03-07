import * as ExpoLocation from 'expo-location';
import { Store, StoreCoords } from '../store/useCartStore';

// How often to poll GPS (milliseconds)
export const POLL_INTERVAL_MS = 30_000;

/**
 * Ask the user for location permission.
 * Returns true if granted, false if denied.
 */
export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
  return status === 'granted';
}

/**
 * Get the phone's current GPS position once.
 */
export async function getCurrentPosition(): Promise<StoreCoords | null> {
  try {
    const location = await ExpoLocation.getCurrentPositionAsync({
      accuracy: ExpoLocation.Accuracy.Balanced,
    });
    return {
      lat: location.coords.latitude,
      lng: location.coords.longitude,
    };
  } catch {
    return null;
  }
}

/**
 * Calculate the straight-line distance in metres between two GPS points.
 * Uses the Haversine formula — the standard way to measure distances on a sphere.
 */
export function distanceMetres(a: StoreCoords, b: StoreCoords): number {
  const R = 6_371_000; // Earth's radius in metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.asin(Math.sqrt(haversine));
}

/**
 * Given the user's current position and the list of stores,
 * return the first store that the user is within range of.
 * Returns null if the user is not near any saved store.
 */
export function findNearbyStore(
  userCoords: StoreCoords,
  stores: Store[]
): Store | null {
  for (const store of stores) {
    // Skip stores that haven't had their location saved yet
    if (!store.coords || store.type === 'none') continue;

    const distance = distanceMetres(userCoords, store.coords);
    if (distance <= store.radiusMetres) {
      return store;
    }
  }
  return null;
}
