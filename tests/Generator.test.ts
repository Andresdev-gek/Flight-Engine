import 'jest';
import { DateTime } from 'luxon';
import { Generator } from '../src/Generator';
import { airports } from '../src/data/airports';

describe('Random seed generator ', () => {
  it('random method returns same values over time using the same seed', () => {
    const seed = '123';

    const generator1 = new Generator(seed);
    const values1 = new Array(10).fill(null).map(() => generator1.random(0, 100));

    const generator2 = new Generator(seed);
    const values2 = new Array(10).fill(null).map(() => generator2.random(0, 100));

    expect(values1).toEqual(values2);
  });

  it('random method returns diff values over time using unique seed', () => {
    const seed1 = '123';
    const generator1 = new Generator(seed1);
    const values1 = new Array(10).fill(null).map(() => generator1.random(0, 100));

    const seed2 = '456';
    const generator2 = new Generator(seed2);
    const values2 = new Array(10).fill(null).map(() => generator2.random(0, 100));

    expect(values1).not.toEqual(values2);
  });

  it('flights generated for a given route will always be the same ', () => {
    const seed = '2020-01-01';
    const origin = airports[0];
    const destination = airports[1];
    const departureTime = DateTime.utc();

    const generator1 = new Generator(seed);
    const values1 = new Array(10).fill(null).map(() => generator1.flight(origin, destination, departureTime));

    const generator2 = new Generator(seed);
    const values2 = new Array(10).fill(null).map(() => generator2.flight(origin, destination, departureTime));

    expect(values1).toEqual(values2);
  });

  it('the number of flights generated for on a given day will always be the same ', () => {
    const seed = 'DFW-JFK';

    const generator1 = new Generator(seed);
    const values1 = new Array(10).fill(null).map(() => generator1.numFlightsForRoute());

    const generator2 = new Generator(seed);
    const values2 = new Array(10).fill(null).map(() => generator2.numFlightsForRoute());

    expect(values1).toEqual(values2);
  });

  it('direct flights expose legs, price and isDirect=true', () => {
    const seed = '2020-01-01';
    const origin = airports[0];
    const destination = airports[1];
    const departureTime = DateTime.utc();

    const gen = new Generator(seed);
    const flight = gen.flight(origin, destination, departureTime);

    expect(flight.isDirect).toBe(true);
    expect(flight.legs).toHaveLength(1);
    expect(flight.legs[0].flightNumber).toBe(flight.flightNumber);
    expect(flight.price).toBeDefined();
    expect(flight.price.currency).toBe('USD');
    expect(typeof flight.price.amount).toBe('number');
    expect(flight.price.amount).toBeGreaterThan(0);
  });

  it('layover flights are deterministic for the same seed', () => {
    const seed = '2020-01-01';
    const origin = airports[0];
    const destination = airports[1];
    const departureTime = DateTime.utc();

    const gen1 = new Generator(seed);
    const flight1 = gen1.layoverFlight(origin, destination, departureTime, 1);

    const gen2 = new Generator(seed);
    const flight2 = gen2.layoverFlight(origin, destination, departureTime, 1);

    expect(flight1).toEqual(flight2);
  });

  it('layover flights have more than one leg and isDirect=false', () => {
    const seed = '2020-01-01';
    const origin = airports[0];
    const destination = airports[1];
    const departureTime = DateTime.utc();

    const gen = new Generator(seed);
    const flight = gen.layoverFlight(origin, destination, departureTime, 1);

    expect(flight.isDirect).toBe(false);
    expect(flight.legs.length).toBe(2);

    // Top-level origin/destination reflect the overall journey
    expect(flight.origin.code).toBe(origin.code);
    expect(flight.destination.code).toBe(destination.code);

    // The legs should chain together: each leg's destination is the next leg's origin
    expect(flight.legs[0].destination.code).toBe(flight.legs[1].origin.code);

    // The layover airport must differ from both origin and destination
    const layoverCode = flight.legs[0].destination.code;
    expect(layoverCode).not.toBe(origin.code);
    expect(layoverCode).not.toBe(destination.code);
  });

  it('layover flights with 2 layovers have 3 legs', () => {
    const seed = '2020-01-01';
    const origin = airports[0];
    const destination = airports[1];
    const departureTime = DateTime.utc();

    const gen = new Generator(seed);
    const flight = gen.layoverFlight(origin, destination, departureTime, 2);

    expect(flight.isDirect).toBe(false);
    expect(flight.legs.length).toBe(3);
    // No leg origin/destination should repeat an airport code
    const codes = [flight.legs[0].origin.code, ...flight.legs.map((leg) => leg.destination.code)];
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('layover total distance is the sum of leg distances', () => {
    const seed = '2020-01-01';
    const origin = airports[0];
    const destination = airports[1];
    const departureTime = DateTime.utc();

    const gen = new Generator(seed);
    const flight = gen.layoverFlight(origin, destination, departureTime, 1);

    const sumLegDistances = flight.legs.reduce((sum, leg) => sum + leg.distance, 0);
    expect(flight.distance).toBe(sumLegDistances);
  });

  it('layover arrival time is after the first leg departure time', () => {
    const seed = '2020-01-01';
    const origin = airports[0];
    const destination = airports[1];
    const departureTime = DateTime.utc();

    const gen = new Generator(seed);
    const flight = gen.layoverFlight(origin, destination, departureTime, 1);

    const dep = DateTime.fromISO(flight.departureTime, { setZone: true });
    const arr = DateTime.fromISO(flight.arrivalTime, { setZone: true });
    expect(arr.toMillis()).toBeGreaterThan(dep.toMillis());
  });

  it('layover flight price applies a discount over the sum of its legs base prices', () => {
    const seed = '2020-01-01';
    const origin = airports[0];
    const destination = airports[1];
    const departureTime = DateTime.utc();

    const gen = new Generator(seed);
    const layoverFlight = gen.layoverFlight(origin, destination, departureTime, 1);

    // Sum of the per-leg base prices (no premium, no discount)
    const legsBasePrice = layoverFlight.legs.reduce((sum, leg) => sum + Generator.legPrice(leg.distance), 0);
    // The layover price should be lower than that sum because of the layover discount.
    expect(layoverFlight.price.amount).toBeLessThan(Math.round(legsBasePrice * 100) / 100);
    expect(layoverFlight.price.currency).toBe('USD');
  });

  it('the first leg of a layover flight has the same departure time as the overall flight', () => {
    const seed = '2020-01-01';
    const origin = airports[0];
    const destination = airports[1];
    const departureTime = DateTime.utc();

    const gen = new Generator(seed);
    const flight = gen.layoverFlight(origin, destination, departureTime, 1);

    expect(flight.departureTime).toBe(flight.legs[0].departureTime);
  });

  it('the last leg of a layover flight has the same arrival time as the overall flight', () => {
    const seed = '2020-01-01';
    const origin = airports[0];
    const destination = airports[1];
    const departureTime = DateTime.utc();

    const gen = new Generator(seed);
    const flight = gen.layoverFlight(origin, destination, departureTime, 1);

    expect(flight.arrivalTime).toBe(flight.legs[flight.legs.length - 1].arrivalTime);
  });
});
