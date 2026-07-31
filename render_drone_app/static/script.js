// Initialize Map
const map = L.map('map').setView([54.5, -3.2], 5);

const baseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
}).addTo(map);

let currentMarker = null;
let radarLayer = null;

let currentWeatherData = null;
let currentWindUnit = 'ms'; 

const WIND_UNITS = {
    'ms': { multiplier: 1, label: 'm/s' },
    'mph': { multiplier: 2.23694, label: 'mph' },
    'knots': { multiplier: 1.94384, label: 'kt' }
};

const LIMITS = { 
    warnWindMs: 6, maxWindMs: 8,      
    warnWind120mMs: 8, maxWind120mMs: 10, 
    warnGustMs: 8, maxGustMs: 10,     
    warnVisKm: 8, minVisKm: 5,       
    maxPrecipMm: 0,
    warnKpIndex: 4, maxKpIndex: 5      
};

async function loadWeatherRadar() {
    try {
        const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
        const data = await response.json();
        const latestPastPath = data.radar.past[data.radar.past.length - 1].path;
        
        radarLayer = L.tileLayer(`https://tilecache.rainviewer.com${latestPastPath}/256/{z}/{x}/{y}/2/1_1.png`, {
            opacity: 0.6,
            attribution: '&copy; RainViewer',
            maxZoom: 19,
            maxNativeZoom: 7
        });

        radarLayer.addTo(map);
        
        const overlayMaps = { "Live Rain Radar": radarLayer };
        L.control.layers(null, overlayMaps, { position: 'topright' }).addTo(map);
    } catch (error) {
        console.error("Failed to load weather radar:", error);
    }
}
loadWeatherRadar();

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

function analyzeTerrain(geoData) {
    if (!geoData || !geoData.class) return { desc: "Open Terrain", hazard: "Maintain visual line of sight and check land access." };
    const c = geoData.class;
    const t = geoData.type;

    if (c === 'aeroway') return { desc: "Aerodrome / Airfield", hazard: "Check for local airspace restrictions or active ATZ." };
    if (c === 'military') return { desc: "Military Zone", hazard: "Restricted airspace - check active NOTAMs." };
    
    if (c === 'building' || (c === 'landuse' && (t === 'residential' || t === 'commercial'))) return { desc: "Built-up Area", hazard: "Populated area - maintain safe distance and respect privacy." };
    if (c === 'landuse' && t === 'industrial') return { desc: "Industrial Area", hazard: "Watch for structures and potential signal interference." };
    if (c === 'leisure' && (t === 'park' || t === 'pitch' || t === 'recreation_ground')) return { desc: "Public / Recreational Area", hazard: "Check local bylaws and landowner permission." };
    
    if (c === 'highway') return { desc: "Road / Traffic", hazard: "Keep clear of moving vehicles and roads." };
    if ((c === 'natural' && t === 'wood') || (c === 'landuse' && t === 'forest')) return { desc: "Forest / Woodland", hazard: "Watch for canopy obstacles and trees." };
    if ((c === 'natural' && t === 'water') || c === 'waterway' || c === 'ocean') return { desc: "Body of Water", hazard: "Caution: Downward vision sensors may fail over water." };
    
    return { desc: "Open Terrain", hazard: "Verify land access permissions and maintain line of sight." };
}

// ---------------------------------------------
// EVENT LISTENERS
// ---------------------------------------------

document.getElementById('wind-unit-select').addEventListener('change', (e) => {
    currentWindUnit = e.target.value;
    if (currentWeatherData) renderDashboard(currentWeatherData);
});

// Copy Coordinates Button Handler
document.getElementById('copy-coords-btn').addEventListener('click', () => {
    const coordText = document.getElementById('coord-display').innerText;
    if (coordText && coordText !== "No location selected") {
        navigator.clipboard.writeText(coordText).then(() => {
            const btn = document.getElementById('copy-coords-btn');
            const originalText = btn.innerText;
            btn.innerText = "Copied!";
            btn.classList.replace('bg-slate-800', 'bg-emerald-600');
            setTimeout(() => {
                btn.innerText = originalText;
                btn.classList.replace('bg-emerald-600', 'bg-slate-800');
            }, 2000);
        });
    }
});

map.on('click', function(e) {
    initiateWeatherFetch(e.latlng.lat, e.latlng.lng);
});

document.getElementById('locate-btn').addEventListener('click', () => {
    if ("geolocation" in navigator) {
        document.getElementById('loading-text').innerText = "Acquiring GPS Signal...";
        showLoadingUI();
        
        navigator.geolocation.getCurrentPosition(
            (position) => initiateWeatherFetch(position.coords.latitude, position.coords.longitude),
            (error) => {
                alert("GPS Error: Could not retrieve location. Please check browser permissions.");
                hideLoadingUI();
            }
        );
    } else {
        alert("Geolocation is not supported by your browser.");
    }
});

document.getElementById('search-btn').addEventListener('click', async () => {
    const query = document.getElementById('search-input').value;
    if (!query) return;

    document.getElementById('loading-text').innerText = "Locating...";
    showLoadingUI();

    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
        const data = await res.json();
        
        if (data.length > 0) {
            initiateWeatherFetch(parseFloat(data[0].lat), parseFloat(data[0].lon));
        } else {
            alert("Location not found. Please try another search term.");
            hideLoadingUI();
        }
    } catch (err) {
        console.error(err);
        alert("Search failed. Please try again.");
        hideLoadingUI();
    }
});

document.getElementById('search-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') document.getElementById('search-btn').click();
});

// ---------------------------------------------
// DATA FETCHING & HELPERS
// ---------------------------------------------

function showLoadingUI() {
    document.getElementById('instruction').classList.add('hidden');
    document.getElementById('results').classList.add('hidden');
    document.getElementById('loading').classList.remove('hidden');
}

function hideLoadingUI() {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('instruction').classList.remove('hidden');
}

function initiateWeatherFetch(lat, lon) {
    if (currentMarker) map.removeLayer(currentMarker);
    currentMarker = L.marker([lat, lon]).addTo(map);
    map.setView([lat, lon], 12);
    
    // Update Coordinates Widget Display immediately
    const formattedCoords = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    document.getElementById('coord-display').innerText = formattedCoords;
    const copyBtn = document.getElementById('copy-coords-btn');
    copyBtn.removeAttribute('disabled');

    setTimeout(() => map.invalidateSize(), 100);

    document.getElementById('loading-text').innerText = "Analyzing telemetry data...";
    showLoadingUI();
    fetchWeather(lat, lon);
}

async function fetchWeather(lat, lon) {
    try {
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&elevation=nan&current=temperature_2m,wind_speed_10m,wind_speed_120m,wind_gusts_10m,precipitation,visibility,weather_code,cloud_cover&hourly=temperature_2m,wind_speed_10m,wind_speed_120m,wind_gusts_10m,precipitation,visibility,weather_code&daily=sunrise,sunset&wind_speed_unit=ms&timezone=auto&forecast_days=2`;
        const noaaUrl = `https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json`;
        const geoUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;

        const [weatherRes, noaaRes, geoRes] = await Promise.all([
            fetch(weatherUrl),
            fetch(noaaUrl),
            fetch(geoUrl)
        ]);

        const weatherData = await weatherRes.json();
        const noaaData = await noaaRes.json();
        const geoData = await geoRes.json(); 

        const current = weatherData.current;
        
        let visKm = "N/A";
        if (current.visibility !== null && current.visibility !== undefined) {
            visKm = (current.visibility / 1000).toFixed(1);
        }

        let kpIndex = 0;
        if (noaaData && noaaData.length > 1) {
            const latestKp = noaaData[noaaData.length - 1];
            kpIndex = parseFloat(latestKp[1]);
        }

        const sunsetStr = weatherData.daily.sunset[0];
        const sunsetTime = new Date(sunsetStr).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

        let locationName = geoData.display_name ? geoData.display_name.split(',').slice(0, 3).join(',') : "Unknown Coordinate";
        const terrainInfo = analyzeTerrain(geoData);

        currentWeatherData = {
            windMs: current.wind_speed_10m,
            wind120mMs: current.wind_speed_120m || current.wind_speed_10m,
            gustMs: current.wind_gusts_10m || 0,
            precipMm: current.precipitation,
            tempC: current.temperature_2m,
            clouds: current.cloud_cover,
            code: current.weather_code,
            visKm: visKm,
            kpIndex: kpIndex,
            sunsetTime: sunsetTime,
            hourly: weatherData.hourly,
            elevation: weatherData.elevation,
            locationName: locationName,
            terrainDesc: terrainInfo.desc,
            terrainHazard: terrainInfo.hazard
        };

        renderDashboard(currentWeatherData);

    } catch (error) {
        console.error("Error:", error);
        document.getElementById('loading').innerHTML = `<p class="text-red-500 font-bold mb-4">Failed to load telemetry.</p><button onclick="hideLoadingUI()" class="px-4 py-2 bg-slate-200 rounded text-slate-800 text-sm font-bold">Back to Map</button>`;
    }
}

// ---------------------------------------------
// UI RENDERING
// ---------------------------------------------

function setIndicator(id, status) {
    const el = document.getElementById(id);
    let color = 'bg-slate-300';
    if (status === 'good') color = 'bg-emerald-500';
    if (status === 'warning') color = 'bg-amber-400';
    if (status === 'danger') color = 'bg-red-500';
    el.className = `absolute top-0 left-0 w-1 h-full ${color}`;
}

function renderDashboard(data) {
    const unit = WIND_UNITS[currentWindUnit];

    const dispWind = (data.windMs * unit.multiplier).toFixed(1);
    const dispWind120m = (data.wind120mMs * unit.multiplier).toFixed(1);
    const dispGusts = (data.gustMs * unit.multiplier).toFixed(1);

    document.querySelectorAll('.wind-unit-label').forEach(el => { el.innerText = unit.label; });

    document.getElementById('wind').innerText = dispWind;
    document.getElementById('wind-120m').innerText = dispWind120m;
    document.getElementById('gusts').innerText = dispGusts;
    document.getElementById('precip').innerText = data.precipMm.toFixed(1);
    document.getElementById('visibility').innerText = data.visKm;
    document.getElementById('temp').innerText = Math.round(data.tempC);
    document.getElementById('clouds').innerText = data.clouds;
    document.getElementById('condition-desc').innerText = getWeatherDescription(data.code);
    document.getElementById('kp-index').innerText = data.kpIndex;
    document.getElementById('sunset-time').innerText = data.sunsetTime;
    
    document.getElementById('location-name').innerText = data.locationName;
    document.getElementById('elevation').innerText = Math.round(data.elevation);
    document.getElementById('terrain-desc').innerText = data.terrainDesc;
    
    const terrainHazardEl = document.getElementById('terrain-hazard');
    terrainHazardEl.innerText = data.terrainHazard;
    if(data.terrainHazard.includes("CRITICAL")) {
        terrainHazardEl.className = "text-red-500 font-black text-sm mt-1";
    } else {
        terrainHazardEl.className = "text-amber-400 font-bold text-sm mt-1";
    }

    let hazards = [];
    let isGo = true;

    if (data.windMs >= LIMITS.maxWindMs) {
        const limitVal = (LIMITS.maxWindMs * unit.multiplier).toFixed(1);
        hazards.push(`Surface wind (${dispWind} ${unit.label}) exceeds maximum of ${limitVal} ${unit.label}.`);
        isGo = false; setIndicator('wind-indicator', 'danger');
    } else if (data.windMs >= LIMITS.warnWindMs) { setIndicator('wind-indicator', 'warning'); } else { setIndicator('wind-indicator', 'good'); }

    if (data.wind120mMs >= LIMITS.maxWind120mMs) {
        hazards.push(`Altitude wind at 120m (${dispWind120m} ${unit.label}) is dangerous.`);
        isGo = false; setIndicator('wind-120m-indicator', 'danger');
    } else if (data.wind120mMs >= LIMITS.warnWind120mMs) { setIndicator('wind-120m-indicator', 'warning'); } else { setIndicator('wind-120m-indicator', 'good'); }

    if (data.gustMs >= LIMITS.maxGustMs) {
        const limitVal = (LIMITS.maxGustMs * unit.multiplier).toFixed(1);
        hazards.push(`Wind gusts (${dispGusts} ${unit.label}) exceed limit of ${limitVal} ${unit.label}.`);
        isGo = false; setIndicator('gust-indicator', 'danger');
    } else if (data.gustMs >= LIMITS.warnGustMs) { setIndicator('gust-indicator', 'warning'); } else { setIndicator('gust-indicator', 'good'); }

    if (data.visKm !== "N/A" && data.visKm <= LIMITS.minVisKm) {
        hazards.push(`Visibility (${data.visKm} km) is below the minimum of ${LIMITS.minVisKm} km.`);
        isGo = false; setIndicator('vis-indicator', 'danger');
    } else if (data.visKm !== "N/A" && data.visKm <= LIMITS.warnVisKm) { setIndicator('vis-indicator', 'warning'); } else { setIndicator('vis-indicator', 'good'); }

    if (data.precipMm > LIMITS.maxPrecipMm) {
        hazards.push(`Active precipitation detected (${data.precipMm} mm/h). Risk of electrical shorting.`);
        isGo = false; setIndicator('precip-indicator', 'danger');
    } else setIndicator('precip-indicator', 'good');
    
    if (data.code >= 71) { hazards.push(`Dangerous meteorological conditions detected (WMO Code: ${data.code}).`); isGo = false; }

    if (data.kpIndex >= LIMITS.maxKpIndex) {
        hazards.push(`Geomagnetic storm active (Kp: ${data.kpIndex}). High risk of GPS loss.`);
        isGo = false; setIndicator('kp-indicator', 'danger');
    } else if (data.kpIndex >= LIMITS.warnKpIndex) { setIndicator('kp-indicator', 'warning'); } else { setIndicator('kp-indicator', 'good'); }

    const batEl = document.getElementById('battery-status');
    if (data.tempC <= 0) {
        hazards.push(`Extreme cold (${data.tempC}°C) causes severe LiPo voltage drop.`); isGo = false;
        batEl.innerText = "CRITICAL COLD"; batEl.className = "text-lg font-black mt-2 text-red-600 pl-2 leading-tight"; setIndicator('battery-indicator', 'danger');
    } else if (data.tempC < 10) {
        batEl.innerText = "WARM UP REQ."; batEl.className = "text-lg font-black mt-2 text-amber-500 pl-2 leading-tight"; setIndicator('battery-indicator', 'warning');
    } else if (data.tempC > 35) {
        hazards.push(`Extreme heat (${data.tempC}°C). Risk of battery swelling.`); isGo = false;
        batEl.innerText = "OVERHEATING"; batEl.className = "text-lg font-black mt-2 text-red-600 pl-2 leading-tight"; setIndicator('battery-indicator', 'danger');
    } else {
        batEl.innerText = "OPTIMAL"; batEl.className = "text-lg font-black mt-2 text-emerald-600 pl-2 leading-tight"; setIndicator('battery-indicator', 'good');
    }

    const banner = document.getElementById('status-banner');
    const hazardContainer = document.getElementById('hazards-container');
    const hazardList = document.getElementById('hazards-list');
    
    if (isGo) {
        banner.innerHTML = `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> CONDITIONS CLEAR: GOOD TO FLY`;
        banner.className = "p-5 rounded-xl mb-4 text-center text-2xl font-black text-white shadow-md flex items-center justify-center gap-3 bg-emerald-500";
        hazardContainer.classList.add('hidden');
    } else {
        banner.innerHTML = `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> NO-GO: UNSAFE CONDITIONS`;
        banner.className = "p-5 rounded-xl mb-4 text-center text-2xl font-black text-white shadow-md flex items-center justify-center gap-3 bg-red-600";
        hazardList.innerHTML = hazards.map(h => `<li>${h}</li>`).join('');
        hazardContainer.classList.remove('hidden');
    }

    // Timeline Rendering
    const timelineContainer = document.getElementById('hourly-timeline');
    timelineContainer.innerHTML = ''; 
    const nowTimestamp = new Date().getTime();
    let startIndex = 0;
    
    for (let i = 0; i < data.hourly.time.length; i++) {
        if (new Date(data.hourly.time[i]).getTime() >= nowTimestamp - 3600000) { startIndex = i; break; }
    }

    for (let i = startIndex; i < Math.min(startIndex + 24, data.hourly.time.length); i++) {
        const timeStr = new Date(data.hourly.time[i]).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const hWind = data.hourly.wind_speed_10m[i];
        const hWind120m = data.hourly.wind_speed_120m[i] || hWind;
        const hGust = data.hourly.wind_gusts_10m[i];
        const hPrecip = data.hourly.precipitation[i];
        const hVis = data.hourly.visibility[i] / 1000;
        const hTemp = data.hourly.temperature_2m[i];
        const hCode = data.hourly.weather_code[i];

        let isHourSafe = true;
        if (hWind >= LIMITS.maxWindMs || hWind120m >= LIMITS.maxWind120mMs || hGust >= LIMITS.maxGustMs || hVis <= LIMITS.minVisKm || hPrecip > LIMITS.maxPrecipMm || hCode >= 71 || hTemp <= 0 || hTemp > 35) isHourSafe = false;

        const displayHWind = (hWind * unit.multiplier).toFixed(1);
        const blockClass = isHourSafe ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800';
        const iconSVG = isHourSafe ? `<svg class="w-5 h-5 text-emerald-600 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>` : `<svg class="w-5 h-5 text-red-600 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"></path></svg>`;

        timelineContainer.innerHTML += `
            <div class="flex-none w-24 p-3 rounded-xl border-2 ${blockClass} flex flex-col items-center justify-center snap-start shadow-sm transition-transform hover:scale-105">
                <span class="text-xs font-bold mb-1 opacity-70">${timeStr}</span>
                ${iconSVG}
                <span class="text-lg font-black">${displayHWind}</span>
                <span class="text-[9px] uppercase font-bold tracking-wider">${unit.label}</span>
            </div>
        `;
    }

    document.getElementById('loading').classList.add('hidden');
    document.getElementById('results').classList.remove('hidden');
    
    setTimeout(() => map.invalidateSize(), 150);
}

window.addEventListener('resize', () => {
    map.invalidateSize();
});