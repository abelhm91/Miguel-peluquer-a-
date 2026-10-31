-- Citas para varias personas seguidas: quién va, con qué servicio y a qué hora (JSON).
ALTER TABLE bookings ADD COLUMN party TEXT NOT NULL DEFAULT '';
