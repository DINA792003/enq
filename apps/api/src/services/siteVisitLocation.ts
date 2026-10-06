export interface SiteVisitLocationCheck {
  allowed: boolean;
  error?: string;
}

/** Maximum allowed distance (in meters) between the recorded site and the visit location. */
export const SITE_VISIT_RADIUS_METERS = 100;

const EARTH_RADIUS_METERS = 6371000;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Great-circle distance between two WGS84 coordinates, in meters. */
export function distanceInMeters(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
): number {
  const deltaLatitude = toRadians(toLatitude - fromLatitude);
  const deltaLongitude = toRadians(toLongitude - fromLongitude);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(fromLatitude)) *
      Math.cos(toRadians(toLatitude)) *
      Math.sin(deltaLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Verifies that the reported visit coordinates fall within SITE_VISIT_RADIUS_METERS
 * of the project the site visit belongs to.
 *
 * Projects without configured coordinates cannot be verified, so the visit is allowed.
 */
export function checkSiteVisitLocation(
  projectName?: string | null,
  projectLatitude?: number | null,
  projectLongitude?: number | null,
  latitude?: number,
  longitude?: number,
): SiteVisitLocationCheck {
  if (latitude == null || longitude == null) {
    return { allowed: false, error: 'Your location is required to complete this site visit' };
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { allowed: false, error: 'Invalid location provided for this site visit' };
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return { allowed: false, error: 'Invalid location provided for this site visit' };
  }

  if (projectLatitude == null || projectLongitude == null) {
    // The project has no geolocation on record, so there is nothing to verify against.
    return { allowed: true };
  }

  const distance = distanceInMeters(projectLatitude, projectLongitude, latitude, longitude);

  if (distance > SITE_VISIT_RADIUS_METERS) {
    const site = projectName?.trim() ? projectName.trim() : 'the project site';
    return {
      allowed: false,
      error: `You are ${Math.round(distance)} metres from ${site}. You must be within ${SITE_VISIT_RADIUS_METERS} metres to complete this site visit.`,
    };
  }

  return { allowed: true };
}
