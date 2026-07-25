import { DateTime } from 'luxon';
import { airports } from '../data/airports';
import { flightCache } from '../FlightCache';
import { Generator } from '../Generator';
import { Flight } from '../types';

// Probability buckets (in percent) used to decide whether a flight on a route
// is direct, has a single layover, or has two layovers. Values are inclusive
// thresholds drawn from this.random(0, 100).
const DIRECT_THRESHOLD = 70; // 0..70  -> direct
const ONE_LAYOVER_THRESHOLD = 90; // 71..90 -> 1 layover
// 91..100 -> 2 layovers

export function generateFlightsByDate(date: DateTime): Flight[] {
  const seed = date.toISODate();
  const gen = new Generator(seed);
  let generatedFlights: Flight[] = [];

  // Test cache for data
  const cachedFlights = flightCache.getFlights(seed);
  if (!cachedFlights) {
    for (let i = 0; i < airports.length; i += 1) {
      // Iterate over all airports
      for (let j = airports.length - 1; j >= 0; j -= 1) {
        if (i !== j) {
          const origin = airports[i];
          const destination = airports[j];

          // For each O&D pair, create flights based on # per day
          const numFlights = gen.numFlightsForRoute();

          // 1am - 11pm (22 hours)
          const flightTimeOffset = 22 / numFlights;

          let time = date.startOf('day').plus({ hours: 1 }).setZone(origin.timezone, { keepLocalTime: true });

          for (let k = 0; k <= numFlights; k += 1) {
            time = time.plus({ hours: flightTimeOffset, minutes: gen.random(-20, 20) });

            // Decide whether this slot is direct or a connecting flight.
            // The decision is part of the seeded random sequence, so the
            // output stays fully deterministic for a given date.
            const flightTypeRoll = gen.random(0, 100);

            let flight: Flight;
            if (flightTypeRoll <= DIRECT_THRESHOLD) {
              flight = gen.flight(origin, destination, time);
            } else if (flightTypeRoll <= ONE_LAYOVER_THRESHOLD) {
              flight = gen.layoverFlight(origin, destination, time, 1);
            } else {
              flight = gen.layoverFlight(origin, destination, time, 2);
            }

            generatedFlights.push(flight);
          }
        }
      }
    }
    // Cache flight data that was resulted in a cache miss
    flightCache.cacheFlights(seed, generatedFlights);
  } else {
    generatedFlights = cachedFlights;
  }

  return generatedFlights;
}