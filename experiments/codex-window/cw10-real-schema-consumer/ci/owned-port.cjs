// Consumer test environment only: the immutable release's archive download
// test requests port 0. Reserve the operator-assigned local port instead.
// Assertions, bytes, extraction and application behavior remain unchanged.
const net = require('node:net');
const original = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  if (args[0] === 0) {
    if (args[1] !== '127.0.0.1') throw new Error('CW10 requires a loopback listener');
    args[0] = 55547;
    process.stdout.write('# CW10 archive listener: 127.0.0.1:55547\n');
  }
  return original.apply(this, args);
};
