// Preloaded with --import: pins Date.now() to INCIDENTS_TEST_NOW so that two
// separate processes render the same mock data, even across a minute boundary.
const frozen = Number(process.env.INCIDENTS_TEST_NOW)
if (Number.isFinite(frozen)) Date.now = () => frozen
