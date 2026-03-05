export {};

declare global {
  interface CustomJwtSessionClaims {
    metadata?: {
      tenant_id?: string;
      platform_admin?: boolean;
    };
  }
}
