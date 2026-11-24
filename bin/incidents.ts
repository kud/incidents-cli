#!/usr/bin/env node
// React ships a much slower development build unless NODE_ENV is "production".
// This must run before ink/react load, hence the dynamic import.
process.env.NODE_ENV ??= "production"

await import("./main.js")
