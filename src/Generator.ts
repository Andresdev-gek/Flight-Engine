import seedrandom from 'seedrandom';
import haversine from 'haversine-distance';
import { DateTime } from 'luxon';
import { aircraft } from './data/aircraft';
import { airports } from './data/airports';
import { Airport, Flight, FlightDuration, FlightLeg, Location, Price } from './types';

const createRandomGenerator = (seed: string): ((min: number, max: number) => number) => {
  // Create a method which returns a random number between 'min' and 'max'
  const random = seedrandom(seed);
  return (min: number, max: number): number => {
    const r = random();
    return Math.floor(r * (max - min + 1) + min);
  };
};

// Convert meters to miles
const metersToMiles = (num: number): number => num / 1609.344;

// Determine miles value for distance between two locations (lat/lon)
const calcDistance = (a: Location, b: Location): number => Math.round(metersToMiles(haversine(a, b)));

// Price constants
const PRICE_BASE = 49;
const PRICE_PER_MILE = 0.09;
const DIRECT_PREMIUM = 1.1; // direct flights cost a bit more per mile
const LAYOVER_DISCOUNT = 0.85; // layovers are cheaper per total distance
const MIN_LAYOVER_WAIT_MINUTES = 30;
const MAX_LAYOVER_WAIT_MINUTES = 120;

export class Generator {
  random: (min: number, max: number) => number;

  constructor(seed: string) {
    // Generate the random method with the given seed
    // Calls to this method will return a random value, however,
    // generating a new this.random with the same seed will
    // yield the same results for the nth and n+1th calls
    // (i.e., results from f(x) = 5, 7, 4, 1 and results from
    // g(x) using the same seed = 5, 7, 4, 1
    this.random = createRandomGenerator(seed);
  }

  // Determine the number of flights for a given route for a specific day
  numFlightsForRoute(): number {
    // Use those values to create a hash and use that value as the seed
    // to create a new random method to be used for numFlights
    return this.random(5, 15);
  }

  // Base price (in USD) for a single leg given its distance in miles.
  static legPrice(distance: number): number {
    return PRICE_BASE + distance * PRICE_PER_MILE;
  }

  // Builds a FlightDuration object from a fractional hours value.
  private static buildDuration(hoursFloat: number): FlightDuration {
    const minutes = Math.floor(60 * (hoursFloat - Math.floor(hoursFloat)));
    const hours = Math.floor(hoursFloat);
    return { hours, minutes, locale: `${hours}h ${minutes}m` };
  }

  // Generate a single flight segment (leg) for the given origin and destination.
  // A leg has no nested legs/price/isDirect information; it is a pure direct segment.
  leg(origin: Airport, destination: Airport, departureTime: DateTime): FlightLeg {
    // Generate a random flight number
    const flightNumber: string = this.random(1, 9999).toFixed(0).padStart(4, '0');

    // Calculate distance of route based on lat/lon
    const distance = calcDistance(origin.location, destination.location);

    // Assign random aircraft
    const randAircraft = aircraft[this.random(0, aircraft.length - 1)];

    // Determine flight duration based on distance and aircraft speed
    const hoursFloat = (distance / randAircraft.speed) * (this.random(1000, 1100) / 1000);
    const duration = Generator.buildDuration(hoursFloat);

    const arrivalTime = departureTime.plus({ hours: duration.hours, minutes: duration.minutes }).setZone(destination.timezone);

    return {
      flightNumber,
      origin,
      destination,
      distance,
      duration,
      departureTime: departureTime.toISO(),
      arrivalTime: arrivalTime.toISO(),
      aircraft: randAircraft,
    };
  }

  // Randomly generate a direct flight for the given origin and destination.
  flight(origin: Airport, destination: Airport, departureTime: DateTime): Flight {
    const leg = this.leg(origin, destination, departureTime);
    const price: Price = {
      amount: Math.round(Generator.legPrice(leg.distance) * DIRECT_PREMIUM * 100) / 100,
      currency: 'USD',
    };

    return {
      ...leg,
      legs: [leg],
      price,
      isDirect: true,
    };
  }

  // Pick a random airport from the dataset, excluding any of the provided codes.
  private pickAirport(excludeCodes: string[]): Airport {
    const available = airports.filter((airport) => !excludeCodes.includes(airport.code));
    // Fallback to the full list if every airport was excluded (extremely unlikely with 25 entries)
    /* istanbul ignore next: defensive fallback unreachable with the current dataset */
    const pool = available.length > 0 ? available : airports;
    return pool[this.random(0, pool.length - 1)];
  }

  // Generate a connecting flight with `numLayovers` intermediate stops between origin and destination.
  layoverFlight(origin: Airport, destination: Airport, departureTime: DateTime, numLayovers: number): Flight {
    // Build the list of stops: origin -> layover(s) -> destination
    const stops: Airport[] = [origin];
    const usedCodes: string[] = [origin.code, destination.code];

    for (let i = 0; i < numLayovers; i += 1) {
      const stop = this.pickAirport(usedCodes);
      stops.push(stop);
      usedCodes.push(stop.code);
    }
    stops.push(destination);

    const legs: FlightLeg[] = [];
    let currentTime = departureTime;
    let totalWaitMinutes = 0;

    for (let i = 0; i < stops.length - 1; i += 1) {
      const legOrigin = stops[i];
      const legDestination = stops[i + 1];
      legs.push(this.leg(legOrigin, legDestination, currentTime));

      const lastLeg = legs[legs.length - 1];

      // If there's another leg after this one, schedule a layover wait at the intermediate airport.
      if (i < stops.length - 2) {
        const waitMinutes = this.random(MIN_LAYOVER_WAIT_MINUTES, MAX_LAYOVER_WAIT_MINUTES);
        totalWaitMinutes += waitMinutes;
        currentTime = DateTime.fromISO(lastLeg.arrivalTime, { setZone: true }).setZone(legDestination.timezone).plus({ minutes: waitMinutes });
      }
    }

    const firstLeg = legs[0];
    const lastLeg = legs[legs.length - 1];

    // Overall distance is the sum of all leg distances
    const totalDistance = legs.reduce((sum, leg) => sum + leg.distance, 0);

    // Overall duration is the sum of each leg's flight time plus the layover waits between legs
    const totalFlightMinutes = legs.reduce((sum, leg) => sum + (leg.duration.hours * 60 + leg.duration.minutes), 0);
    const totalDurationMinutes = totalFlightMinutes + totalWaitMinutes;
    const totalHoursFloat = totalDurationMinutes / 60;
    const duration = Generator.buildDuration(totalHoursFloat);

    // Overall price: sum of each leg's base price, then apply the layover discount
    const legsBasePrice = legs.reduce((sum, leg) => sum + Generator.legPrice(leg.distance), 0);
    const price: Price = {
      amount: Math.round(legsBasePrice * LAYOVER_DISCOUNT * 100) / 100,
      currency: 'USD',
    };

    return {
      // The journey's flight number is taken from the first leg
      flightNumber: firstLeg.flightNumber,
      // The journey's aircraft is taken from the first leg (each leg may differ)
      aircraft: firstLeg.aircraft,
      origin,
      destination,
      distance: totalDistance,
      duration,
      departureTime: firstLeg.departureTime,
      arrivalTime: lastLeg.arrivalTime,
      legs,
      price,
      isDirect: false,
    };
  }
}