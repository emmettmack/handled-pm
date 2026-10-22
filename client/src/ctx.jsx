import { createContext, useContext } from 'react';

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export const go = (path) => { window.location.hash = path; };
