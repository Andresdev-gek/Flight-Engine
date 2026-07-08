import { Router } from 'express';
import { randomUUID } from 'crypto';
import { DateTime } from 'luxon';
import { generateFlightsByDate } from '../services/generateFlightsByDate';
import { Flight } from '../types';

export const bookings = Router();

// Almacén en memoria. Se reinicia cada vez que el servidor se reinicia/duerme
// (suficiente para un proyecto de práctica; no usar en producción real).
const bookingsStore = new Map<string, Booking>();

interface Passenger {
  firstName: string;
  lastName: string;
  email: string;
}

interface Booking {
  bookingId: string;
  status: 'confirmed';
  flight: Flight;
  passenger: Passenger;
  price: {
    amount: number;
    currency: string;
  };
  createdAt: string;
}

function calculateFakePrice(flight: Flight): number {
  const base = 49;
  const perMile = 0.09;
  return Math.round((base + flight.distance * perMile) * 100) / 100;
}

// POST /bookings
// body: { date: "YYYY-MM-DD", flightNumber: "0978", passenger: { firstName, lastName, email } }
bookings.post('/', (req, res) => {
  const { date, flightNumber, passenger } = req.body ?? {};

  if (!date || typeof date !== 'string') {
    res.status(400).send("'date' is required and must use the format YYYY-MM-DD");
    return;
  }

  if (!flightNumber || typeof flightNumber !== 'string') {
    res.status(400).send("'flightNumber' is required");
    return;
  }

  if (!passenger || typeof passenger !== 'object' || !passenger.firstName || !passenger.lastName || !passenger.email) {
    res.status(400).send("'passenger' is required and must include firstName, lastName and email");
    return;
  }

  const isoDate = DateTime.fromISO(date, { zone: 'utc' });
  if (!isoDate.isValid) {
    res.status(400).send(`'date' value (${date}) is malformed; must use format YYYY-MM-DD`);
    return;
  }

  const matchingFlights = generateFlightsByDate(isoDate).filter(
    (flight: Flight) => flight.flightNumber === flightNumber,
  );

  const flight = matchingFlights[0];

  if (!flight) {
    res.status(404).send(`No flight found with number '${flightNumber}' on '${date}'`);
    return;
  }

  const booking: Booking = {
    bookingId: randomUUID(),
    status: 'confirmed',
    flight,
    passenger: {
      firstName: passenger.firstName,
      lastName: passenger.lastName,
      email: passenger.email,
    },
    price: {
      amount: calculateFakePrice(flight),
      currency: 'USD',
    },
    createdAt: DateTime.utc().toISO(),
  };

  bookingsStore.set(booking.bookingId, booking);

  res.status(201).json(booking);
});

// GET /bookings/:bookingId
bookings.get('/:bookingId', (req, res) => {
  const { bookingId } = req.params;
  const booking = bookingsStore.get(bookingId);

  if (!booking) {
    res.status(404).send('Booking not found');
    return;
  }

  res.json(booking);
});