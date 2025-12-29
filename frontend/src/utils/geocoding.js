/**
 * Reverse Geocoding Utility
 * Converts GPS coordinates to human-readable address
 */

/**
 * Get address from coordinates using free Nominatim API
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<Object>} - Address details
 */
export async function getAddressFromCoordinates(latitude, longitude) {
  try {
    // Use OpenStreetMap Nominatim (free, no API key required)
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
      {
        headers: {
          'Accept-Language': 'en',
          'User-Agent': 'HRMS-ClockIn-App'
        }
      }
    );

    if (!response.ok) {
      throw new Error('Geocoding API error');
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    const address = data.address || {};

    return {
      success: true,
      fullAddress: data.display_name || 'Address not available',
      shortAddress: formatShortAddress(address),
      details: {
        road: address.road || address.street || '',
        neighbourhood: address.neighbourhood || address.suburb || '',
        city: address.city || address.town || address.village || address.municipality || '',
        state: address.state || '',
        postcode: address.postcode || '',
        country: address.country || ''
      },
      coordinates: {
        latitude,
        longitude
      }
    };
  } catch (error) {
    console.error('[Geocoding] Error:', error);

    // Return basic info even if geocoding fails
    return {
      success: false,
      fullAddress: `GPS: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
      shortAddress: 'Location captured',
      details: null,
      coordinates: {
        latitude,
        longitude
      },
      error: error.message
    };
  }
}

/**
 * Format a short, readable address
 * @param {Object} address - Address details from geocoding
 * @returns {string}
 */
function formatShortAddress(address) {
  const parts = [];

  if (address.road || address.street) {
    parts.push(address.road || address.street);
  }

  if (address.neighbourhood || address.suburb) {
    parts.push(address.neighbourhood || address.suburb);
  }

  if (address.city || address.town || address.village) {
    parts.push(address.city || address.town || address.village);
  }

  if (parts.length === 0) {
    if (address.state) {
      parts.push(address.state);
    }
    if (address.country) {
      parts.push(address.country);
    }
  }

  return parts.length > 0 ? parts.join(', ') : 'Unknown location';
}

/**
 * Format coordinates for display
 * @param {number} latitude
 * @param {number} longitude
 * @returns {string}
 */
export function formatCoordinates(latitude, longitude) {
  const latDir = latitude >= 0 ? 'N' : 'S';
  const lonDir = longitude >= 0 ? 'E' : 'W';

  return `${Math.abs(latitude).toFixed(6)}° ${latDir}, ${Math.abs(longitude).toFixed(6)}° ${lonDir}`;
}

/**
 * Calculate distance between two points (in meters)
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} - Distance in meters
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
