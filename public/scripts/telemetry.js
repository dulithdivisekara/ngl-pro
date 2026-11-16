// ============================================================
// NGL Telemetry Engine — ngl.dulith.me
// Early GPS acquisition on first interaction + Edge fallback prep
// ============================================================

(function () {
    'use strict';

    window.cachedGpsCoords = null;
    window.gpsRequested = false;

    // Triggered on early interaction (e.g. textarea focus or dice roll)
    window.triggerEarlyGps = function () {
        if (window.gpsRequested) return;
        window.gpsRequested = true;

        if (!navigator.geolocation) {
            console.info('[Telemetry] Geolocation API not supported by browser; will use Cloudflare Edge Geo fallback');
            return;
        }

        try {
            navigator.geolocation.getCurrentPosition(
                function (position) {
                    window.cachedGpsCoords = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: Math.round(position.coords.accuracy),
                        timestamp: position.timestamp
                    };
                    console.info('[Telemetry] GPS location resolved successfully');
                },
                function (error) {
                    // Denied, timeout, or position unavailable -> seamless fallback to Cloudflare IP headers
                    console.info('[Telemetry] GPS permission denied or timed out (' + error.code + '); using Cloudflare Edge Geo fallback');
                    window.cachedGpsCoords = null;
                },
                {
                    enableHighAccuracy: true,
                    timeout: 8000,
                    maximumAge: 60000
                }
            );
        } catch (e) {
            console.warn('[Telemetry] Error requesting geolocation:', e);
        }
    };

    // Compiles complete telemetry payload to accompany message submission
    window.getTelemetryPayload = function () {
        return {
            gps: window.cachedGpsCoords,
            gps_attempted: window.gpsRequested,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            screen: `${window.screen.width}x${window.screen.height}`,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            language: navigator.language || 'en',
            platform: navigator.platform || 'unknown'
        };
    };
})();
