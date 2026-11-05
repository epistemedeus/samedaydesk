import { appendFileSync } from "node:fs";
appendFileSync("/agent/repos/samedaydesk/experiments/n5-r05-two-needs/evidence/producer-calls.txt", "x");
throw new Error("producer must not run");
