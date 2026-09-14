import type { DashboardWeatherData } from '../../types/DashboardWeather';

/**
 * SMA-336 PR 3b/5, round 1 (V20) — the REAL answer of
 * `GET /api/dashboard/weather?lang=fr` for an account of three gardens on the
 * profile default « Ecully », captured on 2026-09-14 at 20:36 local time and
 * copied here VERBATIM (`weather-response.json`, 7 707 bytes): five days, the
 * 24 hourly slots on the first two days only and `hours: []` on the three
 * others, no alert, `isDay: false` on the current conditions.
 *
 * Beside the synthetic Lyon of `weather.ts`, not instead of it: the synthetic
 * fixture says what the widget SHOULD draw on the artboard's week, this one
 * says what the server ACTUALLY sends — the shape a test of the whole card has
 * to survive. It is data the server produced once, never edited; a value that
 * looks odd here (« 07:18 AM » for a sunrise, a 0.09 mm rainfall) is the
 * provider's own and stays.
 *
 * `weatherRealFixture()` hands out a deep copy so a test can mutate its copy
 * without poisoning the next.
 */
export const ECULLY_RESPONSE: DashboardWeatherData = {
  "locations": [
    {
      "key": "45.77,4.77",
      "name": "Ecully",
      "region": "Rhone-Alpes",
      "country": "France",
      "status": "fresh",
      "fetchedAt": "2026-09-14T18:36:12.7620333Z",
      "timeZone": "Europe/Paris",
      "localTime": "2026-09-14 20:36",
      "current": {
        "tempC": 24.9,
        "feelsLikeC": 23.9,
        "conditionCode": 1000,
        "conditionText": "Dégagé",
        "isDay": false,
        "windKph": 10.4,
        "gustKph": 26.6,
        "humidity": 49,
        "precipMm": 0,
        "uv": 0,
        "lastUpdated": "2026-09-14 20:30"
      },
      "days": [
        {
          "date": "2026-09-14",
          "minTempC": 16.8,
          "maxTempC": 28.1,
          "avgTempC": 22.1,
          "conditionCode": 1000,
          "conditionText": "Ensoleillé",
          "chanceOfRain": 4,
          "chanceOfSnow": 0,
          "totalPrecipMm": 0,
          "maxWindKph": 16.6,
          "sunrise": "07:18 AM",
          "sunset": "07:54 PM",
          "hours": [
            {
              "time": "2026-09-14 00:00",
              "tempC": 19.8,
              "conditionCode": 1003,
              "isDay": false,
              "chanceOfRain": 3,
              "precipMm": 0,
              "windKph": 6.8
            },
            {
              "time": "2026-09-14 01:00",
              "tempC": 19.3,
              "conditionCode": 1003,
              "isDay": false,
              "chanceOfRain": 4,
              "precipMm": 0,
              "windKph": 6.8
            },
            {
              "time": "2026-09-14 02:00",
              "tempC": 18.8,
              "conditionCode": 1009,
              "isDay": false,
              "chanceOfRain": 13,
              "precipMm": 0,
              "windKph": 6.5
            },
            {
              "time": "2026-09-14 03:00",
              "tempC": 18.4,
              "conditionCode": 1009,
              "isDay": false,
              "chanceOfRain": 13,
              "precipMm": 0,
              "windKph": 5.4
            },
            {
              "time": "2026-09-14 04:00",
              "tempC": 18,
              "conditionCode": 1009,
              "isDay": false,
              "chanceOfRain": 14,
              "precipMm": 0,
              "windKph": 5.8
            },
            {
              "time": "2026-09-14 05:00",
              "tempC": 17.7,
              "conditionCode": 1009,
              "isDay": false,
              "chanceOfRain": 15,
              "precipMm": 0,
              "windKph": 5
            },
            {
              "time": "2026-09-14 06:00",
              "tempC": 17.4,
              "conditionCode": 1009,
              "isDay": false,
              "chanceOfRain": 15,
              "precipMm": 0,
              "windKph": 4.7
            },
            {
              "time": "2026-09-14 07:00",
              "tempC": 17,
              "conditionCode": 1006,
              "isDay": false,
              "chanceOfRain": 11,
              "precipMm": 0,
              "windKph": 4.3
            },
            {
              "time": "2026-09-14 08:00",
              "tempC": 16.8,
              "conditionCode": 1003,
              "isDay": true,
              "chanceOfRain": 9,
              "precipMm": 0,
              "windKph": 4.3
            },
            {
              "time": "2026-09-14 09:00",
              "tempC": 17.9,
              "conditionCode": 1003,
              "isDay": true,
              "chanceOfRain": 5,
              "precipMm": 0,
              "windKph": 5.8
            },
            {
              "time": "2026-09-14 10:00",
              "tempC": 19.7,
              "conditionCode": 1003,
              "isDay": true,
              "chanceOfRain": 4,
              "precipMm": 0,
              "windKph": 8.3
            },
            {
              "time": "2026-09-14 11:00",
              "tempC": 22.5,
              "conditionCode": 1000,
              "isDay": true,
              "chanceOfRain": 2,
              "precipMm": 0,
              "windKph": 10.8
            },
            {
              "time": "2026-09-14 12:00",
              "tempC": 24.6,
              "conditionCode": 1000,
              "isDay": true,
              "chanceOfRain": 1,
              "precipMm": 0,
              "windKph": 12.6
            },
            {
              "time": "2026-09-14 13:00",
              "tempC": 26.1,
              "conditionCode": 1000,
              "isDay": true,
              "chanceOfRain": 1,
              "precipMm": 0,
              "windKph": 14.4
            },
            {
              "time": "2026-09-14 14:00",
              "tempC": 27.2,
              "conditionCode": 1000,
              "isDay": true,
              "chanceOfRain": 1,
              "precipMm": 0,
              "windKph": 15.1
            },
            {
              "time": "2026-09-14 15:00",
              "tempC": 27.7,
              "conditionCode": 1000,
              "isDay": true,
              "chanceOfRain": 1,
              "precipMm": 0,
              "windKph": 16.2
            },
            {
              "time": "2026-09-14 16:00",
              "tempC": 28.1,
              "conditionCode": 1000,
              "isDay": true,
              "chanceOfRain": 1,
              "precipMm": 0,
              "windKph": 16.6
            },
            {
              "time": "2026-09-14 17:00",
              "tempC": 28,
              "conditionCode": 1000,
              "isDay": true,
              "chanceOfRain": 1,
              "precipMm": 0,
              "windKph": 16.2
            },
            {
              "time": "2026-09-14 18:00",
              "tempC": 27.4,
              "conditionCode": 1000,
              "isDay": true,
              "chanceOfRain": 1,
              "precipMm": 0,
              "windKph": 16.6
            },
            {
              "time": "2026-09-14 19:00",
              "tempC": 26.1,
              "conditionCode": 1000,
              "isDay": true,
              "chanceOfRain": 1,
              "precipMm": 0,
              "windKph": 14
            },
            {
              "time": "2026-09-14 20:00",
              "tempC": 24.9,
              "conditionCode": 1000,
              "isDay": false,
              "chanceOfRain": 2,
              "precipMm": 0,
              "windKph": 10.4
            },
            {
              "time": "2026-09-14 21:00",
              "tempC": 23.7,
              "conditionCode": 1003,
              "isDay": false,
              "chanceOfRain": 5,
              "precipMm": 0,
              "windKph": 8.3
            },
            {
              "time": "2026-09-14 22:00",
              "tempC": 22.6,
              "conditionCode": 1000,
              "isDay": false,
              "chanceOfRain": 3,
              "precipMm": 0,
              "windKph": 6.8
            },
            {
              "time": "2026-09-14 23:00",
              "tempC": 21.9,
              "conditionCode": 1000,
              "isDay": false,
              "chanceOfRain": 4,
              "precipMm": 0,
              "windKph": 6.1
            }
          ]
        },
        {
          "date": "2026-09-15",
          "minTempC": 18.1,
          "maxTempC": 29.7,
          "avgTempC": 23.5,
          "conditionCode": 1000,
          "conditionText": "Ensoleillé",
          "chanceOfRain": 2,
          "chanceOfSnow": 0,
          "totalPrecipMm": 0,
          "maxWindKph": 10.1,
          "sunrise": "07:19 AM",
          "sunset": "07:52 PM",
          "hours": [
            {
              "time": "2026-09-15 00:00",
              "tempC": 21.3,
              "conditionCode": 1000,
              "isDay": false,
              "chanceOfRain": 4,
              "precipMm": 0,
              "windKph": 6.5
            },
            {
              "time": "2026-09-15 01:00",
              "tempC": 20.8,
              "conditionCode": 1000,
              "isDay": false,
              "chanceOfRain": 5,
              "precipMm": 0,
              "windKph": 6.1
            },
            {
              "time": "2026-09-15 02:00",
              "tempC": 20.4,
              "conditionCode": 1000,
              "isDay": false,
              "chanceOfRain": 5,
              "precipMm": 0,
              "windKph": 4.7
            },
            {
              "time": "2026-09-15 03:00",
              "tempC": 20,
              "conditionCode": 1000,
              "isDay": false,
              "chanceOfRain": 5,
              "precipMm": 0,
              "windKph": 3.2
            },
            {
              "time": "2026-09-15 04:00",
              "tempC": 19.5,
              "conditionCode": 1000,
              "isDay": false,
              "chanceOfRain": 6,
              "precipMm": 0,
              "windKph": 2.9
            },
            {
              "time": "2026-09-15 05:00",
              "tempC": 19,
              "conditionCode": 1000,
              "isDay": false,
              "chanceOfRain": 6,
              "precipMm": 0,
              "windKph": 2.2
            },
            {
              "time": "2026-09-15 06:00",
              "tempC": 18.6,
              "conditionCode": 1000,
              "isDay": false,
              "chanceOfRain": 7,
              "precipMm": 0,
              "windKph": 1.8
            },
            {
              "time": "2026-09-15 07:00",
              "tempC": 18.2,
              "conditionCode": 1000,
              "isDay": false,
              "chanceOfRain": 7,
              "precipMm": 0,
              "windKph": 1.8
            },
            {
              "time": "2026-09-15 08:00",
              "tempC": 18.1,
              "conditionCode": 1000,
              "isDay": true,
              "chanceOfRain": 7,
              "precipMm": 0,
              "windKph": 1.8
            },
            {
              "time": "2026-09-15 09:00",
              "tempC": 19.1,
              "conditionCode": 1000,
              "isDay": true,
              "chanceOfRain": 4,
              "precipMm": 0,
              "windKph": 1.8
            },
            {
              "time": "2026-09-15 10:00",
              "tempC": 21.1,
              "conditionCode": 1000,
              "isDay": true,
              "chanceOfRain": 3,
              "precipMm": 0,
              "windKph": 4.7
            },
            {
              "time": "2026-09-15 11:00",
              "tempC": 23.1,
              "conditionCode": 1000,
              "isDay": true,
              "chanceOfRain": 2,
              "precipMm": 0,
              "windKph": 5.4
            },
            {
              "time": "2026-09-15 12:00",
              "tempC": 25,
              "conditionCode": 1000,
              "isDay": true,
              "chanceOfRain": 1,
              "precipMm": 0,
              "windKph": 5.8
            },
            {
              "time": "2026-09-15 13:00",
              "tempC": 26.6,
              "conditionCode": 1000,
              "isDay": true,
              "chanceOfRain": 1,
              "precipMm": 0,
              "windKph": 6.5
            },
            {
              "time": "2026-09-15 14:00",
              "tempC": 27.9,
              "conditionCode": 1000,
              "isDay": true,
              "chanceOfRain": 1,
              "precipMm": 0,
              "windKph": 6.8
            },
            {
              "time": "2026-09-15 15:00",
              "tempC": 28.9,
              "conditionCode": 1000,
              "isDay": true,
              "chanceOfRain": 1,
              "precipMm": 0,
              "windKph": 7.6
            },
            {
              "time": "2026-09-15 16:00",
              "tempC": 29.6,
              "conditionCode": 1000,
              "isDay": true,
              "chanceOfRain": 1,
              "precipMm": 0,
              "windKph": 9
            },
            {
              "time": "2026-09-15 17:00",
              "tempC": 29.7,
              "conditionCode": 1000,
              "isDay": true,
              "chanceOfRain": 1,
              "precipMm": 0,
              "windKph": 10.1
            },
            {
              "time": "2026-09-15 18:00",
              "tempC": 29.2,
              "conditionCode": 1000,
              "isDay": true,
              "chanceOfRain": 1,
              "precipMm": 0,
              "windKph": 10.1
            },
            {
              "time": "2026-09-15 19:00",
              "tempC": 27.7,
              "conditionCode": 1000,
              "isDay": true,
              "chanceOfRain": 1,
              "precipMm": 0,
              "windKph": 7.6
            },
            {
              "time": "2026-09-15 20:00",
              "tempC": 26.4,
              "conditionCode": 1000,
              "isDay": false,
              "chanceOfRain": 1,
              "precipMm": 0,
              "windKph": 4.3
            },
            {
              "time": "2026-09-15 21:00",
              "tempC": 25.2,
              "conditionCode": 1000,
              "isDay": false,
              "chanceOfRain": 1,
              "precipMm": 0,
              "windKph": 2.9
            },
            {
              "time": "2026-09-15 22:00",
              "tempC": 24.4,
              "conditionCode": 1000,
              "isDay": false,
              "chanceOfRain": 1,
              "precipMm": 0,
              "windKph": 0.7
            },
            {
              "time": "2026-09-15 23:00",
              "tempC": 23.7,
              "conditionCode": 1000,
              "isDay": false,
              "chanceOfRain": 1,
              "precipMm": 0,
              "windKph": 4.3
            }
          ]
        },
        {
          "date": "2026-09-16",
          "minTempC": 16.4,
          "maxTempC": 22.8,
          "avgTempC": 19.6,
          "conditionCode": 1000,
          "conditionText": "Ensoleillé",
          "chanceOfRain": 17,
          "chanceOfSnow": 0,
          "totalPrecipMm": 0.09,
          "maxWindKph": 15.1,
          "sunrise": "07:20 AM",
          "sunset": "07:50 PM",
          "hours": []
        },
        {
          "date": "2026-09-17",
          "minTempC": 13.3,
          "maxTempC": 22.3,
          "avgTempC": 17.5,
          "conditionCode": 1009,
          "conditionText": "Couvert",
          "chanceOfRain": 4,
          "chanceOfSnow": 0,
          "totalPrecipMm": 0,
          "maxWindKph": 16.6,
          "sunrise": "07:21 AM",
          "sunset": "07:49 PM",
          "hours": []
        },
        {
          "date": "2026-09-18",
          "minTempC": 12.7,
          "maxTempC": 21.7,
          "avgTempC": 16.4,
          "conditionCode": 1009,
          "conditionText": "Couvert",
          "chanceOfRain": 7,
          "chanceOfSnow": 0,
          "totalPrecipMm": 0,
          "maxWindKph": 16.2,
          "sunrise": "07:23 AM",
          "sunset": "07:47 PM",
          "hours": []
        }
      ],
      "alerts": []
    }
  ],
  "gardens": [
    {
      "gardenId": "df4cf302-6c81-4919-8940-0c73d82f829f",
      "locationKey": "45.77,4.77",
      "source": "profile"
    },
    {
      "gardenId": "5b34073b-d0ad-4f62-9186-f8bdeda9d69e",
      "locationKey": "45.77,4.77",
      "source": "profile"
    },
    {
      "gardenId": "cb1aa657-a5d9-40cd-b6ba-afa93a99ccab",
      "locationKey": "45.77,4.77",
      "source": "profile"
    }
  ],
  "profileLocated": true
};

/** The three garden ids the real response links — in its order. */
export const ECULLY_GARDEN_IDS: readonly string[] = ["df4cf302-6c81-4919-8940-0c73d82f829f", "5b34073b-d0ad-4f62-9186-f8bdeda9d69e", "cb1aa657-a5d9-40cd-b6ba-afa93a99ccab"];

export const weatherRealFixture = (): DashboardWeatherData =>
  JSON.parse(JSON.stringify(ECULLY_RESPONSE)) as DashboardWeatherData;
