import { Role } from '../../generated/enums';

export interface AuthUser {
  id: number;
  username: string;
  email: string | null;
  name: string;
  phone: string | null;
  role: Role;
}
