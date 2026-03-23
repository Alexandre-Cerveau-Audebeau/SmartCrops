import { useContext } from 'react';
import { AuthContext } from '../contexts/authContextValue';

export function useAuth() {
  return useContext(AuthContext);
}
