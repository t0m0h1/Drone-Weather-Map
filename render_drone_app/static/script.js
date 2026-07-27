const map = L.map('map').setView([54.5, -3.2], 5);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
}).addTo(map);

let currentMarker = null;

const LIMITS = { 
    maxWindMs: 10, 
    maxGustMs: 15,
    minVisKm: 5, 
    maxPrecipMm: 0 
};

function getWeatherDescription(code) {
    if (code === 0) return "Clear sky ☀️";
    if (code === 1 || code === 2 || code === 3) return "Partly Cloudy ⛅";
    if (code === 45 || code === 48) return "Foggy 🌫️";
    if (code >= 51 && code <= 55) return "Drizzle 🌧️";
    if (code >= 61 && code <= 65) return "Rain 🌧️";
    if (code >= 71 && code <= 75) return "Snow ❄️";
    if (code >= 80 && code <= 82) return "Rain Showers 🌧️";
    if (code >= 95) return "Thunderstorm ⛈️";
    return "Unknown";
}

map.on('click', function(e) {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;

    if (currentMarker) map.removeLayer(currentMarker);
    currentMarker = L.marker([lat, lon]).addTo(map);

    document.getElementById('instruction').classList.add('hidden');
    document.getElementById('results').classList.add('hidden');
    document.getElementById('loading').classList.remove('hidden');

    fetchWeather(lat, lon);
});

async function fetchWeather(lat, lon) {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation,visibility,weather_code,cloud_cover&wind_speed_unit=ms&timezone=Europe%2FLondon`;
        const response = await fetch(url);
        const data = await response.json();
        const current = data.current;
        
        const windMs = current.wind_speed_10m;
        const gustMs = current.wind_gusts_10m || 0; 
        const precipMm = current.precipitation;
        const tempC = current.temperature_2m;
        const clouds = current.cloud_cover;
        const code = current.weather_code;
        
        let visKm = "N/A";
        if (current.visibility !== null && current.visibility !== undefined) {
            visKm = (current.visibility / 1000).toFixed(1);
        }

        document.getElementById('wind').innerText = windMs.toFixed(1);
        document.getElementById('gusts').innerText = gustMs.toFixed(1);
        document.getElementById('precip').innerText = precipMm.toFixed(1);
        document.getElementById('visibility').innerText = visKm;
        document.getElementById('temp').innerText = Math.round(tempC);
        document.getElementById('clouds').innerText = clouds;
        document.getElementById('weather-code').innerText = code;
        document.getElementById('condition-desc').innerText = getWeatherDescription(code);

        let hazards = [];
        let isGo = true;

        function setIndicator(id, isSafe) {
            const el = document.getElementById(id);
            el.className = `absolute top-0 left-0 w-1 h-full ${isSafe ? 'bg-emerald-500' : 'bg-red-500'}`;
        }

        if (windMs >= LIMITS.maxWindMs) {
            hazards.push(`Continuous wind speed (${windMs.toFixed(1)} m/s) exceeds maximum of ${LIMITS.maxWindMs} m/s.`);
            isGo = false;
            setIndicator('wind-indicator', false);
        } else setIndicator('wind-indicator', true);

        if (gustMs >= LIMITS.maxGustMs) {
            hazards.push(`Wind gusts (${gustMs.toFixed(1)} m/s) exceed maximum of ${LIMITS.maxGustMs} m/s.`);
            isGo = false;
            setIndicator('gust-indicator', false);
        } else setIndicator('gust-indicator', true);

        if (visKm !== "N/A" && visKm <= LIMITS.minVisKm) {
            hazards.push(`Visibility (${visKm} km) is below the minimum of ${LIMITS.minVisKm} km.`);
            isGo = false;
            setIndicator('vis-indicator', false);
        } else setIndicator('vis-indicator', true);

        if (precipMm > LIMITS.maxPrecipMm) {
            hazards.push(`Active precipitation detected (${precipMm} mm/h). Risk of electrical shorting.`);
            isGo = false;
            setIndicator('precip-indicator', false);
        } else setIndicator('precip-indicator', true);
        
        if (code >= 71) {
             hazards.push(`Dangerous meteorological conditions detected (WMO Code: ${code}).`);
             isGo = false;
        }

        const banner = document.getElementById('status-banner');
        const hazardContainer = document.getElementById('hazards-container');
        const hazardList = document.getElementById('hazards-list');
        
        if (isGo) {
            banner.innerHTML = `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> CONDITIONS CLEAR: GOOD TO FLY`;
            banner.className = "p-5 rounded-xl mb-6 text-center text-2xl font-black text-white shadow-md flex items-center justify-center gap-3 bg-emerald-500";
            hazardContainer.classList.add('hidden');
        } else {
            banner.innerHTML = `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> NO-GO: UNSAFE CONDITIONS`;
            banner.className = "p-5 rounded-xl mb-6 text-center text-2xl font-black text-white shadow-md flex items-center justify-center gap-3 bg-red-600";
            hazardList.innerHTML = hazards.map(h => `<li>${h}</li>`).join('');
            hazardContainer.classList.remove('hidden');
        }

        document.getElementById('loading').classList.add('hidden');
        document.getElementById('results').classList.remove('hidden');
    } catch (error) {
        console.error("Error:", error);
        document.getElementById('loading').innerHTML = `<p class="text-red-500 font-bold">Failed to load telemetry data. Please try again.</p>`;
    }
}
