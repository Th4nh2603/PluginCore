#!/usr/bin/env node

import("../dist/src/cli/main.js")
  .then(({ runCli }) => runCli(process.argv.slice(2), { write: console.log }))
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
