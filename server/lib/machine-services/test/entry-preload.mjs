import http from 'node:http';
const listen = http.Server.prototype.listen;
http.Server.prototype.listen = function (...args) {
  this.once('listening', () => process.send?.({ port: this.address().port }));
  return listen.apply(this, args);
};
