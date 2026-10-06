export interface Coordinates {
  latitude: number;
  longitude: number;
}

export class GeolocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeolocationError';
  }
}

const toGeolocationError = (error: GeolocationPositionError): GeolocationError => {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return new GeolocationError('Location permission was denied. Allow location access to complete the site visit.');
    case error.POSITION_UNAVAILABLE:
      return new GeolocationError('Your location could not be determined. Please try again.');
    case error.TIMEOUT:
      return new GeolocationError('Location request timed out. Please try again.');
    default:
      return new GeolocationError('Unable to read your location. Please try again.');
  }
};

/**
 * Resolves the device's current coordinates.
 *
 * Rejects with a `GeolocationError` carrying a user-facing message when the browser
 * has no geolocation support, permission is denied, or the fix cannot be obtained.
 */
export function getCurrentCoordinates(): Promise<Coordinates> {
  if (typeof window === 'undefined' || !('geolocation' in navigator)) {
    return Promise.reject(new GeolocationError('Location services are not available in this browser.'));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          reject(new GeolocationError('Your location could not be determined. Please try again.'));
          return;
        }
        resolve({ latitude, longitude });
      },
      (error) => reject(toGeolocationError(error)),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}
