(function() {
  'use strict';

  // ==================== CONFIG ====================
  var CONFIG = {
    appName: 'MBTA Nearby',
    storageKey: 'mdg_mbta_nearby',
    api: {
      baseUrl: 'https://api-v3.mbta.com',
      cacheDuration: 25 * 1000,
    },
    mock: {
      lat: 42.3936414,
      lon: -71.1223896,
    },
    numStations: 3,
    refreshInterval: 30000,
    moveThresholdMi: 0.03,
  };

  var ROUTE_COLORS = {
    'Red': '#DA291C', 'Mattapan': '#DA291C',
    'Orange': '#ED8B00',
    'Blue': '#003DA5',
    'Green-B': '#00843D', 'Green-C': '#00843D',
    'Green-D': '#00843D', 'Green-E': '#00843D',
  };
  var TYPE_COLORS = { 0: '#00843D', 1: '#DA291C', 2: '#80276C', 3: '#FFC72C', 4: '#008EAA' };

  // WCAG relative luminance → pick the higher-contrast text color for a given
  // badge background. Yellow buses with white text would be 1.55:1 (illegible).
  function badgeTextColor(hex) {
    if (!hex || hex.charAt(0) !== '#' || hex.length < 7) return '#ffffff';
    function lin(c) {
      c = parseInt(c, 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    var L = 0.2126 * lin(hex.slice(1, 3)) +
            0.7152 * lin(hex.slice(3, 5)) +
            0.0722 * lin(hex.slice(5, 7));
    var contrastBlack = (L + 0.05) / 0.05;
    var contrastWhite = 1.05 / (L + 0.05);
    return contrastBlack > contrastWhite ? '#000000' : '#ffffff';
  }

  // ==================== STATE ====================
  var state = {
    currentScreen: 'home',
    screenHistory: [],
    isLoading: false,
    error: null,
    data: {
      lat: null,
      lon: null,
      placeName: '',
      usingMock: false,
      stations: [],
    },
    cache: {},
    refreshTimer: null,
    staleTimer: null,
    isRefreshing: false,
    paramOverride: false,
    currentHeading: null,
  };

  var STALE_AFTER_MS = 3 * 60 * 1000;

  // ==================== DOM REFS ====================
  var screens = {};

  function collectScreens() {
    document.querySelectorAll('.screen').forEach(function(s) {
      if (s.id) screens[s.id] = s;
    });
  }

  // ==================== NAVIGATION ====================
  function navigateTo(screenId) {
    Object.keys(screens).forEach(function(id) {
      screens[id].classList.add('hidden');
    });
    if (screens[screenId]) {
      screens[screenId].classList.remove('hidden');
      state.currentScreen = screenId;
    }
  }

  // ==================== FOCUS MANAGEMENT ====================
  function focusables() {
    var container = screens[state.currentScreen];
    if (!container) return [];
    var all = Array.from(container.querySelectorAll('.focusable:not([disabled])'));
    return all.filter(function(el) {
      var n = el;
      while (n && n !== container) {
        if (n.classList && n.classList.contains('hidden')) return false;
        n = n.parentElement;
      }
      return true;
    });
  }

  function focusFirst() {
    var list = focusables();
    if (list.length) list[0].focus();
  }

  function moveFocus(direction) {
    var list = focusables();
    if (list.length === 0) return;
    var current = document.activeElement;
    var idx = list.indexOf(current);
    var nextIdx;
    if (idx === -1) {
      nextIdx = 0;
    } else if (direction === 'up' || direction === 'left') {
      nextIdx = idx > 0 ? idx - 1 : list.length - 1;
    } else {
      nextIdx = idx < list.length - 1 ? idx + 1 : 0;
    }
    list[nextIdx].focus();
    list[nextIdx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // ==================== API LAYER ====================
  function apiGet(url, options) {
    options = options || {};
    var cacheKey = options.cacheKey || url;
    var cacheDuration = options.cacheDuration != null ? options.cacheDuration : CONFIG.api.cacheDuration;

    if (!options.noCache && state.cache[cacheKey]) {
      var cached = state.cache[cacheKey];
      if (Date.now() - cached.timestamp < cacheDuration) {
        return Promise.resolve(cached.data);
      }
    }

    return fetch(url)
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function(data) {
        state.cache[cacheKey] = { data: data, timestamp: Date.now() };
        return data;
      });
  }

  // ==================== UI HELPERS ====================
  function setLoading(isLoading, text, sub) {
    state.isLoading = isLoading;
    var el = document.getElementById('loading');
    if (el) el.classList.toggle('hidden', !isLoading);
    if (text) {
      var t = document.getElementById('loading-text');
      if (t) t.textContent = text;
    }
    if (sub !== undefined) {
      var s = document.getElementById('loading-sub');
      if (s) s.textContent = sub;
    }
  }

  function setError(message) {
    state.error = message;
    setLoading(false);
    document.getElementById('station-list').classList.add('hidden');
    var errorEl = document.getElementById('error');
    errorEl.classList.remove('hidden');
    var msg = document.getElementById('error-message');
    if (msg) msg.textContent = message;
    var retry = errorEl.querySelector('.focusable');
    if (retry) retry.focus();
  }

  function clearError() {
    state.error = null;
    document.getElementById('error').classList.add('hidden');
  }

  function setStatus(mode) {
    var btn = document.getElementById('refresh-btn');
    if (btn) btn.classList.toggle('refreshing', mode === 'refreshing');
  }

  // Show the "LIVE" indicator on a successful refresh; auto-hide it after
  // STALE_AFTER_MS so it disappears when refreshes have been failing.
  function markFresh() {
    var el = document.getElementById('status-indicator');
    if (el) el.classList.remove('hidden');
    if (state.staleTimer) clearTimeout(state.staleTimer);
    state.staleTimer = setTimeout(function() {
      if (el) el.classList.add('hidden');
    }, STALE_AFTER_MS);
  }

  function updateHeaderTitle() {
    var title = 'MBTA Nearby';
    if (state.data.placeName) title = 'MBTA · ' + state.data.placeName;
    document.getElementById('hdr-title').textContent = title;
  }

  // ==================== GEOLOCATION ====================
  function getLocation() {
    return new Promise(function(resolve, reject) {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        function(p) { resolve({ lat: p.coords.latitude, lon: p.coords.longitude }); },
        function(e) { reject(e); },
        { timeout: 15000, enableHighAccuracy: false }
      );
    });
  }

  function reverseGeocode(lat, lon) {
    var url = 'https://nominatim.openstreetmap.org/reverse?lat=' + lat +
      '&lon=' + lon + '&format=json&zoom=16';
    fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function(r) { return r.json(); })
      .then(function(j) {
        var a = j.address || {};
        var hood = a.neighbourhood || a.suburb || '';
        var city = a.city || a.town || a.village || '';
        state.data.placeName = (hood && city) ? hood + ', ' + city : (city || hood || '');
        updateHeaderTitle();
      })
      .catch(function() { /* silent — header stays as-is */ });
  }

  // ==================== DOMAIN: STOPS & PREDICTIONS ====================
  function haversine(lat1, lon1, lat2, lon2) {
    var R = 3958.8;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Initial bearing from (lat1, lon1) to (lat2, lon2), in degrees clockwise from north.
  function bearing(lat1, lon1, lat2, lon2) {
    var f1 = lat1 * Math.PI / 180;
    var f2 = lat2 * Math.PI / 180;
    var dl = (lon2 - lon1) * Math.PI / 180;
    var y = Math.sin(dl) * Math.cos(f2);
    var x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function fmtDist(mi) {
    if (mi < 0.1) return Math.round(mi * 5280) + ' ft';
    return mi.toFixed(1) + ' mi';
  }

  function fetchStops(lat, lon) {
    var url = CONFIG.api.baseUrl + '/stops' +
      '?filter[latitude]=' + lat +
      '&filter[longitude]=' + lon +
      '&filter[radius]=0.02&sort=distance&page[limit]=25' +
      '&fields[stop]=name,latitude,longitude,location_type';
    var cacheKey = 'stops:' + lat.toFixed(4) + ',' + lon.toFixed(4);
    return apiGet(url, { cacheKey: cacheKey }).then(function(j) {
      var raw = j.data || [];
      var seen = {};
      var out = [];
      for (var i = 0; i < raw.length; i++) {
        var s = raw[i];
        var nm = s.attributes.name;
        if (seen[nm]) continue;
        seen[nm] = true;
        out.push({
          id: s.id,
          name: nm,
          lat: s.attributes.latitude,
          lon: s.attributes.longitude,
          d: haversine(lat, lon, s.attributes.latitude, s.attributes.longitude),
        });
      }
      out.sort(function(a, b) { return a.d - b.d; });
      return out.slice(0, CONFIG.numStations);
    });
  }

  function fetchPreds(stopId) {
    var url = CONFIG.api.baseUrl + '/predictions' +
      '?filter[stop]=' + stopId +
      '&include=route&sort=direction_id,departure_time' +
      '&fields[prediction]=arrival_time,departure_time,direction_id,status' +
      '&fields[route]=long_name,short_name,color,direction_names,direction_destinations,type';
    return apiGet(url, { cacheKey: 'preds:' + stopId, cacheDuration: 15000 }).then(function(j) {
      var preds = j.data || [];
      var inc = j.included || [];
      var rMap = {};
      for (var i = 0; i < inc.length; i++) {
        if (inc[i].type === 'route') rMap[inc[i].id] = inc[i].attributes;
      }
      var gMap = {};
      var order = [];
      for (var k = 0; k < preds.length; k++) {
        var p = preds[k];
        var rId = p.relationships.route.data.id;
        var dId = p.attributes.direction_id;
        var key = rId + '|' + dId;
        if (!gMap[key]) {
          var rt = rMap[rId] || {};
          var dests = rt.direction_destinations || [];
          var dirs = rt.direction_names || [];
          gMap[key] = {
            rId: rId,
            badge: rt.short_name || rId,
            label: rt.long_name || '',
            color: rt.color ? '#' + rt.color : '#666',
            rType: rt.type,
            dest: dests[dId] || dirs[dId] || (dId === 0 ? 'Outbound' : 'Inbound'),
            ps: [],
          };
          order.push(key);
        }
        var t = p.attributes.arrival_time || p.attributes.departure_time;
        gMap[key].ps.push({ time: t, status: p.attributes.status });
      }
      var out = [];
      for (var m = 0; m < order.length; m++) {
        var g = gMap[order[m]];
        g.ps = g.ps.slice(0, 2);
        out.push(g);
      }
      out.sort(function(a, b) {
        if (a.rType !== b.rType) return (a.rType || 99) - (b.rType || 99);
        if (a.rId !== b.rId) return a.rId < b.rId ? -1 : 1;
        return 0;
      });
      return out;
    });
  }

  function fmtTime(p) {
    if (p.status) return p.status;
    if (!p.time) return '---';
    var diff = Math.round((new Date(p.time) - new Date()) / 60000);
    if (diff <= 0) return 'NOW';
    if (diff < 60) return diff + ' min';
    var d = new Date(p.time);
    return d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  }

  function timeCls(p) {
    if (p.status) return 'imminent';
    if (!p.time) return 'none';
    var diff = Math.round((new Date(p.time) - new Date()) / 60000);
    if (diff <= 1) return 'imminent';
    if (diff <= 5) return 'soon';
    return '';
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ==================== RENDER ====================
  function bustPredsCache() {
    Object.keys(state.cache).forEach(function(k) {
      if (k.indexOf('preds:') === 0) delete state.cache[k];
    });
  }

  function render() {
    var el = document.getElementById('station-list');
    var stations = state.data.stations;
    var h = '';

    for (var si = 0; si < stations.length; si++) {
      var st = stations[si];
      var stop = st.stop;
      var groups = st.groups;

      var b = bearing(state.data.lat, state.data.lon, stop.lat, stop.lon);
      var rot = state.currentHeading !== null ? (b - state.currentHeading) : b;
      h += '<div class="station-header">' +
           '<div class="station-name">' + esc(stop.name) + '</div>' +
           '<div class="station-dist">' + fmtDist(stop.d) + '</div>' +
           '<div class="station-arrow" data-bearing="' + b.toFixed(1) +
           '" style="transform:rotate(' + rot.toFixed(1) + 'deg)">↑</div>' +
           '</div>';

      if (groups.length === 0) {
        h += '<div class="no-service">No upcoming vehicles</div>';
        continue;
      }

      for (var gi = 0; gi < groups.length; gi++) {
        var g = groups[gi];
        var c = ROUTE_COLORS[g.rId] || g.color || TYPE_COLORS[g.rType] || '#666';
        var tc = badgeTextColor(c);

        h += '<div class="route-row focusable" tabindex="0">' +
             '<span class="route-badge" style="background:' + c + ';color:' + tc + ';">' + esc(g.badge) + '</span>' +
             '<span class="route-dest">' + esc(g.dest) + '</span>' +
             '<div class="preds">';

        for (var j = 0; j < 2; j++) {
          var lbl = j === 0 ? 'Next' : 'Then';
          if (j < g.ps.length) {
            h += '<div class="pred-col"><div class="pred-label">' + lbl + '</div>' +
                 '<div class="pred-val ' + timeCls(g.ps[j]) + '">' + fmtTime(g.ps[j]) + '</div></div>';
          } else {
            h += '<div class="pred-col"><div class="pred-label">' + lbl + '</div>' +
                 '<div class="pred-val none">---</div></div>';
          }
        }
        h += '</div></div>';
      }
    }
    el.innerHTML = h;
    el.classList.remove('hidden');
  }

  function renderPreservingFocus() {
    var prev = focusables();
    var prevIdx = prev.indexOf(document.activeElement);
    render();
    var next = focusables();
    if (next.length === 0) return;
    var idx = prevIdx >= 0 && prevIdx < next.length ? prevIdx : 0;
    next[idx].focus();
  }

  // ==================== LOAD / REFRESH ====================
  function loadAll(lat, lon) {
    setLoading(true, 'Finding stops...', '');

    return fetchStops(lat, lon).then(function(stops) {
      if (stops.length === 0 && !state.data.usingMock) {
        state.data.usingMock = true;
        state.data.lat = CONFIG.mock.lat;
        state.data.lon = CONFIG.mock.lon;
        setLoading(true, 'Loading...', 'Too far from Boston — using demo location');
        return loadAll(CONFIG.mock.lat, CONFIG.mock.lon);
      }
      if (stops.length === 0) {
        setError('Could not find any MBTA stops near your location.');
        return;
      }

      setLoading(true, 'Loading predictions...', '');

      var promises = stops.map(function(s) { return fetchPreds(s.id); });
      return Promise.all(promises).then(function(results) {
        state.data.stations = stops.map(function(s, i) {
          return { stop: s, groups: results[i] };
        });
        clearError();
        setLoading(false);
        render();
        focusFirst();
        markFresh();
        reverseGeocode(lat, lon);
        startRefreshTimer();
      });
    }).catch(function(err) {
      setError(err.message || 'Failed to load data');
    });
  }

  function startRefreshTimer() {
    if (state.refreshTimer) clearInterval(state.refreshTimer);
    state.refreshTimer = setInterval(refreshAll, CONFIG.refreshInterval);
  }

  function stopRefreshTimer() {
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
      state.refreshTimer = null;
    }
  }

  function refreshAll() {
    if (state.isRefreshing) return;
    state.isRefreshing = true;
    setStatus('refreshing');

    var locPromise = state.data.usingMock
      ? Promise.resolve(null)
      : getLocation().then(function(l) { return l; }).catch(function() { return null; });

    locPromise.then(function(loc) {
      var moved = false;
      if (loc) {
        var drift = haversine(state.data.lat, state.data.lon, loc.lat, loc.lon);
        if (drift > CONFIG.moveThresholdMi) {
          state.data.lat = loc.lat;
          state.data.lon = loc.lon;
          moved = true;
          reverseGeocode(loc.lat, loc.lon);
        }
      }

      if (moved) {
        return fetchStops(state.data.lat, state.data.lon).then(function(stops) {
          if (stops.length === 0) return refreshPreds();
          return Promise.all(stops.map(function(s) { return fetchPreds(s.id); })).then(function(rs) {
            state.data.stations = stops.map(function(s, i) {
              return { stop: s, groups: rs[i] };
            });
            renderPreservingFocus();
          });
        });
      }
      return refreshPreds();
    }).then(function() {
      state.isRefreshing = false;
      markFresh();
      setStatus('live');
    }).catch(function() {
      state.isRefreshing = false;
      setStatus('live');
    });
  }

  function refreshPreds() {
    bustPredsCache();
    var stations = state.data.stations;
    var promises = stations.map(function(st) { return fetchPreds(st.stop.id); });
    return Promise.all(promises).then(function(rs) {
      for (var i = 0; i < stations.length; i++) stations[i].groups = rs[i];
      renderPreservingFocus();
    });
  }

  // ==================== ACTION HANDLING ====================
  function handleAction(action) {
    switch (action) {
      case 'refresh':
        state.cache = {};
        startApp();
        break;
      default:
        handleAppAction(action);
    }
  }

  function handleAppAction(action) {
    console.log('[Action]', action);
  }

  // ==================== EVENT LISTENERS ====================
  // Pause auto-refresh while the tab is hidden (browsers throttle background
  // fetches and timers, which leaves the spinner stuck when you come back).
  // On return, refresh immediately so the data is current.
  function onVisibilityChange() {
    if (document.hidden) {
      stopRefreshTimer();
    } else if (state.data.stations.length > 0 && !state.isRefreshing) {
      refreshAll();
      startRefreshTimer();
    }
  }

  // Compass heading from DeviceOrientationEvent, throttled to ~30 Hz per the
  // sensor performance budget. Rotates station arrows to point toward each
  // stop relative to which way the user is facing.
  var lastOrientationUpdate = 0;
  function onOrientation(e) {
    var now = Date.now();
    if (now - lastOrientationUpdate < 33) return;
    lastOrientationUpdate = now;

    var heading;
    if (typeof e.webkitCompassHeading === 'number') {
      heading = e.webkitCompassHeading;
    } else if (e.absolute && typeof e.alpha === 'number') {
      heading = (360 - e.alpha) % 360;
    } else {
      return;
    }
    state.currentHeading = heading;
    updateArrows();
  }

  function updateArrows() {
    var arrows = document.querySelectorAll('.station-arrow');
    for (var i = 0; i < arrows.length; i++) {
      var b = parseFloat(arrows[i].dataset.bearing);
      var rot = state.currentHeading !== null ? (b - state.currentHeading) : b;
      arrows[i].style.transform = 'rotate(' + rot.toFixed(1) + 'deg)';
    }
  }

  function setupEvents() {
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('deviceorientation', onOrientation);

    document.addEventListener('click', function(e) {
      var el = e.target.closest('[data-action]');
      if (el) handleAction(el.dataset.action);
    });

    document.addEventListener('keydown', function(e) {
      switch (e.key) {
        case 'ArrowUp':
          moveFocus('up');
          e.preventDefault();
          break;
        case 'ArrowDown':
          moveFocus('down');
          e.preventDefault();
          break;
        case 'ArrowLeft':
          moveFocus('left');
          e.preventDefault();
          break;
        case 'ArrowRight':
          moveFocus('right');
          e.preventDefault();
          break;
        case 'Enter':
          if (document.activeElement &&
              document.activeElement.classList.contains('focusable')) {
            document.activeElement.click();
          }
          e.preventDefault();
          break;
        case 'Escape':
        case 'Backspace':
          e.preventDefault();
          break;
      }
    });
  }

  // ==================== APP FLOW ====================
  function startApp() {
    stopRefreshTimer();
    state.data.usingMock = false;
    clearError();
    document.getElementById('station-list').classList.add('hidden');
    setLoading(true, 'Getting location...', 'Finding nearby MBTA stops');

    if (state.paramOverride) {
      state.data.usingMock = true;
      state.data.lat = CONFIG.mock.lat;
      state.data.lon = CONFIG.mock.lon;
      return loadAll(CONFIG.mock.lat, CONFIG.mock.lon);
    }

    getLocation().then(function(loc) {
      state.data.lat = loc.lat;
      state.data.lon = loc.lon;
      return loadAll(loc.lat, loc.lon);
    }).catch(function() {
      state.data.usingMock = true;
      state.data.lat = CONFIG.mock.lat;
      state.data.lon = CONFIG.mock.lon;
      setLoading(true, 'Loading...', 'Location unavailable — using demo location');
      return loadAll(CONFIG.mock.lat, CONFIG.mock.lon);
    });
  }

  // ==================== INITIALIZATION ====================
  function init() {
    collectScreens();
    setupEvents();

    var params = new URLSearchParams(window.location.search);
    if (params.has('lat') && params.has('lon')) {
      state.paramOverride = true;
      CONFIG.mock.lat = parseFloat(params.get('lat'));
      CONFIG.mock.lon = parseFloat(params.get('lon'));
    }

    navigateTo('home');
    startApp();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
