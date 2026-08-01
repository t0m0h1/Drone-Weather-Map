import os
import requests
from flask import Flask, jsonify, request

app = Flask(__name__, static_folder='static', static_url_path='')

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/api/weather', methods=['GET'])
def get_weather():
    lat = request.args.get('lat', type=float)
    lon = request.args.get('lon', type=float)

    if lat is None or lon is None:
        return jsonify({'error': 'Latitude and longitude parameters are required.'}), 400

    try:
        # 180m removed from query to prevent HTTP 400 errors from regional models
        weather_url = (
            f"https://api.open-meteo.com/v1/forecast?"
            f"latitude={lat}&longitude={lon}"
            f"&current=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,visibility,weather_code,cloud_cover"
            f"&hourly=temperature_2m,wind_speed_10m,wind_speed_80m,wind_speed_120m,"
            f"wind_direction_10m,wind_direction_80m,wind_direction_120m,"
            f"wind_gusts_10m,precipitation,visibility,weather_code"
            f"&daily=sunrise,sunset&wind_speed_unit=ms&timezone=auto&forecast_days=2"
        )
        noaa_url = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json"
        geo_url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json"

        headers = {'User-Agent': 'ProDroneWeatherDashboard/1.0'}

        weather_res = requests.get(weather_url, timeout=5)
        
        if weather_res.status_code != 200:
            return jsonify({
                'error': f"Open-Meteo API failed (HTTP {weather_res.status_code})",
                'details': weather_res.text
            }), 502

        weather_data = weather_res.json()

        noaa_res = requests.get(noaa_url, timeout=5)
        geo_res = requests.get(geo_url, headers=headers, timeout=5)

        noaa_data = noaa_res.json() if noaa_res.status_code == 200 else []
        geo_data = geo_res.json() if geo_res.status_code == 200 else {}

        if 'current' not in weather_data:
            return jsonify({
                'error': 'Open-Meteo returned successful HTTP status but invalid data structure.',
                'details': weather_data
            }), 502

        return jsonify({
            'weather': weather_data,
            'noaa': noaa_data,
            'geo': geo_data
        })

    except requests.RequestException as e:
        return jsonify({'error': 'Backend failed to reach external APIs', 'details': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)