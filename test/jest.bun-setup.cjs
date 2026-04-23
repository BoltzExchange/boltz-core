/* eslint-disable @typescript-eslint/no-require-imports, n/no-unsupported-features/node-builtins */

const { webcrypto } = require('node:crypto');
const {
  TextDecoder: UtilTextDecoder,
  TextEncoder: UtilTextEncoder,
} = require('node:util');
const timers = require('node:timers');

global.crypto ??= webcrypto;
global.TextDecoder ??= UtilTextDecoder;
global.TextEncoder ??= UtilTextEncoder;
global.clearImmediate = timers.clearImmediate;
global.clearInterval = timers.clearInterval;
global.clearTimeout = timers.clearTimeout;
global.setImmediate = timers.setImmediate;
global.setInterval = timers.setInterval;
global.setTimeout = timers.setTimeout;
