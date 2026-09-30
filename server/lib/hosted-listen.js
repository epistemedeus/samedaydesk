// Bind IPv4 0.0.0.0. Read server.address() only in the listening callback.
// A later family-4 ECONNREFUSED to 127.0.0.1 is a missed accept or a dead child.

export function isIpv4TcpAddress(address) {
  return Boolean(
    address
    && typeof address === "object"
    && address.family === "IPv4"
    && Number.isInteger(address.port)
    && address.port > 0,
  );
}

export function listenHosted(app, port, onBound) {
  const server = app.listen(port, "0.0.0.0", () => {
    const bound = server.address();
    if (!isIpv4TcpAddress(bound)) {
      console.error("sds_listen_address_missing");
      return;
    }
    onBound(bound);
  });
  return server;
}
