export async function fetchWeather(location = "Ha Noi", fetchImpl = fetch) {
  const query = String(location || "Ha Noi").trim();
  try {
    const url = `https://wttr.in/${encodeURIComponent(query)}?format=j1`;
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
    if (response.ok) {
      const data = await response.json();
      const current = data?.current_condition?.[0];
      const area = data?.nearest_area?.[0];
      const cityName = area?.areaName?.[0]?.value || area?.region?.[0]?.value || query;
      const country = area?.country?.[0]?.value || "VN";
      if (current) {
        const tempC = current.temp_C || "N/A";
        const feelsLikeC = current.FeelsLikeC || tempC;
        const humidity = current.humidity || "N/A";
        const desc = current.lang_vi?.[0]?.value || current.weatherDesc?.[0]?.value || "Bình thường";
        const wind = current.windspeedKmph || "N/A";
        const forecastToday = data?.weather?.[0];
        const maxTemp = forecastToday?.maxtempC || tempC;
        const minTemp = forecastToday?.mintempC || tempC;

        return {
          ok: true,
          location: `${cityName}, ${country}`,
          temp: `${tempC}°C`,
          feelsLike: `${feelsLikeC}°C`,
          minMax: `${minTemp}°C - ${maxTemp}°C`,
          humidity: `${humidity}%`,
          wind: `${wind} km/h`,
          description: desc,
          summary: `🌤️ THỜI TIẾT TẠI ${cityName.toUpperCase()} (${country})\n- Trạng thái: ${desc}\n- Nhiệt độ: ${tempC}°C (Cảm giác như ${feelsLikeC}°C)\n- Thấp nhất / Cao nhất: ${minTemp}°C - ${maxTemp}°C\n- Độ ẩm: ${humidity}%\n- Gió: ${wind} km/h`
        };
      }
    }
  } catch {
    /* Fall back to open-meteo below if wttr fails */
  }

  // Fallback simple fetch format
  try {
    const textUrl = `https://wttr.in/${encodeURIComponent(query)}?format=3`;
    const res = await fetchImpl(textUrl, { signal: AbortSignal.timeout(8_000) });
    if (res.ok) {
      const text = await res.text();
      if (text.trim()) {
        return {
          ok: true,
          location: query,
          summary: `🌤️ THỜI TIẾT TẠI ${query.toUpperCase()}:\n${text.trim()}`
        };
      }
    }
  } catch {}

  return {
    ok: false,
    location: query,
    summary: `⚠️ Không lấy được thông tin thời tiết cho "${query}".`
  };
}
