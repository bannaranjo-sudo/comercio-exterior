/** Error de validación o regla de negocio con mensaje seguro para mostrar al usuario. */
export class ErrorValidacion extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorValidacion";
  }
}
