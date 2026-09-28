#!/usr/bin/env node
import { pathToFileURL } from "node:url";

const postgresLib = process.argv[2];
const clusterJson = process.argv[3];
const row = JSON.parse(process.argv[4]);
const { insertRow } = await import(pathToFileURL(postgresLib).href);
const cluster = JSON.parse(clusterJson);
const result = insertRow(cluster, row);
process.stdout.write(`${JSON.stringify(result)}\n`);
