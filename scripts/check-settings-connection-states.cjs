// SQL Provider API and local MCP state checks; no real server or credentials.
require('./helpers/check-settings-connection-states-main.cjs')(require('./check-settings-companies.cjs'))
  .catch(error => { console.error(error); process.exitCode = 1 })
