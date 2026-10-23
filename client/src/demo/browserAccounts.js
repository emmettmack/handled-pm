// Browser stand-in for server/accounts.js: the static demo has a single in-memory account.
export const LOCAL_ACCOUNT = 'local';
export const runAs = (_id, fn) => fn();
export const currentAccount = () => LOCAL_ACCOUNT;
