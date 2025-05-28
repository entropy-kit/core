export class Logger {
  public info(message: string): void {
    console.log(message);
  }

  public error(message: string): void {
    console.error(message);
  }

  public warn(message: string): void {
    console.warn(message);
  }
}
