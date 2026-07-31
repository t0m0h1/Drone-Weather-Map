# Pro Drone Weather Dashboard

A professional-grade web application designed for drone pilots to check real-time flight safety conditions, high-altitude winds, geomagnetic GPS health, LiPo battery temperature thresholds, and live weather radar overlays.

## Features

* **Interactive Map & Geocoding:** Click anywhere on the map, search for locations globally using OpenStreetMap Nominatim, or use your browser's native GPS to pinpoint flight sites.
* **Live Weather Radar:** Integrated RainViewer radar overlay with zoom-level handling to track active precipitation fronts.
* **Aviation Safety Telemetry:**
  * Surface and high-altitude wind tracking (120m AGL).
  * Wind gusts and active precipitation limits.
  * Visibility checks for Visual Line of Sight (VLOS) compliance.
  * Real-time geomagnetic Kp index tracking via NOAA for GPS lock reliability.
  * LiPo battery temperature hazard analysis (cold voltage drop & overheating risks).
  * Civil twilight (sunset) tracking for regulatory compliance.
* **Interchangeable Units:** Instantly toggle wind speeds between meters per second (`m/s`), miles per hour (`mph`), and knots (`kt`) without reloading data.
* **Automated Go / No-Go Engine:** Dynamic evaluation engine that flags specific flight hazards.

---

## Project Structure

```text
├── app.py              # Flask backend server for static file delivery
├── requirements.txt    # Python dependencies
├── static/
│   ├── index.html      # Frontend HTML layout (Tailwind CSS & Leaflet)
│   ├── style.css       # Custom stylesheets
│   └── script.js       # Client-side map rendering, API orchestration & logic