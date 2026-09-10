import { Server } from "node:http";
const original = Server.prototype.listen;
Server.prototype.listen = function (...args) {
  this.once("listening", () => process.send?.({ port: this.address().port }));
  return original.apply(this, args);
};
