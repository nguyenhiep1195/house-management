import { Role } from '../../generated/enums';

export interface JwtPayload {
  sub: number;
  role: Role;
  tokenVersion: number;
}
