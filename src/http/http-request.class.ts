import formidable, {errors as formidableErrors} from 'formidable';
import { HttpMethod } from './enums/http-method.enum';
import { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import { RoutePath } from '../router/types/route-path.type';

export class HttpRequest {
  private readonly request: IncomingMessage;

  constructor(request: IncomingMessage) {
    this.request = request;
  }

  public async form(): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const form = formidable({
        keepExtensions: true,
        maxFileSize: 10 * 1024 * 1024,
        multiples: true,
      });

      form.parse(this.request, (err, fields, files) => {
        if (err) {
          if (err.code === formidableErrors.maxFieldsSizeExceeded) {
            return reject(new Error('File size limit exceeded'));
          }

          return reject(err);
        }

        resolve({ fields, files });
      });
    });
  }

  public header(name: string): string | string[] | undefined {
    if (!this.headers[name]) {
      return undefined;
    }

    return Array.isArray(this.headers[name]) ? this.headers[name][0] : this.headers[name];
  }

  public get headers(): IncomingHttpHeaders {
    return this.request.headers;
  }

  public async input(name: string): Promise<string | undefined> {
    const entry = (await this.form())[name];

    return entry instanceof File ? undefined : entry as string ?? undefined;
  }

  public isAjaxRequest(): boolean {
    return !!(this.header('x-requested-with')?.toLowerCase() ===
        'xmlhttprequest' ||
      this.header('accept')?.includes('application/json'));
  }

  public async isFormRequest(): Promise<boolean> {
    return !!this.headers['content-type'] && ![
      HttpMethod.Get,
      HttpMethod.Head,
      HttpMethod.PropFind,
      HttpMethod.Search,
    ].includes(await this.method());
  }

  public async isMultipartRequest(): Promise<boolean> {
    return (await this.isFormRequest()) &&
      !!this.header('content-type')?.includes('multipart/form-data');
  }

  public async method(): Promise<HttpMethod> {
    if (!this.headers['content-type']) {
      return Object.values(HttpMethod).find((value) =>
        value === this.request.method
      ) ?? HttpMethod.Get;
    }

    const method = await this.input('_method') ?? this.request.method ??
      HttpMethod.Get;

    return (
      Object.values(HttpMethod).find((value) => value === method) ??
        HttpMethod.Get
    );
  }

  public path(): RoutePath {
    return new URL(this.request.url ?? '/').pathname as RoutePath;
  }

  public url(): string {
    return this.request.url ?? '/';
  }
}
