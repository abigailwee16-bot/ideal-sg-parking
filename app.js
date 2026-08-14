/**
 * @file app.js
 * @description Singapore Nationwide Parking Discovery Application Logic.
 * 
 * Features:
 * 1. Area-First Search (e.g. Serangoon Gardens, Orchard, Katong, Tanjong Pagar).
 * 2. Real Google Maps UI Interactive Map with custom pins, lot bubbles, and route polylines.
 * 3. 30-Minute Parking.sg Expiring Sessions turnover computation.
 * 4. Origin & Geological Location drive-time calculation + Expected lots on arrival prediction.
 * 5. Deterministic recommendation scoring (Arrival Lots -> Travel Time -> Cost).
 * 6. Integrated Google Maps navigation.
 * 7. Dedicated "Lunch & Parking Deals" tab with area filtering.
 */

// ============================================================================
// 1. APPLICATION STATE
// ============================================================================

const ORIGIN_PRESETS = {
  gps: { name: 'My GPS Location', lat: 1.2839, lng: 103.8515, isGps: true },
  orchard: { name: 'Orchard / Somerset', lat: 1.3030, lng: 103.8350 },
  cbd: { name: 'Raffles Place / CBD', lat: 1.2839, lng: 103.8515 },
  bishan: { name: 'Bishan / AMK', lat: 1.3508, lng: 103.8488 },
  serangoon: { name: 'Serangoon / Kovan', lat: 1.3506, lng: 103.8727 },
  tampines: { name: 'Tampines / Bedok', lat: 1.3533, lng: 103.9402 },
  jurong: { name: 'Jurong East', lat: 1.3347, lng: 103.7431 },
  woodlands: { name: 'Woodlands', lat: 1.4361, lng: 103.7860 }
};

const AppState = {
  // Active App View: 'parking' | 'lunch'
  currentView: 'parking',

  // Current selected vehicle type: 'car' | 'motorcycle'
  vehicleType: 'car',

  // User Starting / Origin Geological Location
  origin: {
    key: 'cbd',
    name: 'Raffles Place / CBD',
    lat: 1.2839,
    lng: 103.8515
  },

  // Current Destination in Singapore (Default: Serangoon Gardens)
  destination: {
    id: 'area-serangoon-gardens',
    name: 'Serangoon Gardens (Chomp Chomp & myVillage)',
    area: 'Serangoon Gardens',
    address: '20 Kensington Park Road, Singapore 557269',
    lat: 1.3644,
    lng: 103.8665,
    description: 'Famous dining haven featuring Chomp Chomp Food Centre, myVillage Mall, and shophouse cafes.'
  },

  // User intended parking duration in minutes (Default: 120 mins = 2 hours)
  durationMinutes: 120,

  // Map layer mode: 'street' | 'satellite'
  mapLayer: 'street',

  // Filtered and scored nearby carparks relative to destination & origin
  nearbyCarparks: [],

  // Deterministic top-recommended carpark
  recommendedCarpark: null,

  // Currently highlighted / selected carpark
  selectedCarpark: null,

  // Modal active carpark
  modalCarpark: null,

  // Selected Area filter on Lunch Deals tab
  lunchSelectedArea: 'All'
};

// Leaflet Map Global Instances
let leafletMapInstance = null;
let mapMarkersGroup = null;
let mapRouteLine = null;
let streetTileLayer = null;
let satelliteTileLayer = null;

// ============================================================================
// 2. MATHEMATICAL, DRIVE TIME & ARRIVAL PREDICTION UTILITIES
// ============================================================================

/**
 * Calculates straight-line distance in meters between two coordinates.
 */
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Calculates estimated driving or riding duration from Start Location to Carpark.
 * Incorporates Singapore urban traffic speed and signals.
 */
function computeDriveTimeMinutes(originLat, originLng, destLat, destLng, vehicleType) {
  const distMeters = calculateDistanceMeters(originLat, originLng, destLat, destLng);
  const distKm = distMeters / 1000;

  // Average Singapore urban driving speed with traffic signals:
  // Car: ~36 km/h (0.6 km/min) + 3 mins parking ingress
  // Motorcycle: ~42 km/h (0.7 km/min) + 1 min ingress
  const speedKmPerMin = vehicleType === 'motorcycle' ? 0.70 : 0.60;
  const ingressBuffer = vehicleType === 'motorcycle' ? 1 : 3;

  const rawMinutes = Math.round(distKm / speedKmPerMin) + ingressBuffer;
  return Math.max(3, Math.min(rawMinutes, 90)); // minimum 3 mins
}

/**
 * Computes Expected Lot Availability upon driver's arrival based on:
 * 1. Current Live Lot Count
 * 2. Active 30-min Expiring Sessions (freeing up lots)
 * 3. Drive Time Duration (ETA)
 * 4. Natural Inflow Demand Rate
 */
function computeArrivalLotPrediction(carpark, vehicleType, driveTimeMinutes) {
  const isMoto = vehicleType === 'motorcycle';
  const currentLots = isMoto 
    ? (carpark.motorcycleLots?.available ?? 20)
    : (carpark.carLots?.available ?? 50);

  const totalLots = isMoto 
    ? (carpark.motorcycleLots?.total ?? 40)
    : (carpark.carLots?.total ?? 200);

  const expiring30m = isMoto
    ? (carpark.expiring30Min?.motorcycle ?? Math.round(currentLots * 0.25))
    : (carpark.expiring30Min?.car ?? Math.round(currentLots * 0.28));

  // Lots freeing up during drive time
  const turnoverRatio = Math.min(driveTimeMinutes / 30, 2.0);
  const lotsFreedUp = Math.round(expiring30m * turnoverRatio);

  // Inflow demand (incoming cars taking lots)
  const inflowRate = (totalLots * 0.05) / 30; // ~5% turnover demand per 30 mins
  const incomingDemand = Math.round(inflowRate * driveTimeMinutes);

  // Projected lots on arrival
  const projectedAvailable = Math.max(1, Math.min(totalLots, currentLots + lotsFreedUp - incomingDemand));

  return {
    currentLots,
    totalLots,
    expiring30m,
    projectedOnArrival: projectedAvailable,
    turnoverGain: lotsFreedUp
  };
}

/**
 * Computes estimated parking fee in SGD.
 */
function computeEstimatedCost(carpark, vehicleType, durationMinutes) {
  if (!carpark || !carpark.pricing) return 0;
  
  if (vehicleType === 'motorcycle') {
    const motoPricing = carpark.pricing.motorcycle;
    return Number((motoPricing?.sessionFee || 0.65).toFixed(2));
  }

  const carPricing = carpark.pricing.car || carpark.pricing;
  if (durationMinutes <= (carPricing.gracePeriodMinutes || 10)) {
    return 0.00;
  }
  
  const firstHourRate = typeof carPricing.weekdayFirstHour === 'number' ? carPricing.weekdayFirstHour : 1.50;
  const subsequentRate = typeof carPricing.weekdaySubsequentHour === 'number' ? carPricing.weekdaySubsequentHour : 0.80;
  
  if (durationMinutes <= 60) {
    return Number(firstHourRate.toFixed(2));
  }
  
  const remainingMinutes = durationMinutes - 60;
  const additionalHalfHours = Math.ceil(remainingMinutes / 30);
  const subsequentHalfHourRate = subsequentRate / 2;
  const total = firstHourRate + (additionalHalfHours * subsequentHalfHourRate);
  
  return Number(total.toFixed(2));
}

/**
 * Deterministic recommendation scoring:
 * Factors:
 * 1. Predicted Lot Availability upon arrival (45%)
 * 2. Total Journey Time: Drive Time from Start Location + Walk to Destination (35%)
 * 3. Parking Cost for duration (20%)
 */
function scoreCarparkForArrival(carpark, maxTravelTime, maxCost) {
  const arrivalLots = carpark.arrivalPrediction.projectedOnArrival;
  const totalTravelTime = carpark.driveTimeMinutes + carpark.walkMinutes;
  const cost = carpark.estimatedCost;

  // 1. Arrival Availability Score (0 - 45 pts)
  let arrivalScore = 0;
  if (arrivalLots >= 50) arrivalScore = 45;
  else if (arrivalLots >= 25) arrivalScore = 38;
  else if (arrivalLots >= 10) arrivalScore = 26;
  else if (arrivalLots > 0) arrivalScore = 14;
  else arrivalScore = 0;

  // 2. Journey Time Score (0 - 35 pts)
  const timeRatio = maxTravelTime > 0 ? (totalTravelTime / maxTravelTime) : 0;
  const timeScore = Math.max(0, (1 - timeRatio) * 35);

  // 3. Cost Score (0 - 20 pts)
  const costRatio = maxCost > 0 ? (cost / maxCost) : 0;
  const costScore = Math.max(0, (1 - costRatio) * 20);

  // Bonus for active Lunch Deals (5 pts)
  const dealBonus = carpark.lunchDeal?.hasDeal ? 5 : 0;

  const totalScore = Math.round(arrivalScore + timeScore + costScore + dealBonus);
  return Math.min(100, Math.max(10, totalScore));
}

// ============================================================================
// 3. DATA QUERYING & PROCESSING
// ============================================================================

/**
 * Updates nearby carparks relative to current destination and origin.
 */
function updateNearbyCarparks() {
  const destLat = AppState.destination.lat;
  const destLng = AppState.destination.lng;
  const origLat = AppState.origin.lat;
  const origLng = AppState.origin.lng;

  // Process all carparks in the database
  const processed = SINGAPORE_CARPARK_DATABASE.map(carpark => {
    const walkDistanceMeters = calculateDistanceMeters(carpark.lat, carpark.lng, destLat, destLng);
    const walkMinutes = Math.max(1, Math.ceil(walkDistanceMeters / 75)); // ~75m per min walk

    const driveDistanceMeters = calculateDistanceMeters(origLat, origLng, carpark.lat, carpark.lng);
    const driveTimeMinutes = computeDriveTimeMinutes(origLat, origLng, carpark.lat, carpark.lng, AppState.vehicleType);

    const arrivalPrediction = computeArrivalLotPrediction(carpark, AppState.vehicleType, driveTimeMinutes);
    const estimatedCost = computeEstimatedCost(carpark, AppState.vehicleType, AppState.durationMinutes);

    return {
      ...carpark,
      walkDistanceMeters,
      walkMinutes,
      driveDistanceMeters,
      driveTimeMinutes,
      arrivalPrediction,
      estimatedCost
    };
  });

  // Sort by walk distance to destination first
  processed.sort((a, b) => a.walkDistanceMeters - b.walkDistanceMeters);

  // Pick candidate nearby carparks (within 1.8km of destination, or top 6 closest)
  let candidates = processed.filter(cp => cp.walkDistanceMeters <= 1800);
  if (candidates.length < 3) {
    candidates = processed.slice(0, 5);
  }

  // Calculate maximums for scoring normalization
  const maxTravelTime = Math.max(...candidates.map(c => c.driveTimeMinutes + c.walkMinutes), 1);
  const maxCost = Math.max(...candidates.map(c => c.estimatedCost), 1);

  // Score each candidate
  candidates.forEach(cp => {
    cp.recommendationScore = scoreCarparkForArrival(cp, maxTravelTime, maxCost);
  });

  // Sort candidates by recommendation score descending
  candidates.sort((a, b) => b.recommendationScore - a.recommendationScore);

  AppState.nearbyCarparks = candidates;
  AppState.recommendedCarpark = candidates[0] || null;

  if (!AppState.selectedCarpark || !candidates.find(c => c.id === AppState.selectedCarpark.id)) {
    AppState.selectedCarpark = candidates[0] || null;
  }
}

// ============================================================================
// 4. INTERACTIVE GOOGLE MAPS UI (LEAFLET INTEGRATION)
// ============================================================================

/**
 * Initializes or re-renders the Google Maps styled interactive Leaflet map.
 */
function initOrUpdateLeafletMap() {
  const mapElement = document.getElementById('interactive-leaflet-map');
  if (!mapElement) return;

  const destLat = AppState.destination.lat;
  const destLng = AppState.destination.lng;

  // If map instance does not exist, initialize it
  if (!leafletMapInstance) {
    leafletMapInstance = L.map('interactive-leaflet-map', {
      zoomControl: false, // We use custom Google Maps styled controls
      attributionControl: false
    }).setView([destLat, destLng], 15);

    // Standard Clean Street View Tiles (Google Maps / Positron aesthetics)
    streetTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd'
    });

    // Satellite View Tiles
    satelliteTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18
    });

    streetTileLayer.addTo(leafletMapInstance);

    // Add Google Maps styled zoom control bottom-right
    L.control.zoom({
      position: 'bottomright'
    }).addTo(leafletMapInstance);

    mapMarkersGroup = L.layerGroup().addTo(leafletMapInstance);
  }

  // Update map viewport to destination
  leafletMapInstance.panTo([destLat, destLng]);

  // Clear existing markers & route
  mapMarkersGroup.clearLayers();
  if (mapRouteLine) {
    leafletMapInstance.removeLayer(mapRouteLine);
    mapRouteLine = null;
  }

  // 1. Destination Marker (Red Pin with Star)
  const destIcon = L.divIcon({
    className: 'custom-dest-pin',
    html: `
      <div class="gmaps-dest-marker" title="${AppState.destination.name}">
        <div class="dest-pin-head">🎯</div>
        <div class="dest-pin-label">${AppState.destination.area || AppState.destination.name.split(' ')[0]}</div>
      </div>
    `,
    iconSize: [40, 48],
    iconAnchor: [20, 48]
  });

  const destMarker = L.marker([destLat, destLng], { icon: destIcon, zIndexOffset: 1000 })
    .bindPopup(`
      <div class="gmaps-popup-card">
        <div class="popup-tag">Destination</div>
        <h4>${AppState.destination.name}</h4>
        <p>${AppState.destination.address}</p>
      </div>
    `);
  mapMarkersGroup.addLayer(destMarker);

  // 2. Origin / Start Location Marker (Blue Pulsing GPS Pin)
  const origIcon = L.divIcon({
    className: 'custom-origin-pin',
    html: `
      <div class="gmaps-origin-marker" title="Your Starting Location: ${AppState.origin.name}">
        <div class="origin-pulse"></div>
        <div class="origin-dot">🚘</div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });

  const origMarker = L.marker([AppState.origin.lat, AppState.origin.lng], { icon: origIcon, zIndexOffset: 900 })
    .bindPopup(`
      <div class="gmaps-popup-card">
        <div class="popup-tag">Starting Point</div>
        <h4>${AppState.origin.name}</h4>
        <p>Drive time calculated from here</p>
      </div>
    `);
  mapMarkersGroup.addLayer(origMarker);

  // 3. Carpark Availability Bubbles (Green/Amber/Red) with 30m Turnover Badges
  AppState.nearbyCarparks.forEach(carpark => {
    const isRecommended = AppState.recommendedCarpark && AppState.recommendedCarpark.id === carpark.id;
    const isSelected = AppState.selectedCarpark && AppState.selectedCarpark.id === carpark.id;
    const available = carpark.arrivalPrediction.projectedOnArrival;
    const expiring = carpark.arrivalPrediction.expiring30m;

    let statusColorClass = 'high';
    if (available <= 0) statusColorClass = 'unavail';
    else if (available < 15) statusColorClass = 'low';
    else if (available < 50) statusColorClass = 'medium';

    const carparkIcon = L.divIcon({
      className: 'custom-carpark-pin',
      html: `
        <div class="gmaps-carpark-bubble ${statusColorClass} ${isRecommended ? 'is-recommended' : ''} ${isSelected ? 'is-selected' : ''}">
          <div class="bubble-badge-icon">${AppState.vehicleType === 'motorcycle' ? '🏍️' : 'P'}</div>
          <div class="bubble-lots-count">${available}</div>
          <div class="bubble-expiry-pill" title="${expiring} active sessions expiring in 30 mins">⏱️+${expiring}</div>
          ${isRecommended ? '<span class="recommended-crown">★ BEST</span>' : ''}
        </div>
      `,
      iconSize: [64, 44],
      iconAnchor: [32, 40]
    });

    const marker = L.marker([carpark.lat, carpark.lng], { icon: carparkIcon, zIndexOffset: isRecommended ? 800 : 500 });
    
    // Popup Content with drive ETA, arrival lots, price, and Google Maps Navigation
    const gmapsNavUrl = `https://www.google.com/maps/dir/?api=1&origin=${AppState.origin.lat},${AppState.origin.lng}&destination=${encodeURIComponent(carpark.name + ' Singapore')}&travelmode=driving`;

    marker.bindPopup(`
      <div class="gmaps-popup-card">
        <div class="popup-header-row">
          <span class="popup-operator-badge">${carpark.operator || 'EPS'}</span>
          <span class="popup-code-badge">${carpark.code || 'Parking.sg'}</span>
        </div>
        <h4 class="popup-title">${carpark.name}</h4>
        <p class="popup-address">${carpark.address}</p>
        
        <div class="popup-stats-grid">
          <div class="stat-box">
            <span class="stat-label">Expected on Arrival</span>
            <strong class="stat-value text-${statusColorClass}">~${available} Lots</strong>
          </div>
          <div class="stat-box">
            <span class="stat-label">30m Turnover</span>
            <strong class="stat-value">⏱️ +${expiring} lots</strong>
          </div>
          <div class="stat-box">
            <span class="stat-label">Drive Time</span>
            <strong class="stat-value">🚘 ${carpark.driveTimeMinutes} mins</strong>
          </div>
          <div class="stat-box">
            <span class="stat-label">Est. Fee (${AppState.durationMinutes}m)</span>
            <strong class="stat-value">$${carpark.estimatedCost.toFixed(2)}</strong>
          </div>
        </div>

        ${carpark.lunchDeal?.hasDeal ? `
          <div class="popup-lunch-banner">
            <span>🍽️ <strong>Lunch Deal:</strong> ${carpark.lunchDeal.title}</span>
          </div>
        ` : ''}

        <div class="popup-actions-row">
          <a href="${gmapsNavUrl}" target="_blank" rel="noopener noreferrer" class="btn-popup-nav">
            🧭 Navigate in Google Maps
          </a>
          <button type="button" class="btn-popup-select" onclick="selectCarparkFromMap('${carpark.id}')">
            View Details
          </button>
        </div>
      </div>
    `);

    marker.on('click', () => {
      selectCarparkFromMap(carpark.id);
    });

    mapMarkersGroup.addLayer(marker);
  });

  // 4. Draw Connecting Route from Origin -> Recommended Carpark -> Destination
  if (AppState.recommendedCarpark) {
    const routeCoords = [
      [AppState.origin.lat, AppState.origin.lng],
      [AppState.recommendedCarpark.lat, AppState.recommendedCarpark.lng],
      [destLat, destLng]
    ];

    mapRouteLine = L.polyline(routeCoords, {
      color: '#0284c7',
      weight: 4,
      opacity: 0.8,
      dashArray: '8, 8'
    }).addTo(leafletMapInstance);
  }

  // Update integrated Google Maps banner text
  updateGmapsOverlayBanner();
}

/**
 * Updates the top-right / bottom-left Google Maps overlay info in the map viewport.
 */
function updateGmapsOverlayBanner() {
  const areaNameEl = document.getElementById('overlay-area-name');
  const etaTextEl = document.getElementById('overlay-eta-text');
  const gmapsLinkEl = document.getElementById('btn-gmaps-integrated-link');

  if (areaNameEl) areaNameEl.textContent = AppState.destination.name;
  
  if (etaTextEl && AppState.recommendedCarpark) {
    etaTextEl.textContent = `🚘 ~${AppState.recommendedCarpark.driveTimeMinutes} min drive from ${AppState.origin.name} · ~${AppState.recommendedCarpark.arrivalPrediction.projectedOnArrival} lots on arrival`;
  }

  if (gmapsLinkEl) {
    const encodedDest = encodeURIComponent(AppState.destination.name + ' Singapore');
    gmapsLinkEl.href = `https://www.google.com/maps/dir/?api=1&origin=${AppState.origin.lat},${AppState.origin.lng}&destination=${encodedDest}&travelmode=driving`;
  }
}

/**
 * Switches the tile layer between standard street view and satellite view.
 */
function setMapLayer(layerType) {
  AppState.mapLayer = layerType;
  
  const btnStreet = document.getElementById('btn-map-street');
  const btnSatellite = document.getElementById('btn-map-satellite');

  if (layerType === 'satellite') {
    if (leafletMapInstance.hasLayer(streetTileLayer)) leafletMapInstance.removeLayer(streetTileLayer);
    satelliteTileLayer.addTo(leafletMapInstance);
    btnStreet?.classList.remove('active');
    btnSatellite?.classList.add('active');
  } else {
    if (leafletMapInstance.hasLayer(satelliteTileLayer)) leafletMapInstance.removeLayer(satelliteTileLayer);
    streetTileLayer.addTo(leafletMapInstance);
    btnSatellite?.classList.remove('active');
    btnStreet?.classList.add('active');
  }
}

/**
 * Fits the map to show both the origin, destination, and candidate carparks.
 */
function fitMapToVisibleMarkers() {
  if (!leafletMapInstance || !AppState.nearbyCarparks.length) return;

  const points = [
    [AppState.origin.lat, AppState.origin.lng],
    [AppState.destination.lat, AppState.destination.lng],
    ...AppState.nearbyCarparks.map(c => [c.lat, c.lng])
  ];

  const bounds = L.latLngBounds(points);
  leafletMapInstance.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
}

function selectCarparkFromMap(carparkId) {
  const found = AppState.nearbyCarparks.find(c => c.id === carparkId);
  if (found) {
    AppState.selectedCarpark = found;
    renderSidebarRecommendations();
  }
}

// ============================================================================
// 5. SIDEBAR RENDERING (RECOMMENDATIONS & CANDIDATES)
// ============================================================================

/**
 * Renders the top Recommendation Master Card and the nearby Candidate list.
 */
function renderSidebarRecommendations() {
  const recContainer = document.getElementById('recommendation-card-container');
  const listContainer = document.getElementById('candidate-list-container');
  if (!recContainer || !listContainer) return;

  const rec = AppState.recommendedCarpark;
  const isMoto = AppState.vehicleType === 'motorcycle';
  const vehLabel = isMoto ? 'Motorcycle' : 'Car';

  // --- RENDER TOP RECOMMENDATION CARD ---
  if (!rec) {
    recContainer.innerHTML = `
      <div class="empty-state-card">
        <p>No carparks found in this immediate radius. Try zooming out or selecting another Singapore area.</p>
      </div>
    `;
    listContainer.innerHTML = '';
    return;
  }

  const arrivalLots = rec.arrivalPrediction.projectedOnArrival;
  const expiring30m = rec.arrivalPrediction.expiring30m;
  const currentLots = rec.arrivalPrediction.currentLots;
  const gmapsNavUrl = `https://www.google.com/maps/dir/?api=1&origin=${AppState.origin.lat},${AppState.origin.lng}&destination=${encodeURIComponent(rec.name + ' Singapore')}&travelmode=driving`;

  let availabilityStatus = 'High';
  let badgeColorClass = 'status-high';
  if (arrivalLots < 15) { availabilityStatus = 'Low'; badgeColorClass = 'status-low'; }
  else if (arrivalLots < 50) { availabilityStatus = 'Medium'; badgeColorClass = 'status-medium'; }

  recContainer.innerHTML = `
    <div class="rec-master-card" id="card-top-recommendation">
      
      <!-- Top Priority Header -->
      <div class="rec-header-row">
        <div class="rec-match-badge">
          <span>🏆 Top Recommendation on Arrival</span>
        </div>
        <div class="rec-score-pill" title="Score based on expected arrival lots, journey time, and rate">
          <span>Score: <strong>${rec.recommendationScore}/100</strong></span>
        </div>
      </div>

      <!-- Carpark Title & Operators -->
      <div class="rec-title-group">
        <h3 class="rec-carpark-title">${rec.name}</h3>
        <p class="rec-carpark-address">📍 ${rec.address}</p>
      </div>

      <!-- Key Predictive Decision Factors Grid (Requirement 3 & 4) -->
      <div class="rec-prediction-grid">
        
        <!-- Factor 1: Expected Arrival Lots & 30m Turnover -->
        <div class="pred-factor-card highlight-arrival">
          <div class="pred-factor-label">
            <span>🔮 Expected on Arrival</span>
            <span class="pred-chip ${badgeColorClass}">~${arrivalLots} Lots</span>
          </div>
          <div class="pred-factor-body">
            <div class="pred-main-stat">
              <strong>${arrivalLots} ${vehLabel} Lots</strong>
              <span class="pred-sub-stat">(Live: ${currentLots} lots)</span>
            </div>
            <div class="pred-turnover-tag" title="Parking.sg sessions expiring within 30 minutes">
              <span>⏱️ <strong>+${expiring30m} lots</strong> freeing up in 30 mins</span>
            </div>
          </div>
        </div>

        <!-- Factor 2: Journey Time Breakdown (Drive + Walk) -->
        <div class="pred-factor-card">
          <div class="pred-factor-label">
            <span>🚘 Journey & Arrival ETA</span>
            <span class="pred-chip chip-time">${rec.driveTimeMinutes + rec.walkMinutes} min total</span>
          </div>
          <div class="pred-factor-body">
            <div class="journey-breakdown">
              <div>🚗 <strong>${rec.driveTimeMinutes} min drive</strong> from ${AppState.origin.name.split('/')[0]}</div>
              <div>🚶 <strong>${rec.walkMinutes} min walk</strong> to destination (${rec.walkDistanceMeters}m)</div>
            </div>
          </div>
        </div>

        <!-- Factor 3: Estimated Cost -->
        <div class="pred-factor-card">
          <div class="pred-factor-label">
            <span>💵 Est. Parking Cost</span>
            <span class="pred-chip chip-cost">$${rec.estimatedCost.toFixed(2)}</span>
          </div>
          <div class="pred-factor-body">
            <div class="rate-summary-text">
              ${isMoto 
                ? `<strong>$${rec.estimatedCost.toFixed(2)}</strong> per session fee`
                : `<strong>$${rec.estimatedCost.toFixed(2)}</strong> for ${AppState.durationMinutes} mins`}
            </div>
            <div class="rate-sub-text">${isMoto ? (rec.pricing?.motorcycle?.rateSummary || '$0.65/session') : (rec.pricing?.car?.rateSummary || '$1.20/hr')}</div>
          </div>
        </div>

      </div>

      <!-- Lunch Deal Banner if available -->
      ${rec.lunchDeal?.hasDeal ? `
        <div class="rec-lunch-banner">
          <div class="lunch-banner-icon">🍽️</div>
          <div class="lunch-banner-content">
            <strong>${rec.lunchDeal.title}</strong>
            <p>${rec.lunchDeal.condition} · ${rec.lunchDeal.validHours}</p>
          </div>
        </div>
      ` : ''}

      <!-- Action Navigation Buttons -->
      <div class="rec-actions-row">
        <a href="${gmapsNavUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-nav-cta">
          <span>🧭 Navigate in Google Maps</span>
        </a>
        <button type="button" class="btn btn-secondary" onclick="openCarparkModal('${rec.id}')">
          <span>ℹ️ Full Rates & Details</span>
        </button>
      </div>

    </div>
  `;

  // --- RENDER CANDIDATES LIST ---
  const candidatesHtml = AppState.nearbyCarparks.slice(1).map((cp, idx) => {
    const isSelected = AppState.selectedCarpark && AppState.selectedCarpark.id === cp.id;
    const cpArrivalLots = cp.arrivalPrediction.projectedOnArrival;
    const cpExpiring = cp.arrivalPrediction.expiring30m;

    let cpColorClass = 'status-high';
    if (cpArrivalLots < 15) cpColorClass = 'status-low';
    else if (cpArrivalLots < 50) cpColorClass = 'status-medium';

    return `
      <div class="candidate-item-card ${isSelected ? 'selected' : ''}" onclick="selectCandidateCarpark('${cp.id}')">
        <div class="candidate-header">
          <div class="candidate-title-group">
            <span class="candidate-rank-num">#${idx + 2}</span>
            <h4 class="candidate-name">${cp.name}</h4>
          </div>
          <span class="candidate-lots-badge ${cpColorClass}">
            ~${cpArrivalLots} lots
          </span>
        </div>

        <div class="candidate-meta-row">
          <span>🚘 ${cp.driveTimeMinutes}m drive</span>
          <span>·</span>
          <span>🚶 ${cp.walkMinutes}m walk (${cp.walkDistanceMeters}m)</span>
          <span>·</span>
          <span>⏱️ +${cpExpiring} in 30m</span>
          <span>·</span>
          <strong>$${cp.estimatedCost.toFixed(2)}</strong>
        </div>

        ${cp.lunchDeal?.hasDeal ? `
          <div class="candidate-deal-pill">
            <span>🎁 ${cp.lunchDeal.title}</span>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  listContainer.innerHTML = `
    <div class="candidates-wrapper">
      <div class="candidates-header-title">
        <span>Other Nearby Options in ${AppState.destination.area || 'Area'}</span>
        <span class="candidates-count">${AppState.nearbyCarparks.length} available</span>
      </div>
      <div class="candidates-list-scroll">
        ${candidatesHtml || '<p class="text-subdued">No other immediate carparks within walking radius.</p>'}
      </div>
    </div>
  `;

  // Update map heading badge
  const lotBadge = document.getElementById('map-lot-count-badge');
  if (lotBadge) {
    lotBadge.textContent = isMoto ? '🏍️ Live Motorcycle Lots' : '🚗 Live Car Lots';
  }
}

function selectCandidateCarpark(carparkId) {
  const cp = AppState.nearbyCarparks.find(c => c.id === carparkId);
  if (cp) {
    AppState.selectedCarpark = cp;
    renderSidebarRecommendations();
    if (leafletMapInstance) {
      leafletMapInstance.panTo([cp.lat, cp.lng]);
    }
  }
}

// ============================================================================
// 6. LUNCH DEALS VIEW (DEDICATED SEPARATE TAB - REQUIREMENT 6)
// ============================================================================

/**
 * Initializes and renders the dedicated Lunch & Parking Deals tab.
 */
function renderLunchDealsView() {
  const filtersContainer = document.getElementById('lunch-area-filters');
  const gridContainer = document.getElementById('lunch-deals-grid-container');
  if (!filtersContainer || !gridContainer) return;

  // Extract all carparks with lunch deals
  const allDeals = SINGAPORE_CARPARK_DATABASE.filter(cp => cp.lunchDeal && cp.lunchDeal.hasDeal);

  // Distinct areas with lunch deals
  const areas = ['All', ...new Set(allDeals.map(d => d.area).filter(Boolean))];

  // Render Area Filter Pills
  filtersContainer.innerHTML = areas.map(area => `
    <button 
      type="button" 
      class="lunch-filter-chip ${AppState.lunchSelectedArea === area ? 'active' : ''}" 
      onclick="setLunchAreaFilter('${area}')"
    >
      ${area === 'All' ? '🇸🇬 All Singapore' : area}
    </button>
  `).join('');

  // Filter deals according to active area filter
  const filteredDeals = AppState.lunchSelectedArea === 'All' 
    ? allDeals 
    : allDeals.filter(d => d.area === AppState.lunchSelectedArea);

  // Render Deal Cards
  if (filteredDeals.length === 0) {
    gridContainer.innerHTML = `
      <div class="empty-state-card">
        <p>No verified lunch parking deals found for ${AppState.lunchSelectedArea}. Select "All Singapore" or another area above.</p>
      </div>
    `;
    return;
  }

  gridContainer.innerHTML = filteredDeals.map(deal => {
    const isMoto = AppState.vehicleType === 'motorcycle';
    const lots = isMoto ? (deal.motorcycleLots?.available ?? 20) : (deal.carLots?.available ?? 50);
    const gmapsNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(deal.name + ' Singapore')}&travelmode=driving`;

    return `
      <div class="lunch-deal-card">
        
        <div class="deal-card-header">
          <div class="deal-area-tag">${deal.area}</div>
          <div class="deal-valid-pill">⏱️ ${deal.lunchDeal.validHours}</div>
        </div>

        <h3 class="deal-title">${deal.lunchDeal.title}</h3>
        <div class="deal-venue-name">📍 ${deal.name}</div>
        <p class="deal-address-sub">${deal.address}</p>

        <div class="deal-condition-box">
          <div class="condition-header">📋 Conditions / Spend:</div>
          <p class="condition-body">${deal.lunchDeal.condition}</p>
        </div>

        <div class="deal-perks-row">
          <div class="perk-stat">
            <span class="perk-label">Benefit</span>
            <strong class="perk-val text-green">${deal.lunchDeal.benefit}</strong>
          </div>
          <div class="perk-stat">
            <span class="perk-label">Live Availability</span>
            <strong class="perk-val">${lots} Lots</strong>
          </div>
          <div class="perk-stat">
            <span class="perk-label">30m Turnover</span>
            <strong class="perk-val">⏱️ +${deal.expiring30Min?.car ?? 15} lots</strong>
          </div>
        </div>

        <div class="deal-card-actions">
          <button type="button" class="btn btn-secondary" onclick="jumpToCarparkFromDeal('${deal.id}', '${deal.name}')">
            🗺️ View on Map
          </button>
          <a href="${gmapsNavUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">
            🧭 Navigate
          </a>
        </div>

      </div>
    `;
  }).join('');
}

function setLunchAreaFilter(area) {
  AppState.lunchSelectedArea = area;
  renderLunchDealsView();
}

function jumpToCarparkFromDeal(carparkId, carparkName) {
  // Find destination matching this carpark's area or coordinates
  const cp = SINGAPORE_CARPARK_DATABASE.find(c => c.id === carparkId);
  if (cp) {
    AppState.destination = {
      id: cp.id,
      name: cp.name,
      area: cp.area,
      address: cp.address,
      lat: cp.lat,
      lng: cp.lng
    };
    const input = document.getElementById('destination-search-input');
    if (input) input.value = cp.name;
    
    // Switch view to parking
    switchAppView('parking');
    updateNearbyCarparks();
    initOrUpdateLeafletMap();
    renderSidebarRecommendations();
  }
}

// ============================================================================
// 7. APP VIEW SWITCHER (TABS)
// ============================================================================

function switchAppView(viewName) {
  AppState.currentView = viewName;

  const tabParking = document.getElementById('tab-btn-parking');
  const tabLunch = document.getElementById('tab-btn-lunch');
  const viewParking = document.getElementById('view-parking-discovery');
  const viewLunch = document.getElementById('view-lunch-deals');

  if (viewName === 'lunch') {
    tabParking?.classList.remove('active');
    tabLunch?.classList.add('active');
    tabParking?.setAttribute('aria-selected', 'false');
    tabLunch?.setAttribute('aria-selected', 'true');
    
    if (viewParking) viewParking.style.display = 'none';
    if (viewLunch) viewLunch.style.display = 'block';

    renderLunchDealsView();
  } else {
    tabLunch?.classList.remove('active');
    tabParking?.classList.add('active');
    tabLunch?.setAttribute('aria-selected', 'false');
    tabParking?.setAttribute('aria-selected', 'true');

    if (viewLunch) viewLunch.style.display = 'none';
    if (viewParking) viewParking.style.display = 'block';

    // Invalidate map size to ensure Leaflet renders properly after tab switch
    if (leafletMapInstance) {
      setTimeout(() => {
        leafletMapInstance.invalidateSize();
        fitMapToVisibleMarkers();
      }, 100);
    }
  }
}

// ============================================================================
// 8. AREA SEARCH, AUTOCOMPLETE & CONTROLS
// ============================================================================

/**
 * Renders Quick Popular Area chips.
 */
function renderQuickAreaChips() {
  const container = document.getElementById('quick-destinations-bar');
  if (!container) return;

  container.innerHTML = POPULAR_SEARCH_AREAS.map(areaName => {
    const isSelected = AppState.destination.area === areaName || AppState.destination.name.includes(areaName);
    return `
      <button 
        type="button" 
        class="quick-dest-chip ${isSelected ? 'active' : ''}" 
        onclick="handleQuickAreaSelect('${areaName}')"
      >
        <span>📍 ${areaName}</span>
      </button>
    `;
  }).join('');
}

function handleQuickAreaSelect(areaName) {
  // Find matching destination in destinationsData
  const match = COMMON_SINGAPORE_DESTINATIONS.find(d => 
    d.area?.toLowerCase() === areaName.toLowerCase() || 
    d.name.toLowerCase().includes(areaName.toLowerCase())
  );

  if (match) {
    selectDestination(match);
  } else {
    // Fallback: search in carpark database
    const cpMatch = SINGAPORE_CARPARK_DATABASE.find(cp => cp.area?.toLowerCase() === areaName.toLowerCase());
    if (cpMatch) {
      selectDestination({
        name: areaName + ' Area',
        area: areaName,
        address: cpMatch.address,
        lat: cpMatch.lat,
        lng: cpMatch.lng
      });
    }
  }
}

/**
 * Selects a destination object, updates inputs, map, and recommendations.
 */
function selectDestination(dest) {
  AppState.destination = dest;
  
  const searchInput = document.getElementById('destination-search-input');
  if (searchInput) searchInput.value = dest.name;

  const dropdown = document.getElementById('autocomplete-dropdown');
  if (dropdown) dropdown.classList.remove('show');

  renderQuickAreaChips();
  updateNearbyCarparks();
  initOrUpdateLeafletMap();
  renderSidebarRecommendations();
}

/**
 * Autocomplete for searching any Singapore area, town, or landmark.
 */
function initSearchAutocomplete() {
  const searchInput = document.getElementById('destination-search-input');
  const dropdown = document.getElementById('autocomplete-dropdown');
  if (!searchInput || !dropdown) return;

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    if (!query) {
      dropdown.classList.remove('show');
      return;
    }

    // Match across destinations, areas, and carpark names
    const destMatches = COMMON_SINGAPORE_DESTINATIONS.filter(d => 
      d.name.toLowerCase().includes(query) || 
      d.area?.toLowerCase().includes(query) ||
      d.address.toLowerCase().includes(query) ||
      d.postal?.includes(query)
    );

    const cpMatches = SINGAPORE_CARPARK_DATABASE.filter(cp => 
      cp.name.toLowerCase().includes(query) || 
      cp.area?.toLowerCase().includes(query) ||
      cp.address.toLowerCase().includes(query)
    ).slice(0, 4);

    if (destMatches.length === 0 && cpMatches.length === 0) {
      dropdown.innerHTML = `
        <div class="autocomplete-no-results">
          No Singapore areas found for "${query}". Try "Serangoon Gardens", "Orchard", "Bishan"...
        </div>
      `;
      dropdown.classList.add('show');
      return;
    }

    const itemsHtml = [
      ...destMatches.map(d => `
        <div class="autocomplete-item" onclick='handleSelectAutocompleteItem(${JSON.stringify(d).replace(/'/g, "&#39;")})'>
          <span class="item-icon">📍</span>
          <div class="item-details">
            <strong class="item-name">${d.name}</strong>
            <span class="item-area-tag">${d.area || 'Singapore'} · ${d.type || 'Town Area'}</span>
          </div>
        </div>
      `),
      ...cpMatches.map(cp => `
        <div class="autocomplete-item" onclick='handleSelectAutocompleteItem(${JSON.stringify({ name: cp.name, area: cp.area, address: cp.address, lat: cp.lat, lng: cp.lng }).replace(/'/g, "&#39;")})'>
          <span class="item-icon">🅿️</span>
          <div class="item-details">
            <strong class="item-name">${cp.name}</strong>
            <span class="item-area-tag">${cp.area || 'Carpark'} · ${cp.address}</span>
          </div>
        </div>
      `)
    ].join('');

    dropdown.innerHTML = itemsHtml;
    dropdown.classList.add('show');
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-input-group')) {
      dropdown.classList.remove('show');
    }
  });
}

function handleSelectAutocompleteItem(destObj) {
  selectDestination(destObj);
}

function clearSearchInput() {
  const input = document.getElementById('destination-search-input');
  if (input) {
    input.value = '';
    input.focus();
  }
  const dropdown = document.getElementById('autocomplete-dropdown');
  if (dropdown) dropdown.classList.remove('show');
}

/**
 * Handles changes to the Starting Origin Location dropdown.
 */
function handleOriginChange(originKey) {
  if (originKey === 'gps') {
    requestBrowserGeolocation();
    return;
  }

  const preset = ORIGIN_PRESETS[originKey];
  if (preset) {
    AppState.origin = {
      key: originKey,
      name: preset.name,
      lat: preset.lat,
      lng: preset.lng
    };
    updateNearbyCarparks();
    initOrUpdateLeafletMap();
    renderSidebarRecommendations();
  }
}

/**
 * Requests real HTML5 browser GPS coordinates.
 */
function requestBrowserGeolocation() {
  const btn = document.getElementById('btn-gps-trigger');
  if (btn) btn.textContent = '⏳ Locating...';

  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser.');
    if (btn) btn.textContent = '🎯 GPS';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      AppState.origin = {
        key: 'gps',
        name: 'My GPS Location',
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      if (btn) btn.textContent = '✅ GPS Active';
      const select = document.getElementById('origin-location-select');
      if (select) select.value = 'gps';

      updateNearbyCarparks();
      initOrUpdateLeafletMap();
      renderSidebarRecommendations();
    },
    (err) => {
      console.warn('Geolocation failed or permission denied:', err);
      if (btn) btn.textContent = '🎯 GPS';
      // Default to CBD
      AppState.origin = {
        key: 'cbd',
        name: 'Raffles Place / CBD (Default)',
        lat: 1.2839,
        lng: 103.8515
      };
      updateNearbyCarparks();
      initOrUpdateLeafletMap();
      renderSidebarRecommendations();
    },
    { enableHighAccuracy: true, timeout: 5000 }
  );
}

/**
 * Vehicle Type Toggle (Car vs Motorcycle).
 */
function setVehicleType(type) {
  AppState.vehicleType = type;

  const btnCar = document.getElementById('veh-pill-car');
  const btnMoto = document.getElementById('veh-pill-motorcycle');

  if (type === 'motorcycle') {
    btnCar?.classList.remove('active');
    btnCar?.setAttribute('aria-checked', 'false');
    btnMoto?.classList.add('active');
    btnMoto?.setAttribute('aria-checked', 'true');
  } else {
    btnMoto?.classList.remove('active');
    btnMoto?.setAttribute('aria-checked', 'false');
    btnCar?.classList.add('active');
    btnCar?.setAttribute('aria-checked', 'true');
  }

  updateNearbyCarparks();
  initOrUpdateLeafletMap();
  renderSidebarRecommendations();
  if (AppState.currentView === 'lunch') {
    renderLunchDealsView();
  }
}

/**
 * Parking Duration Filter.
 */
function setParkingDuration(mins) {
  AppState.durationMinutes = mins;

  document.querySelectorAll('.duration-chip').forEach(chip => {
    const chipMins = Number(chip.getAttribute('data-mins'));
    if (chipMins === mins) {
      chip.classList.add('active');
      chip.setAttribute('aria-checked', 'true');
    } else {
      chip.classList.remove('active');
      chip.setAttribute('aria-checked', 'false');
    }
  });

  updateNearbyCarparks();
  initOrUpdateLeafletMap();
  renderSidebarRecommendations();
}

/**
 * Refreshes availability and turnover data.
 */
function refreshCarparkAvailability() {
  updateNearbyCarparks();
  initOrUpdateLeafletMap();
  renderSidebarRecommendations();
}

// ============================================================================
// 9. MODAL DETAILS DIALOG
// ============================================================================

function openCarparkModal(carparkId) {
  const cp = SINGAPORE_CARPARK_DATABASE.find(c => c.id === carparkId) || AppState.nearbyCarparks.find(c => c.id === carparkId);
  if (!cp) return;

  AppState.modalCarpark = cp;

  const modalTitle = document.getElementById('modal-carpark-title');
  const modalSubtitle = document.getElementById('modal-carpark-subtitle');
  const modalBody = document.getElementById('modal-body-content');
  const modalElem = document.getElementById('carpark-detail-modal');

  if (modalTitle) modalTitle.textContent = cp.name;
  if (modalSubtitle) modalSubtitle.textContent = `${cp.operator || 'EPS'} · ${cp.address}`;

  const isMoto = AppState.vehicleType === 'motorcycle';
  const lots = isMoto ? (cp.motorcycleLots?.available ?? 20) : (cp.carLots?.available ?? 50);
  const total = isMoto ? (cp.motorcycleLots?.total ?? 40) : (cp.carLots?.total ?? 200);
  const expiring = isMoto ? (cp.expiring30Min?.motorcycle ?? 8) : (cp.expiring30Min?.car ?? 14);

  if (modalBody) {
    modalBody.innerHTML = `
      <div class="modal-info-grid">
        <div class="modal-stat-box">
          <span class="m-label">Live Availability</span>
          <strong class="m-val text-green">${lots} / ${total} lots</strong>
        </div>
        <div class="modal-stat-box">
          <span class="m-label">30-Min Expiry Turnover</span>
          <strong class="m-val">⏱️ +${expiring} lots</strong>
        </div>
        <div class="modal-stat-box">
          <span class="m-label">System</span>
          <strong class="m-val">${cp.system || 'EPS'}</strong>
        </div>
        <div class="modal-stat-box">
          <span class="m-label">Parking.sg Code</span>
          <strong class="m-val">${cp.code || 'N/A'}</strong>
        </div>
      </div>

      <div class="modal-rates-section">
        <h4>Official Rate Structure (${isMoto ? 'Motorcycle' : 'Car'})</h4>
        <p class="rate-p">${isMoto ? (cp.pricing?.motorcycle?.rateSummary || '$0.65/session') : (cp.pricing?.car?.rateSummary || '$1.20/hr')}</p>
        <p class="rate-night"><strong>Night Scheme:</strong> ${isMoto ? (cp.pricing?.motorcycle?.nightSession || '$0.65') : (cp.pricing?.car?.nightScheme || 'Standard night cap')}</p>
      </div>

      ${cp.lunchDeal?.hasDeal ? `
        <div class="modal-deal-card">
          <div class="deal-badge">🍽️ LUNCH DEAL</div>
          <h4>${cp.lunchDeal.title}</h4>
          <p>${cp.lunchDeal.condition}</p>
          <p class="deal-hours">Valid: ${cp.lunchDeal.validHours}</p>
        </div>
      ` : ''}

      <div class="modal-restrictions-section">
        <p><strong>Restrictions / Notes:</strong> ${cp.restrictions || 'Standard Singapore parking guidelines apply.'}</p>
      </div>
    `;
  }

  if (modalElem) {
    modalElem.classList.add('show');
    modalElem.setAttribute('aria-hidden', 'false');
  }
}

function closeCarparkModal() {
  const modalElem = document.getElementById('carpark-detail-modal');
  if (modalElem) {
    modalElem.classList.remove('show');
    modalElem.setAttribute('aria-hidden', 'true');
  }
}

function handleGetDirections(carparkId) {
  const cp = SINGAPORE_CARPARK_DATABASE.find(c => c.id === carparkId) || AppState.modalCarpark;
  if (!cp) return;

  const url = `https://www.google.com/maps/dir/?api=1&origin=${AppState.origin.lat},${AppState.origin.lng}&destination=${encodeURIComponent(cp.name + ' Singapore')}&travelmode=driving`;
  window.open(url, '_blank');
}

// ============================================================================
// 10. BOOTSTRAP APPLICATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  renderQuickAreaChips();
  initSearchAutocomplete();
  updateNearbyCarparks();
  initOrUpdateLeafletMap();
  renderSidebarRecommendations();
});
