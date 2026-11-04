/**
 * Lector mínimo de las previsiones (TripUpdates) del GTFS-RT de la EMT para la
 * recogida de retrasos (ADR 0024). Solo lee los campos que hacen falta; así el
 * script de datos no necesita una librería de protobuf (como `GtfsRtReader` en
 * Android). Campos según gtfs-realtime.proto.
 */

/** Previsión de un viaje: llegada prevista a cada parada que le queda. */
export interface FeedTrip {
  readonly tripId: string;
  /** AAAAMMDD y HH:MM:SS (puede pasar de 24 h) de la salida programada. */
  readonly startDate: string;
  readonly startTime: string;
  readonly vehicleId: string;
  readonly stops: readonly FeedStop[];
}

export interface FeedStop {
  readonly sequence: number;
  /** Segundos Unix de la llegada prevista (o de la salida si no trae llegada). */
  readonly time: number | null;
  readonly skipped: boolean;
}

/** `schedule_relationship` de una parada suprimida. */
const SKIPPED = 1;

/** Tipos de campo del formato protobuf. */
const Wire = { Varint: 0, Fixed64: 1, Bytes: 2, Fixed32: 5 } as const;

class Reader {
  private readonly bytes: Uint8Array;
  private readonly end: number;
  private pos: number;

  constructor(bytes: Uint8Array, start = 0, end = bytes.length) {
    this.bytes = bytes;
    this.pos = start;
    this.end = end;
  }

  get done(): boolean {
    return this.pos >= this.end;
  }

  /** Entero sin signo; los de 64 bits del feed (horas Unix) caben en un número. */
  varint(): number {
    let value = 0;
    let factor = 1;
    for (;;) {
      if (this.pos >= this.end) throw new Error('GTFS-RT: mensaje cortado');
      const byte = this.bytes[this.pos++]!;
      value += (byte & 0x7f) * factor;
      if (byte < 0x80) return value;
      factor *= 128;
    }
  }

  /** Clave de un campo: número y tipo. */
  tag(): { field: number; wire: number } {
    const key = this.varint();
    return { field: Math.floor(key / 8), wire: key % 8 };
  }

  /** Submensaje (o texto) de longitud prefijada. */
  sub(): Reader {
    const length = this.varint();
    const start = this.pos;
    this.pos += length;
    if (this.pos > this.end) throw new Error('GTFS-RT: mensaje cortado');
    return new Reader(this.bytes, start, this.pos);
  }

  text(): string {
    const sub = this.sub();
    return new TextDecoder().decode(this.bytes.subarray(sub.pos, sub.end));
  }

  skip(wire: number): void {
    if (wire === Wire.Varint) this.varint();
    else if (wire === Wire.Fixed64) this.pos += 8;
    else if (wire === Wire.Bytes) this.sub();
    else if (wire === Wire.Fixed32) this.pos += 4;
    else throw new Error(`GTFS-RT: tipo de campo ${wire} no válido`);
  }
}

/** Recorre los campos de un mensaje; `read` devuelve false si no usa el campo. */
function fields(reader: Reader, read: (field: number, wire: number) => boolean): void {
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (!read(field, wire)) reader.skip(wire);
  }
}

/** Lee un FeedMessage; descarta los viajes sin identificador, salida o autobús. */
export function decodeTripUpdates(bytes: Uint8Array): FeedTrip[] {
  const trips: FeedTrip[] = [];
  const feed = new Reader(bytes);
  fields(feed, (field, wire) => {
    if (field !== 2 || wire !== Wire.Bytes) return false;
    // FeedEntity: trip_update = 3.
    const entity = feed.sub();
    fields(entity, (f, w) => {
      if (f !== 3 || w !== Wire.Bytes) return false;
      const trip = tripUpdate(entity.sub());
      if (trip) trips.push(trip);
      return true;
    });
    return true;
  });
  return trips;
}

/** TripUpdate: trip = 1, stop_time_update = 2, vehicle = 3. */
function tripUpdate(reader: Reader): FeedTrip | null {
  let tripId = '';
  let startTime = '';
  let startDate = '';
  let vehicleId = '';
  const stops: FeedStop[] = [];
  fields(reader, (field, wire) => {
    if (wire !== Wire.Bytes) return false;
    if (field === 1) {
      // TripDescriptor: trip_id = 1, start_time = 2, start_date = 3.
      const trip = reader.sub();
      fields(trip, (f, w) => {
        if (w !== Wire.Bytes) return false;
        if (f === 1) tripId = trip.text();
        else if (f === 2) startTime = trip.text();
        else if (f === 3) startDate = trip.text();
        else return false;
        return true;
      });
    } else if (field === 2) {
      const stop = stopTimeUpdate(reader.sub());
      if (stop) stops.push(stop);
    } else if (field === 3) {
      // VehicleDescriptor: id = 1.
      const vehicle = reader.sub();
      fields(vehicle, (f, w) => {
        if (f !== 1 || w !== Wire.Bytes) return false;
        vehicleId = vehicle.text();
        return true;
      });
    } else return false;
    return true;
  });
  if (!tripId || !startTime || !startDate || !vehicleId) return null;
  return { tripId, startDate, startTime, vehicleId, stops };
}

/** StopTimeUpdate: stop_sequence = 1, arrival = 2, departure = 3, schedule_relationship = 5. */
function stopTimeUpdate(reader: Reader): FeedStop | null {
  let sequence: number | null = null;
  let arrival: number | null = null;
  let departure: number | null = null;
  let skipped = false;
  fields(reader, (field, wire) => {
    if (field === 1 && wire === Wire.Varint) sequence = reader.varint();
    else if (field === 5 && wire === Wire.Varint) skipped = reader.varint() === SKIPPED;
    else if ((field === 2 || field === 3) && wire === Wire.Bytes) {
      const time = eventTime(reader.sub());
      if (field === 2) arrival = time;
      else departure = time;
    } else return false;
    return true;
  });
  if (sequence === null) return null;
  return { sequence, time: arrival ?? departure, skipped };
}

/** StopTimeEvent: time = 2 (segundos Unix). */
function eventTime(reader: Reader): number | null {
  let time: number | null = null;
  fields(reader, (field, wire) => {
    if (field !== 2 || wire !== Wire.Varint) return false;
    time = reader.varint();
    return true;
  });
  return time !== null && time > 0 ? time : null;
}
