const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data', 'sessions.json');
const SEED = path.join(__dirname, '..', 'data', 'seed.json');

function reset() {
  const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
  fs.writeFileSync(DATA, JSON.stringify(seed, null, 2));
  return seed;
}

function get() {
  if (!fs.existsSync(DATA)) return reset();
  return JSON.parse(fs.readFileSync(DATA, 'utf8'));
}

function save(data) {
  fs.writeFileSync(DATA, JSON.stringify(data, null, 2));
  return data;
}

module.exports = { get, reset, save };
