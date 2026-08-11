// ─── Real weather via Open-Meteo (free, no API key) ───────────────
// Fetches current conditions + 5-day forecast for the farmer's location.
// In-memory cache (30 min) keeps dashboards fast; graceful fallback to a
// static demo feed when offline or the API is unreachable.

const FALLBACK = {
  temp: 24,
  condition: "Partly Cloudy",
  humidity: 65,
  rain: 10,
  wind: 12,
  forecast: [
    { day: "Thu", hi: 26, lo: 17, icon: "sunny" },
    { day: "Fri", hi: 25, lo: 16, icon: "partly" },
    { day: "Sat", hi: 24, lo: 15, icon: "rain" },
    { day: "Sun", hi: 27, lo: 18, icon: "sunny" },
    { day: "Mon", hi: 23, lo: 14, icon: "cloudy" },
  ],
};

const cache = new Map(); // key: location -> { at, data }
const TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 50; // bound memory: evict oldest when exceeded
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Prune expired entries and evict oldest when the cache grows too large.
const trimCache = () => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.at >= TTL_MS) cache.delete(key);
  }
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
};

// WMO weather code → icon name used by the farmer dashboard widget.
const codeToIcon = (code) => {
  if (code === 0) return "sunny";
  if (code <= 3) return "partly";
  if (code <= 48 || (code >= 80 && code <= 82)) return "cloudy";
  if (code <= 67 || (code >= 95 && code <= 99)) return "rain";
  if (code <= 86) return "rain";
  return "cloudy";
};

// Rough geocode for common Ethiopian regions; defaults to Addis Ababa.
const KNOWN_PLACES = {
  "addis ababa": { lat: 9.024, lon: 38.7469 },
  "bishoftu": { lat: 8.7523, lon: 38.9785 },
  "debre zeit": { lat: 8.7523, lon: 38.9785 },
  "bahir dar": { lat: 11.5936, lon: 37.3908 },
  "hawassa": { lat: 7.0621, lon: 38.4761 },
  "mekelle": { lat: 13.4967, lon: 39.4753 },
  "adama": { lat: 8.54, lon: 39.27 },
  "gondar": { lat: 12.6, lon: 37.47 },
  "jimma": { lat: 7.6667, lon: 36.8333 },
  "dire dawa": { lat: 9.5931, lon: 41.8661 },
};

export const geocodeLocation = (location = "") => {
  const key = String(location || "").toLowerCase().split(",")[0].trim();
  return KNOWN_PLACES[key] || { lat: 9.024, lon: 38.7469 };
};

export async function getWeather(location = "") {
  const key = String(location || "addis ababa").toLowerCase().trim();
  if (key.length > 80) return { ...FALLBACK, source: "demo" }; // reject absurd inputs
  trimCache();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data;

  const { lat, lon } = geocodeLocation(key);
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m,weather_code` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=auto&forecast_days=5`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`weather ${res.status}`);
    const data = await res.json();

    const current = data.current || {};
    const daily = data.daily || {};
    const today = new Date();
    const forecast = (daily.time || []).slice(0, 5).map((date, i) => {
      const day = new Date(date);
      const dayName = day.getTime() === today.setHours(0, 0, 0, 0) ? "Today" : DAYS[day.getDay()];
      return {
        day: dayName,
        hi: Math.round(daily.temperature_2m_max?.[i] ?? 0),
        lo: Math.round(daily.temperature_2m_min?.[i] ?? 0),
        icon: codeToIcon(daily.weather_code?.[i]),
      };
    });

    const weather = {
      temp: Math.round(current.temperature_2m ?? FALLBACK.temp),
      condition: codeToIcon(current.weather_code ?? 1) === "sunny" ? "Sunny" : codeToIcon(current.weather_code ?? 1) === "partly" ? "Partly Cloudy" : codeToIcon(current.weather_code ?? 1) === "rain" ? "Rainy" : "Cloudy",
      humidity: Math.round(current.relative_humidity_2m ?? FALLBACK.humidity),
      rain: Math.round(current.precipitation_probability ?? FALLBACK.rain),
      wind: Math.round(current.wind_speed_10m ?? FALLBACK.wind),
      forecast,
      source: "live",
    };
    cache.set(key, { at: Date.now(), data: weather });
    return weather;
  } catch {
    if (cached) return cached.data;
    return { ...FALLBACK, source: "demo" };
  }
}
