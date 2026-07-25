/* istanbul ignore file */

export interface Aircraft {
  model: string;
  speed: number;
  passengerCapacity: {
    total: number;
    main: number;
    first: number;
  };
}

export interface Airport {
  code: string; // Airport code, typically 3 characters
  city: string; // Airport city name
  timezone: string; // IANA timezone string
  location: Location;
}

export interface Location {
  latitude: number;
  longitude: number;
}

export interface FlightDuration {
  hours: number;
  minutes: number;
  locale: string;
}

export interface FlightLeg {
  flightNumber: string;
  aircraft: Aircraft;
  origin: Airport;
  destination: Airport;
  distance: number;
  duration: FlightDuration;
  departureTime: string;
  arrivalTime: string;
}

export interface Price {
  amount: number;
  currency: string;
}

export interface Flight extends FlightLeg {
  // Each flight is composed of one or more legs.
  // A direct flight has exactly one leg (legs.length === 1, isDirect === true).
  // A connecting flight has more than one leg (legs.length > 1, isDirect === false).
  legs: FlightLeg[];
  price: Price;
  isDirect: boolean;
}

export interface FlightQueryParams {
  date: string;
  origin?: string;
  destination?: string;
}
