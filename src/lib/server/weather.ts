import type { WeatherSummary } from "@/lib/types";
import { locateArea, todayInSeoul } from "./claude";

// Open-Meteo: free forecast API (no key for non-commercial use), up to 16 days ahead.
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const SEOUL = { label: "서울", latitude: 37.5665, longitude: 126.978 };

const SLOTS: [string, number, number][] = [
  ["오전", 9, 12],
  ["점심", 12, 14],
  ["오후", 14, 18],
  ["저녁", 18, 21],
  ["밤", 21, 24],
];

/** Korean label for a WMO weather code. */
export function weatherLabel(code: number) {
  if (code === 0) return "맑음";
  if (code === 1) return "대체로 맑음";
  if (code === 2) return "구름 조금";
  if (code === 3) return "흐림";
  if (code === 45 || code === 48) return "안개";
  if (code >= 51 && code <= 57) return "이슬비";
  if (code >= 61 && code <= 67) return code >= 65 ? "강한 비" : "비";
  if (code >= 71 && code <= 77) return "눈";
  if (code >= 80 && code <= 82) return "소나기";
  if (code === 85 || code === 86) return "눈 소나기";
  if (code >= 95) return "뇌우";
  return "알 수 없음";
}

interface ForecastResponse {
  daily: {
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: (number | null)[];
    precipitation_sum: number[];
    wind_speed_10m_max: number[];
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: (number | null)[];
    weather_code: number[];
  };
}

export interface WeatherResult {
  weather: WeatherSummary | null;
  /** Text handed to the recommender; empty when there is no forecast. */
  text: string;
  note?: string;
}

export async function getWeather(area: string | undefined, date: string): Promise<WeatherResult> {
  const daysAhead = Math.round((Date.parse(date) - Date.parse(todayInSeoul())) / 86_400_000);
  if (daysAhead < 0) return { weather: null, text: "", note: "지난 날짜라 날씨는 반영하지 않았어요." };
  if (daysAhead > 15) return { weather: null, text: "", note: "16일 이후 날짜라 아직 날씨 예보가 없어요." };

  let loc = SEOUL;
  if (area?.trim()) {
    // If the area can't be resolved, fall back to Seoul and say so in the label.
    loc = (await locateArea(area).catch(() => null)) ?? { ...SEOUL, label: "서울 (지역 확인 실패)" };
  }

  try {
    const params = new URLSearchParams({
      latitude: String(loc.latitude),
      longitude: String(loc.longitude),
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max",
      hourly: "temperature_2m,precipitation_probability,weather_code",
      timezone: "Asia/Seoul",
      wind_speed_unit: "ms",
      start_date: date,
      end_date: date,
    });
    const res = await fetch(`${FORECAST_URL}?${params}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { daily, hourly } = (await res.json()) as ForecastResponse;

    const weather: WeatherSummary = {
      date,
      location: loc.label,
      code: daily.weather_code[0],
      label: weatherLabel(daily.weather_code[0]),
      tempMin: Math.round(daily.temperature_2m_min[0]),
      tempMax: Math.round(daily.temperature_2m_max[0]),
      precipProbability: daily.precipitation_probability_max[0],
    };

    const slots = SLOTS.map(([name, from, to]) => {
      const idx = hourly.time.flatMap((t, i) => {
        const hour = Number(t.slice(11, 13));
        return hour >= from && hour < to ? [i] : [];
      });
      const temp = Math.round(idx.reduce((s, i) => s + hourly.temperature_2m[i], 0) / idx.length);
      const rain = Math.max(...idx.map((i) => hourly.precipitation_probability[i] ?? 0));
      const code = Math.max(...idx.map((i) => hourly.weather_code[i]));
      return `${name} ${weatherLabel(code)} ${temp}°C 강수확률 ${rain}%`;
    });

    const text = [
      `${loc.label} ${date} 예보: ${weather.label}, 최저 ${weather.tempMin}°C / 최고 ${weather.tempMax}°C, 강수확률 최대 ${weather.precipProbability ?? "?"}%, 강수량 ${daily.precipitation_sum[0]}mm, 최대 풍속 ${daily.wind_speed_10m_max[0]}m/s`,
      `시간대별: ${slots.join(" / ")}`,
    ].join("\n");
    return { weather, text };
  } catch {
    return { weather: null, text: "", note: "날씨 정보를 가져오지 못했어요." };
  }
}
