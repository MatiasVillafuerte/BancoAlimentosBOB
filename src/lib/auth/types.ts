export const ROLES = ["voluntario", "coordinador", "administrador"] as const;
export type Rol = (typeof ROLES)[number];

export interface UsuarioPublico {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  rol: Rol;
}

export interface UsuarioAutenticacion extends UsuarioPublico {
  activo: boolean;
  passwordHash?: string;
}

export interface SesionGuardada {
  tokenHash: string;
  creadaEn: Date;
  expiraEn: Date;
}

export interface AlmacenAutenticacion {
  reservarIntento(email: string, ahora: Date): Promise<UsuarioAutenticacion | null>;
  agregarSesion(usuario: UsuarioAutenticacion, sesion: SesionGuardada): Promise<boolean>;
  buscarSesion(id: string, tokenHash: string, ahora: Date): Promise<UsuarioAutenticacion | null>;
  eliminarSesion(id: string, tokenHash: string): Promise<void>;
  cambiarPassword(usuario: UsuarioAutenticacion, tokenAnteriorHash: string,
    nuevoHash: string, sesion: SesionGuardada): Promise<boolean>;
}
