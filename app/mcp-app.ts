import { App } from "@modelcontextprotocol/ext-apps";

const summaryEl = document.getElementById("summary")!;
const forecastEl = document.getElementById("forecast")!;
const formEl = document.getElementById("weather-form") as HTMLFormElement;
const cityEl = document.getElementById("city") as HTMLInputElement;
const unitsEl = document.getElementById("units") as HTMLSelectElement;

type WeatherPayload = {
  city: string;
  units: "fahrenheit" | "celsius";
  generatedAt: string;
  summary: string;
  forecast: Array<{ day: string; high: number; low: number; condition: string }>;
};

function renderWeather(payload: WeatherPayload) {
  summaryEl.textContent = `${payload.summary} Updated ${new Date(payload.generatedAt).toLocaleString()}.`;
  cityEl.value = payload.city;
  unitsEl.value = payload.units;
  const suffix = payload.units === "fahrenheit" ? "°F" : "°C";
  forecastEl.innerHTML = payload.forecast
    .map(
      (day) => `
        <article class="forecast-card">
          <h2>${day.day}</h2>
          <p>${day.condition}</p>
          <p><strong>${day.high}${suffix}</strong> / ${day.low}${suffix}</p>
        </article>
      `,
    )
    .join("");
}

function readToolPayload(result: unknown): WeatherPayload | undefined {
  const content = (result as { content?: Array<{ type: string; text?: string }> })?.content;
  const text = content?.find((item) => item.type === "text")?.text;
  if (!text) return undefined;
  try {
    return JSON.parse(text) as WeatherPayload;
  } catch {
    return undefined;
  }
}

const app = new App({ name: "Weather Dashboard", version: "0.1.0" });
app.connect();

app.ontoolresult = (result) => {
  const payload = readToolPayload(result);
  if (payload) renderWeather(payload);
};

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  summaryEl.textContent = "Refreshing forecast...";
  const result = await app.callServerTool({
    name: "weather_dashboard",
    arguments: {
      city: cityEl.value || "San Francisco",
      units: unitsEl.value,
    },
  });
  const payload = readToolPayload(result);
  if (payload) {
    renderWeather(payload);
  } else {
    summaryEl.textContent = "Could not load forecast.";
  }
});
