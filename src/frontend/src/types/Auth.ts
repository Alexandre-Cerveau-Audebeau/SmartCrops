export interface AuthResponse {
  token: string;
  expiration: string;
}

export interface AuthUser {
  email: string;
  userId: string;
}
