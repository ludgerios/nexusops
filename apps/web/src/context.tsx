import { createContext, useContext } from 'react';
import type { User } from './types';
export const Workspace = createContext<{
  user: User;
  notify: (message: string, type?: 'success' | 'error') => void;
  logout: () => void;
}>(null!);
export const useWorkspace = () => useContext(Workspace);
