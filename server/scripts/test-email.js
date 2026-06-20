// Dev utility: send a welcome email to verify Resend wiring.
// Run: node --env-file=.env server/scripts/test-email.js [recipient]
// In Resend test mode (onboarding@resend.dev) the recipient must be the account owner.
import { sendWelcome } from "../lib/notify.js";

const to = process.argv[2] || process.env.ADMIN_EMAIL;
const result = await sendWelcome({ to });
console.log("sendWelcome →", JSON.stringify(result));
