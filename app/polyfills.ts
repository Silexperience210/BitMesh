/**
 * Polyfills pour React Native
 * Ces modules Node.js n'existent pas dans RN mais sont utilisés par certaines libs
 */

// Buffer
import { Buffer } from 'buffer';
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

// process
if (typeof global.process === 'undefined') {
  global.process = require('process');
}

// crypto.getRandomValues polyfill
if (typeof global.crypto === 'undefined') {
  global.crypto = require('expo-crypto');
}

// URL polyfill
if (typeof global.URL === 'undefined') {
  global.URL = require('whatwg-url').URL;
}

export {};
