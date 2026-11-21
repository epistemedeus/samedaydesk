import { HTTPFacilitatorClient } from "@x402/core/http";
import { invokeFacilitator } from "../src/facilitator-io.mjs";

const client = new HTTPFacilitatorClient({ url: process.argv[2] });
const result = await invokeFacilitator(client, "verify", { payload: { x402Version: 2, unsignedFixture: true }, requirements: {} },
  AbortSignal.timeout(3000), { allowLoopback: true });
process.stdout.write(`${JSON.stringify({ isValid: result.isValid })}\n`);
