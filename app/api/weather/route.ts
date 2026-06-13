import { NextRequest, NextResponse } from "next/server";

type OpenMeteoGeocodingResult = {
  latitude?: number;
  longitude?: number;
  name?: string;
  country?: string;
};

type GoogleWeatherCondition = {
  type?: string;
};

type GoogleCurrentConditions = {
  currentTime?: string;
  timeZone?: { id?: string };
  weatherCondition?: GoogleWeatherCondition;
  temperature?: { degrees?: number };
  feelsLikeTemperature?: { degrees?: number };
  relativeHumidity?: number;
  cloudCover?: number;
  precipitation?: {
    probability?: { percent?: number };
    qpf?: { quantity?: number };
  };
  wind?: {
    direction?: { degrees?: number };
    speed?: { value?: number };
  };
};

type GoogleForecastDay = {
  displayDate?: { year?: number; month?: number; day?: number };
  daytimeForecast?: {
    weatherCondition?: GoogleWeatherCondition;
    precipitation?: { probability?: { percent?: number } };
  };
  nighttimeForecast?: {
    weatherCondition?: GoogleWeatherCondition;
    precipitation?: { probability?: { percent?: number } };
  };
  maxTemperature?: { degrees?: number };
  minTemperature?: { degrees?: number };
};

type GoogleDailyForecast = {
  forecastDays?: GoogleForecastDay[];
  timeZone?: { id?: string };
};

function toFiniteNumber(value: string | null): number | null {
  const parsed = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidLatitude(value: number | null): value is number {
  return value !== null && value >= -90 && value <= 90;
}

function isValidLongitude(value: number | null): value is number {
  return value !== null && value >= -180 && value <= 180;
}

async function fetchJson(url: string, revalidateSeconds = 600) {
  const response = await fetch(url, {
    next: { revalidate: revalidateSeconds },
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Weather provider returned ${response.status}`);
  }

  return await response.json();
}

async function geocodeLocation(query: string) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const data = await fetchJson(url.toString(), 24 * 60 * 60);
  const first = data?.results?.[0] as OpenMeteoGeocodingResult | undefined;
  const latitude = Number(first?.latitude);
  const longitude = Number(first?.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude,
    longitude,
    place: [first?.name, first?.country].filter(Boolean).join(", ") || query,
  };
}

function googleConditionToWeatherCode(type?: string): number {
  const condition = String(type || "").toUpperCase();

  if (condition === "CLEAR") return 0;
  if (["MOSTLY_CLEAR", "PARTLY_CLOUDY"].includes(condition)) return 2;
  if (["MOSTLY_CLOUDY", "CLOUDY", "WINDY"].includes(condition)) return 3;
  if (/FOG|MIST|HAZE|SMOKE|DUST|SAND/.test(condition)) return 45;
  if (/THUNDER|STORM/.test(condition)) return 95;
  if (/SNOW|SLEET|ICE|BLIZZARD|FLURR/.test(condition)) return 73;
  if (/SHOWERS|SHOWER|HAIL/.test(condition)) return 80;
  if (/RAIN|DRIZZLE/.test(condition)) return 61;

  return 2;
}

function googleDisplayDateToIso(displayDate?: GoogleForecastDay["displayDate"]): string {
  const year = Number(displayDate?.year);
  const month = Number(displayDate?.month);
  const day = Number(displayDate?.day);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return "";
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function maxFinite(...values: unknown[]): number | null {
  const finite = values.map(Number).filter(Number.isFinite);
  return finite.length ? Math.max(...finite) : null;
}

async function loadGoogleWeather({
  latitude,
  longitude,
  requestedTimezone,
  place,
  locationQuery,
  apiKey,
}: {
  latitude: number;
  longitude: number;
  requestedTimezone: string;
  place: string;
  locationQuery: string;
  apiKey: string;
}) {
  const currentUrl = new URL("https://weather.googleapis.com/v1/currentConditions:lookup");
  currentUrl.searchParams.set("key", apiKey);
  currentUrl.searchParams.set("location.latitude", String(latitude));
  currentUrl.searchParams.set("location.longitude", String(longitude));
  currentUrl.searchParams.set("unitsSystem", "METRIC");
  currentUrl.searchParams.set("languageCode", "en");

  const dailyUrl = new URL("https://weather.googleapis.com/v1/forecast/days:lookup");
  dailyUrl.searchParams.set("key", apiKey);
  dailyUrl.searchParams.set("location.latitude", String(latitude));
  dailyUrl.searchParams.set("location.longitude", String(longitude));
  dailyUrl.searchParams.set("unitsSystem", "METRIC");
  dailyUrl.searchParams.set("languageCode", "en");
  dailyUrl.searchParams.set("days", "4");
  dailyUrl.searchParams.set("pageSize", "4");

  const [currentData, dailyData] = (await Promise.all([
    fetchJson(currentUrl.toString(), 600),
    fetchJson(dailyUrl.toString(), 600),
  ])) as [GoogleCurrentConditions, GoogleDailyForecast];

  const forecast = (Array.isArray(dailyData?.forecastDays) ? dailyData.forecastDays : [])
    .slice(0, 4)
    .map((day) => ({
      date: googleDisplayDateToIso(day.displayDate),
      weatherCode: googleConditionToWeatherCode(
        day.daytimeForecast?.weatherCondition?.type || day.nighttimeForecast?.weatherCondition?.type
      ),
      temperatureMax: Number.isFinite(Number(day.maxTemperature?.degrees))
        ? Number(day.maxTemperature?.degrees)
        : null,
      temperatureMin: Number.isFinite(Number(day.minTemperature?.degrees))
        ? Number(day.minTemperature?.degrees)
        : null,
      rainChance: maxFinite(
        day.daytimeForecast?.precipitation?.probability?.percent,
        day.nighttimeForecast?.precipitation?.probability?.percent
      ),
    }))
    .filter((day) => day.date);

  return {
    ok: true,
    provider: "google_weather",
    attribution: "Google Maps",
    place: place || locationQuery || "Hotel",
    latitude,
    longitude,
    timezone: currentData?.timeZone?.id || dailyData?.timeZone?.id || requestedTimezone,
    sourceUrl: "https://developers.google.com/maps/documentation/weather",
    updatedAt: currentData?.currentTime || new Date().toISOString(),
    current: {
      temperature: Number.isFinite(Number(currentData?.temperature?.degrees))
        ? Number(currentData.temperature?.degrees)
        : null,
      apparentTemperature: Number.isFinite(Number(currentData?.feelsLikeTemperature?.degrees))
        ? Number(currentData.feelsLikeTemperature?.degrees)
        : null,
      humidity: Number.isFinite(Number(currentData?.relativeHumidity))
        ? Number(currentData.relativeHumidity)
        : null,
      weatherCode: googleConditionToWeatherCode(currentData?.weatherCondition?.type),
      cloudCover: Number.isFinite(Number(currentData?.cloudCover))
        ? Number(currentData.cloudCover)
        : null,
      windSpeed: Number.isFinite(Number(currentData?.wind?.speed?.value))
        ? Number(currentData.wind?.speed?.value)
        : null,
      windDirection: Number.isFinite(Number(currentData?.wind?.direction?.degrees))
        ? Number(currentData.wind?.direction?.degrees)
        : null,
      precipitation: Number.isFinite(Number(currentData?.precipitation?.qpf?.quantity))
        ? Number(currentData.precipitation?.qpf?.quantity)
        : null,
    },
    daily: forecast,
  };
}

async function loadOpenMeteoWeather({
  latitude,
  longitude,
  requestedTimezone,
  place,
  locationQuery,
}: {
  latitude: number;
  longitude: number;
  requestedTimezone: string;
  place: string;
  locationQuery: string;
}) {
  const commercialApiKey = String(process.env.OPEN_METEO_API_KEY || "").trim();
  const forecastEndpoint = commercialApiKey
    ? "https://customer-api.open-meteo.com/v1/forecast"
    : "https://api.open-meteo.com/v1/forecast";
  const forecastUrl = new URL(forecastEndpoint);
  forecastUrl.searchParams.set("latitude", String(latitude));
  forecastUrl.searchParams.set("longitude", String(longitude));
  forecastUrl.searchParams.set(
    "current",
    [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "weather_code",
      "cloud_cover",
      "wind_speed_10m",
      "wind_direction_10m",
      "precipitation",
    ].join(",")
  );
  forecastUrl.searchParams.set(
    "daily",
    [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_probability_max",
    ].join(",")
  );
  forecastUrl.searchParams.set("timezone", requestedTimezone);
  forecastUrl.searchParams.set("forecast_days", "4");
  forecastUrl.searchParams.set("wind_speed_unit", "kmh");
  if (commercialApiKey) forecastUrl.searchParams.set("apikey", commercialApiKey);

  const data = await fetchJson(forecastUrl.toString(), 600);
  const current = data?.current ?? {};
  const daily = data?.daily ?? {};
  const dates: string[] = Array.isArray(daily.time) ? daily.time : [];

  const forecast = dates.map((date, index) => ({
    date,
    weatherCode: daily.weather_code?.[index] ?? null,
    temperatureMax: daily.temperature_2m_max?.[index] ?? null,
    temperatureMin: daily.temperature_2m_min?.[index] ?? null,
    rainChance: daily.precipitation_probability_max?.[index] ?? null,
  }));

  return {
    ok: true,
    provider: "open_meteo",
    attribution: "Open-Meteo",
    place: place || locationQuery || "Hotel",
    latitude,
    longitude,
    timezone: data?.timezone || requestedTimezone,
    sourceUrl: "https://open-meteo.com/",
    updatedAt: current.time || new Date().toISOString(),
    current: {
      temperature: current.temperature_2m ?? null,
      apparentTemperature: current.apparent_temperature ?? null,
      humidity: current.relative_humidity_2m ?? null,
      weatherCode: current.weather_code ?? null,
      cloudCover: current.cloud_cover ?? null,
      windSpeed: current.wind_speed_10m ?? null,
      windDirection: current.wind_direction_10m ?? null,
      precipitation: current.precipitation ?? null,
    },
    daily: forecast,
  };
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    let latitude = toFiniteNumber(params.get("lat"));
    let longitude = toFiniteNumber(params.get("lon"));
    const locationQuery = String(params.get("query") || "").trim();
    let place = String(params.get("place") || "").trim();
    const requestedTimezone = String(params.get("tz") || "Europe/Sofia").trim() || "Europe/Sofia";

    if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
      if (!locationQuery) {
        return NextResponse.json(
          { ok: false, error: "missing_hotel_location" },
          { status: 400 }
        );
      }

      const geocoded = await geocodeLocation(locationQuery);
      if (!geocoded) {
        return NextResponse.json(
          { ok: false, error: "hotel_location_not_found" },
          { status: 404 }
        );
      }

      latitude = geocoded.latitude;
      longitude = geocoded.longitude;
      place ||= geocoded.place;
    }

    const googleApiKey = String(
      process.env.GOOGLE_WEATHER_API_KEY || process.env.GOOGLE_MAPS_API_KEY || ""
    ).trim();

    if (googleApiKey) {
      try {
        const googleWeather = await loadGoogleWeather({
          latitude,
          longitude,
          requestedTimezone,
          place,
          locationQuery,
          apiKey: googleApiKey,
        });
        return NextResponse.json(googleWeather);
      } catch (googleError) {
        console.warn("Google Weather API failed; using Open-Meteo fallback", googleError);
      }
    }

    const fallbackWeather = await loadOpenMeteoWeather({
      latitude,
      longitude,
      requestedTimezone,
      place,
      locationQuery,
    });

    return NextResponse.json(fallbackWeather);
  } catch (error) {
    console.error("weather GET failed", error);
    return NextResponse.json(
      { ok: false, error: "weather_unavailable" },
      { status: 502 }
    );
  }
}
