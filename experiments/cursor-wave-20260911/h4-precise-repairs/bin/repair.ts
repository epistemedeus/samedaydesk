#!/usr/bin/env node
import { main } from "../src/corpus.ts";

process.exit(main(process.argv.slice(2)));
