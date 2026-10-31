-- Precio total de la cita en euros en el momento de reservar ('' si algún servicio no tenía precio).
ALTER TABLE bookings ADD COLUMN price TEXT NOT NULL DEFAULT '';
