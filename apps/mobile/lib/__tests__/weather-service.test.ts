/**
 * Tests de la couche météo.
 *
 * Le mapping du fournisseur est vérifié contre une réponse figée (aucun appel
 * réseau), pour rester déterministe en CI. Le point le plus sensible est la
 * gestion des fuseaux : Open-Meteo renvoie des timestamps UTC + un décalage, et
 * une erreur ici décale toute la météo d'une destination lointaine.
 */
import { OpenMeteoProvider } from '../services/weather/open-meteo';
import { RainViewerProvider } from '../services/weather/radar';
import { activitiesFor } from '../services/weather/activities';
import { moonAt, moonPhaseLabel } from '../services/weather/astro';
import { formatLocalTime, formatLocalWeekday } from '../services/weather/format';
import { kindFromWmoCode } from '../services/weather/wmo';
import type { CurrentWeather } from '../services/weather/types';

// Tokyo : UTC+9. Choisi exprès pour qu'une confusion heure locale / UTC saute
// aux yeux (9 h d'écart, et changement de jour).
const TOKYO_OFFSET = 32400;

/** Lever du soleil à Tokyo le 5 août 2026, 04:52 heure locale. */
const SUNRISE_UNIX = Math.floor(Date.UTC(2026, 7, 4, 19, 52) / 1000);
const SUNSET_UNIX = Math.floor(Date.UTC(2026, 7, 5, 9, 47) / 1000);
const NOON_UNIX = Math.floor(Date.UTC(2026, 7, 5, 3, 0) / 1000);

function fakeResponse() {
  return {
    timezone: 'Asia/Tokyo',
    utc_offset_seconds: TOKYO_OFFSET,
    current: {
      time: NOON_UNIX,
      temperature_2m: 31.4,
      apparent_temperature: 35.2,
      relative_humidity_2m: 68,
      is_day: 1,
      precipitation: 0,
      weather_code: 2,
      cloud_cover: 40,
      pressure_msl: 1008.6,
      wind_speed_10m: 12.7,
      wind_direction_10m: 180,
    },
    hourly: {
      time: [NOON_UNIX, NOON_UNIX + 3600, NOON_UNIX + 7200],
      temperature_2m: [31.4, 32.1, 30.8],
      weather_code: [2, 61, 95],
      precipitation_probability: [10, 60, 90],
      uv_index: [8.4, 7.1, 5.0],
      visibility: [24000, 12000, 8000],
      is_day: [1, 1, 1],
    },
    daily: {
      time: [SUNRISE_UNIX, SUNRISE_UNIX + 86400],
      weather_code: [2, 61],
      temperature_2m_max: [33.2, 29.4],
      temperature_2m_min: [24.1, 23.0],
      sunrise: [SUNRISE_UNIX, SUNRISE_UNIX + 86400],
      sunset: [SUNSET_UNIX, SUNSET_UNIX + 86400],
      uv_index_max: [9.1, 6.2],
      precipitation_probability_max: [20, 80],
      wind_speed_10m_max: [18, 25],
    },
  };
}

function mockFetch(forecast: unknown, airQuality?: unknown) {
  return jest.fn((url: string) => {
    const isAir = url.includes('air-quality');
    if (isAir && !airQuality) return Promise.resolve({ ok: false, status: 404 } as Response);
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(isAir ? airQuality : forecast),
    } as unknown as Response);
  });
}

describe('OpenMeteoProvider', () => {
  const realFetch = global.fetch;

  // Le provider choisit le créneau horaire le plus proche de « maintenant ».
  // Sans horloge figée, le résultat dépendrait de l'heure d'exécution du test.
  beforeEach(() => { jest.useFakeTimers().setSystemTime(NOON_UNIX * 1000); });
  afterEach(() => {
    jest.useRealTimers();
    global.fetch = realFetch;
  });

  it('convertit les timestamps Unix en instants UTC absolus', async () => {
    global.fetch = mockFetch(fakeResponse()) as never;
    const report = await new OpenMeteoProvider().fetchReport({ lat: 35.68, lng: 139.65 });

    expect(report.utcOffsetSeconds).toBe(TOKYO_OFFSET);
    // Le lever du soleil est bien un instant UTC, pas une heure murale.
    expect(report.daily[0].sunrise).toBe(new Date(SUNRISE_UNIX * 1000).toISOString());
    expect(report.daily[0].sunrise.endsWith('Z')).toBe(true);
  });

  it('affiche le lever du soleil à l\'heure de Tokyo, pas à celle du téléphone', async () => {
    global.fetch = mockFetch(fakeResponse()) as never;
    const report = await new OpenMeteoProvider().fetchReport({ lat: 35.68, lng: 139.65 });

    // 19:52 UTC = 04:52 le lendemain à Tokyo. C'est bien 04:52 qu'on doit voir.
    expect(formatLocalTime(report.daily[0].sunrise, report.utcOffsetSeconds)).toBe('04:52');
    expect(formatLocalTime(report.daily[0].sunset, report.utcOffsetSeconds)).toBe('18:47');
  });

  it('lit UV et visibilité sur le créneau horaire courant', async () => {
    global.fetch = mockFetch(fakeResponse()) as never;
    const report = await new OpenMeteoProvider().fetchReport({ lat: 35.68, lng: 139.65 });

    // Open-Meteo n'expose ni l'un ni l'autre en « current » : ils viennent de
    // la série horaire. 24000 m doivent devenir 24 km.
    expect(report.current.uvIndex).toBe(8);
    expect(report.current.visibilityKm).toBe(24);
  });

  it('normalise les valeurs météo courantes', async () => {
    global.fetch = mockFetch(fakeResponse()) as never;
    const { current } = await new OpenMeteoProvider().fetchReport({ lat: 35.68, lng: 139.65 });

    expect(current.tempC).toBe(31);
    expect(current.feelsLikeC).toBe(35);
    expect(current.kind).toBe('partly_cloudy');
    expect(current.isDay).toBe(true);
    expect(current.pressureHpa).toBe(1009);
  });

  it('survit à une qualité de l\'air indisponible', async () => {
    global.fetch = mockFetch(fakeResponse()) as never;
    const report = await new OpenMeteoProvider().fetchReport({ lat: 35.68, lng: 139.65 });
    expect(report.airQuality).toBeUndefined();
    expect(report.current.tempC).toBe(31);
  });

  it('classe la qualité de l\'air sur l\'échelle européenne', async () => {
    global.fetch = mockFetch(fakeResponse(), {
      current: { european_aqi: 55, pm2_5: 18, pm10: 30, ozone: 70, nitrogen_dioxide: 22 },
    }) as never;
    const report = await new OpenMeteoProvider().fetchReport({ lat: 35.68, lng: 139.65 });

    expect(report.airQuality?.level).toBe('moderate');
    expect(report.airQuality?.pm25).toBe(18);
  });

  it('rejette une réponse sans prévisions quotidiennes', async () => {
    global.fetch = mockFetch({ timezone: 'Asia/Tokyo', current: {} }) as never;
    await expect(
      new OpenMeteoProvider().fetchReport({ lat: 35.68, lng: 139.65 }),
    ).rejects.toThrow(/quotidiennes/);
  });
});

describe('grille de qualité de l\'air', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('interroge tous les points en une seule requête', async () => {
    // Le paramètre est typé explicitement : sans lui, TypeScript infere un
    // tuple d'arguments vide et `mock.calls[0][0]` devient inaccessible.
    const spy = jest.fn((_url: string) => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(
        Array.from({ length: 25 }, (_, i) => ({
          latitude: 48 + i * 0.1,
          longitude: 2 + i * 0.1,
          current: { european_aqi: 10 + i * 3 },
        })),
      ),
    } as unknown as Response));
    global.fetch = spy as never;

    const grid = await new OpenMeteoProvider()
      .fetchAirQualityGrid({ lat: 48.85, lng: 2.35 }, 0.6, 5);

    // 25 points mais un seul aller-retour réseau : c'est tout l'intérêt de
    // l'API groupée d'Open-Meteo.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(grid).toHaveLength(25);

    const url = String(spy.mock.calls[0][0]);
    expect(url.split('latitude=')[1].split('&')[0].split('%2C')).toHaveLength(25);
  });

  it('ignore les points sans mesure plutôt que de produire des trous', async () => {
    global.fetch = jest.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve([
        { latitude: 48, longitude: 2, current: { european_aqi: 30 } },
        { latitude: 49, longitude: 3, current: {} },
        { latitude: 50, longitude: 4, current: { european_aqi: 85 } },
      ]),
    } as unknown as Response)) as never;

    const grid = await new OpenMeteoProvider()
      .fetchAirQualityGrid({ lat: 48.85, lng: 2.35 }, 0.6, 2);

    expect(grid).toHaveLength(2);
    expect(grid[0].level).toBe('fair');
    expect(grid[1].level).toBe('very_poor');
  });
});

describe('radar de précipitations', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('construit les gabarits de tuiles et distingue les prévisions', async () => {
    global.fetch = jest.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        host: 'https://tilecache.rainviewer.com',
        radar: {
          past: [{ time: 1785930000, path: '/v2/radar/abc' }],
          nowcast: [{ time: 1785931200, path: '/v2/radar/def' }],
        },
      }),
    } as unknown as Response)) as never;

    const frames = await new RainViewerProvider().fetchFrames();

    expect(frames).toHaveLength(2);
    expect(frames[0].forecast).toBe(false);
    expect(frames[1].forecast).toBe(true);
    // Les jetons {z}/{x}/{y} doivent survivre : react-native-maps les remplace.
    expect(frames[0].tileUrlTemplate)
      .toBe('https://tilecache.rainviewer.com/v2/radar/abc/256/{z}/{x}/{y}/2/1_1.png');
    expect(frames[0].time).toBe(new Date(1785930000 * 1000).toISOString());
  });

  it('remonte une erreur si l\'index radar est injoignable', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 503 } as Response)) as never;
    await expect(new RainViewerProvider().fetchFrames()).rejects.toThrow(/503/);
  });
});

describe('codes WMO', () => {
  it('mappe les codes connus et retombe sur « cloudy » sinon', () => {
    expect(kindFromWmoCode(0)).toBe('clear');
    expect(kindFromWmoCode(65)).toBe('heavy_rain');
    expect(kindFromWmoCode(95)).toBe('thunderstorm');
    expect(kindFromWmoCode(1234)).toBe('cloudy');
  });
});

describe('formatage local', () => {
  it('donne le bon jour de la semaine dans le fuseau du lieu', () => {
    // 2026-08-04T19:52Z tombe déjà le mercredi 5 août à Tokyo.
    const iso = new Date(SUNRISE_UNIX * 1000).toISOString();
    expect(formatLocalWeekday(iso, TOKYO_OFFSET)).toBe('Mer');
    // Vu depuis UTC, c'est encore mardi — d'où l'importance du décalage.
    expect(formatLocalWeekday(iso, 0)).toBe('Mar');
  });
});

describe('phase lunaire', () => {
  it('reconnaît une pleine lune connue', () => {
    // Pleine lune du 12 août 2022, 01:36 UTC.
    const { phase, illumination } = moonAt(new Date(Date.UTC(2022, 7, 12, 1, 36)));
    expect(illumination).toBeGreaterThan(0.97);
    expect(moonPhaseLabel(phase)).toBe('Pleine lune');
  });

  it('reste dans l\'intervalle [0,1] avant la date de référence', () => {
    const { phase } = moonAt(new Date(Date.UTC(1990, 0, 1)));
    expect(phase).toBeGreaterThanOrEqual(0);
    expect(phase).toBeLessThanOrEqual(1);
  });
});

describe('activités recommandées', () => {
  const base: CurrentWeather = {
    tempC: 20, feelsLikeC: 20, kind: 'clear', isDay: true, humidity: 50,
    windKph: 10, windDirection: 180, pressureHpa: 1013, visibilityKm: 20,
    precipitationMm: 0, uvIndex: 4, cloudCover: 10,
  };

  it('propose l\'extérieur par beau temps', () => {
    const universes = activitiesFor(base).map((a) => a.universe);
    expect(universes).toContain('rooftop');
    expect(universes).toContain('beach');
  });

  it('bascule sur l\'intérieur sous la pluie', () => {
    const universes = activitiesFor({ ...base, kind: 'rain' }).map((a) => a.universe);
    expect(universes).toContain('restaurant');
    expect(universes).toContain('cinema');
    expect(universes).not.toContain('beach');
  });

  it('privilégie la vie nocturne quand il fait nuit', () => {
    const universes = activitiesFor({ ...base, isDay: false }).map((a) => a.universe);
    expect(universes.slice(0, 3)).toContain('bar');
  });

  it('propose de se rafraîchir en cas de forte chaleur', () => {
    const universes = activitiesFor({ ...base, tempC: 34 }).map((a) => a.universe);
    expect(universes).toContain('aquatic');
  });

  it('fait primer l\'abri sur l\'heure en cas d\'orage', () => {
    const universes = activitiesFor({ ...base, kind: 'thunderstorm', isDay: false })
      .map((a) => a.universe);
    // Même de nuit, un orage doit d'abord envoyer vers un lieu couvert.
    expect(universes).not.toContain('nightclub');
    expect(universes[0]).toBe('cinema');
  });

  it('ne renvoie jamais de doublon', () => {
    const universes = activitiesFor({ ...base, tempC: 34, isDay: false }, 12)
      .map((a) => a.universe);
    expect(new Set(universes).size).toBe(universes.length);
  });
});
