export abstract class Controller {
  public async render(
    view: string,
    data: Record<string, unknown>,
  ): Promise<string> {
    return `Rendered view: ${view} with data: ${JSON.stringify(data)}`;
  }
}
