// Resend transactional email. Null until configured (mirrors the playbook pattern).
import { Resend } from "resend";

const key = process.env.RESEND_API_KEY;
export const resend = key && key !== "later" ? new Resend(key) : null;
export const isEmailConfigured = () => resend !== null;
export const FROM = process.env.RESEND_FROM_EMAIL || "SameDayDesk <contact@samedaydesk.com>";
