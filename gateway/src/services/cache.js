const NodeCache = require('node-cache');

// stdTTL: default TTL in seconds (overridable per-set call)
// checkperiod: how often expired keys are purged
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120, useClones: false });

module.exports = cache;
