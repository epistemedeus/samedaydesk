import { PINS } from "./pins.mjs";

export const LATER_CONSUMER = PINS.laterConsumer;

export const PENDING_JOINS = Object.freeze(PINS.pendingJoins.map((row) => Object.freeze({
  id: row.id,
  waitsOn: row.waitsOn,
  pin: row.pin,
  laterConsumer: row.laterConsumer,
})));
