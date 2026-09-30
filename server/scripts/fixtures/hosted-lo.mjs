import { spawnSync } from "node:child_process";

// Imported only inside a fresh netns. "down" leaves the namespace's lo untouched.
// "up" sets IFF_UP so a family-4 connect to 127.0.0.1 can succeed in that netns.
if (process.env.HOSTED_LO === "up") {
  const script = [
    "import fcntl, struct, socket, sys",
    "s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)",
    "buf = struct.pack('16sH14s', b'lo', 0, b'')",
    "current = struct.unpack('16sH14s', fcntl.ioctl(s.fileno(), 0x8913, buf))[1]",
    "fcntl.ioctl(s.fileno(), 0x8914, struct.pack('16sH14s', b'lo', current | 1, b''))",
  ].join("\n");
  const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write((result.stderr || "loopback up failed") + "\n");
    process.exit(2);
  }
}
