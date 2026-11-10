# Project instructions

## Tests and fixtures

This is an open-source project. Committed tests must run for any contributor from a fresh clone.

- Never commit tests that need a real Fortnox connection, credentials, tokens or a specific company's data. `npm test` must pass offline.
- Never put real company data in fixtures or test code: no company or supplier/customer names, voucher, invoice or supplier numbers, custom account names, amounts, addresses, org numbers or attachments taken from a real Fortnox account. Keep the field names, types and quirks the Fortnox API really returns, but make up every value.
- Tests that check behaviour against a real Fortnox account are allowed only outside the repo or in a gitignored folder, never committed.
- Before committing, search the staged test files for identifiers from the account you tested against.
