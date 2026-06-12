import { NextRequest, NextResponse } from "next/server";

type OpenMeteoGeocodingResult = {
  latitude?: number;
  longitude?: number;
  name?: string;
  country?: string;
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

    return NextResponse.json({
      ok: true,
      place: place || locationQuery || "Hotel",
      latitude,
      longitude,
      timezone: data?.timezone || requestedTimezone,
      sourceUrl: forecastUrl.toString(),
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
    });
  } catch (error) {
    console.error("weather GET failed", error);
    return NextResponse.json(
      { ok: false, error: "weather_unavailable" },
      { status: 502 }
    );
  }
}
