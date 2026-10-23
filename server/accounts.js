// Which account a request belongs to. The auth middleware sets it; db.js reads it to pick that account's own database file,
// so one landlord's data can never be reached while serving another's request.
import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage();
export const LOCAL_ACCOUNT = 'local';
export const runAs = (accountId, fn) => als.run({ accountId }, fn);
export const currentAccount = () => als.getStore()?.accountId || LOCAL_ACCOUNT;
