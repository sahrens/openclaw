#!/usr/bin/env node
// Simple booking API for the visitor page
// Stores bookings in a JSON file, serves the static page

import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, '..', 'data', 'bookings.json');
const PORT = process.env.VISIT_PORT || 3456;

// Ensure data dir exists
import { mkdirSync } from 'fs';
mkdirSync(dirname(DATA_FILE), { recursive: true });

function loadBookings() {
  if (!existsSync(DATA_FILE)) return [];
  try { return JSON.parse(readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}

function saveBookings(bookings) {
  writeFileSync(DATA_FILE, JSON.stringify(bookings, null, 2));
}

const app = express();
app.use(cors());
app.use(express.json());

// API routes
app.get('/api/bookings', (req, res) => {
  res.json(loadBookings());
});

app.post('/api/bookings', (req, res) => {
  const { room, roomName, start, end, name, email, guests, notes } = req.body;
  if (!room || !start || !end || !name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const booking = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    room, roomName, start, end, name, email, guests, notes,
    created: new Date().toISOString()
  };
  const bookings = loadBookings();
  bookings.push(booking);
  saveBookings(bookings);
  res.status(201).json(booking);
});

app.delete('/api/bookings/:id', (req, res) => {
  const bookings = loadBookings();
  const filtered = bookings.filter(b => b.id !== req.params.id);
  if (filtered.length === bookings.length) {
    return res.status(404).json({ error: 'Not found' });
  }
  saveBookings(filtered);
  res.json({ ok: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Visit API running on port ${PORT}`);
});
