import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../../services/correspondence/package.json', import.meta.url));
export const { Pool } = require('pg');
export const express = require('express');
export { hashToken, hashRequest, issueToken, newId } from '../../../../services/correspondence/dist/crypto.js';
export { parsePgSchema, quoteIdent, parsePoolMax } from '../../../../services/correspondence/dist/config.js';
export { ApiError } from '../../../../services/correspondence/dist/errors.js';
