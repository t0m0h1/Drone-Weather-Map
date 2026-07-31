import os
import requests
from flask import Flask, jsonify, request, send_from_directory

# Setting static_url_path='' lets Flask automatically serve files from static/
app = Flask(__name__, static_folder='static', static_url_path='')

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/api/flight-conditions', methods=['GET'])
def flight_conditions():
    """Fetches weather data and calculates a Drone Flyability Status."""
    lat = request.args.get('lat', type=float)
    lon = request.args.get('lon', type=float)

    if lat is None or lon is None:
        return jsonify({'error': 'Latitude (lat) and Longitude (lon) parameters are required.'}), 400

    # Querying Open-Meteo (Free API, no key required, supports wind speeds at 10m & 80m)
    api_url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={lat}&longitude={lon}"
        f"&current=temperature_2m,wind_speed_10m,wind_speed_80m,wind_gusts_10m,visibility,cloud_cover,precipitation"
    )

    try:
        response = requests.get(api_url, timeout=5)
        response.raise_for_status()
        weather = response.json().get('current', {})

        # Example Go/No-Go Logic for standard consumer drones (e.g., DJI Mini/Air)
        wind_10m = weather.get('wind_speed_10m', 0)
        gusts = weather.get('wind_gusts_10m', 0)
        precip = weather.get('precipitation', 0)

        # Basic thresholds (e.g., wind < 30 km/h, gusts < 40 km/h, no rain)
        is_safe = (wind_10m < 30.0) and (gusts < 40.0) and (precip == 0)

        return jsonify({
            'status': 'GO' if is_safe else 'NO-GO',
            'metrics': {
                'temp_c': weather.get('temperature_2m'),
                'wind_surface_kmh': wind_10m,
                'wind_80m_altitude_kmh': weather.get('wind_speed_80m'),
                'wind_gusts_kmh': gusts,
                'visibility_meters': weather.get('visibility'),
                'precipitation_mm': precip
            }
        })

    except requests.RequestException as e:
        return jsonify({'error': 'Failed to fetch weather data', 'details': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)
