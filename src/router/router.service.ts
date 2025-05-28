import { readFile, stat } from 'node:fs/promises';
import { App } from '../app/app.service';
import { Constructor } from '../utils/interfaces/constructor.interface';
import { Controller } from './controller.class';
import { EnumValuesUnion } from '../utils/types/enum-values-union.type';
import { HttpMethod } from '../http/enums/http-method.enum';
import { HttpRequest } from '../http/http-request.class';
import { HttpStatus } from '../http/enums/http-status.enum';
import { Inject } from '../injector/decorators/inject.decorator';
import { inject } from '../injector/functions/inject.function';
import { MethodDecorator } from '../utils/types/method-decorator.type';
import { Reflector } from '../utils/reflector.class';
import { RouteOptions } from './interfaces/route-options.interface';
import { RoutePath } from './types/route-path.type';
import { Route } from './interfaces/route.interface';
import { RouteStore } from './route-store.service';
import { Url } from './types/url.type';
import { HttpError } from '../http/http-error.class';
import { TimeUnit } from '../utils/enums/time-unit.enum';

type RouteDecoratorFunction<THttpMethods> =
  THttpMethods extends EnumValuesUnion<HttpMethod>[]
    ? (path: RoutePath, options?: RouteOptions) => MethodDecorator
    : (
        methods: EnumValuesUnion<HttpMethod>[],
        path: RoutePath,
        options?: RouteOptions,
      ) => MethodDecorator;

@Inject([App, RouteStore])
export class Router {
  constructor(
    private readonly app: App,
    private readonly routeStore: RouteStore,
  ) {}

  private readonly customHttpHandlers = new Map<
    HttpStatus | undefined,
    (statusCode: HttpStatus) => unknown
  >();

  private async createResponse(
    request: HttpRequest,
    body: unknown,
    {
      cookies = {},
      headers = {},
      statusCode = HttpStatus.Ok,
    }: ResponseOptions = {},
  ): Promise<Response> {
    const cspDirectives = ` ${
      this.configurator.entries.contentSecurityPolicy.allowedOrigins.join(' ')
    } ${
      this.configurator.entries.isProduction
        ? ''
        : `${
          this.configurator.entries.tls.enabled ? 'https' : 'http'
        }://${this.configurator.entries.host}:* ${
          this.configurator.entries.tls.enabled ? 'wss' : 'ws'
        }://${this.configurator.entries.host}:*`
    }`;

    const csp = {
      'base-uri': `'self'`,
      'connect-src': `'self' 'nonce-${request.nonce}' ${cspDirectives}`,
      'default-src': `'self' 'nonce-${request.nonce}' ${cspDirectives}`,
      'font-src':
        `'self' 'nonce-${request.nonce}' ${cspDirectives} https: data:`,
      'form-action': `'self'`,
      'frame-ancestors': `'self'`,
      'img-src': '*',
      'media-src': `'self'`,
      'object-src': `'none'`,
      'script-src': `'self' ${
        this.configurator.entries.contentSecurityPolicy.allowInlineScripts
          ? `'unsafe-inline'`
          : `'nonce-${request.nonce}'`
      } ${cspDirectives}`,
      'script-src-attr': `'${
        this.configurator.entries.contentSecurityPolicy.allowInlineScripts
          ? 'unsafe-inline'
          : 'none'
      }'`,
      'style-src': `'self' ${
        this.configurator.entries.contentSecurityPolicy.allowInlineStyles
          ? `'unsafe-inline'`
          : `'nonce-${request.nonce}'`
      } ${cspDirectives}`,
      'upgrade-insecure-requests': '',
    };

    const { cors } = this.configurator.entries;

    const securityHeaders = {
      'access-control-allow-credentials': String(cors.allowCredentials),
      'access-control-allow-headers': cors.allowedHeaders.length
        ? cors.allowedHeaders.join(',')
        : (request.header('access-control-request-headers') ?? ''),
      ...(cors.allowedMethods.length && {
        'access-control-allow-methods': cors.allowedMethods.join(','),
      }),
      ...((cors.allowedOrigins.length &&
          cors.allowedOrigins.includes(request.header('origin') ?? '') ||
        cors.allowedOrigins[0] === '*') && {
        'access-control-allow-origin': cors.allowedOrigins[0] === '*'
          ? '*'
          : request.header('origin'),
      }),
      ...(cors.exposedHeaders.length && {
        'access-control-expose-headers': cors.exposedHeaders.join(','),
      }),
      'access-control-max-age': String(cors.maxAge),
      'content-security-policy': Object.entries(csp).map(([key, value]) =>
        `${key} ${value}`
      ).join(';'),
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-resource-policy': 'same-origin',
      'origin-agent-cluster': '?1',
      'permissions-policy':
        'autoplay=(self), camera=(), encrypted-media=(self), geolocation=(self), microphone=(), payment=(), sync-xhr=(self)',
      'referrer-policy': 'no-referrer',
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      ...(!cors.allowedMethods.includes('*') && {
        'vary': 'origin',
      }),
      'x-content-type-options': 'nosniff',
      'x-dns-prefetch-control': 'off',
      'x-xss-protection': '0',
    };

    const { body: parsedBody, contentType } = await this.parseResponseBody(
      request,
      body,
    );

    const baseHeaders = {
      'content-type': `${contentType}; charset=utf-8`,
      'cache-control': this.configurator.entries.cache.enabled &&
          await request.isStaticFileRequest()
        ? `max-age=${
          this.configurator.entries.cache.maxAge * 24 * TimeUnit.Hour / 1000
        }`
        : 'no-cache',
    };

    const response = new Response(parsedBody, {
      status: parsedBody === null ? HttpStatus.NoContent : statusCode,
      headers: {
        ...baseHeaders,
        ...securityHeaders,
        ...headers,
      },
    });

    for (const [cookie, cookieValue] of Object.entries(cookies)) {
      response.headers.append(
        'set-cookie',
        `${cookie}=${cookieValue}; SameSite=Lax; Max-Age=${
          this.configurator.entries.cookies.maxAge * 24 * TimeUnit.Hour / 1000
        }`,
      );
    }

    return response;
  }

  private async createStaticFileResponse(
    request: HttpRequest,
  ): Promise<Response> {
    const filePath = `public${request.path()}`;

    try {
      const fileSize = (await stat(filePath)).size;
      const body = await readFile(filePath);

      return await this.createResponse(request, body, {
        headers: {
          'content-length': fileSize.toString(),
          'content-type':
            contentType(filePath.split('.')?.pop() ?? '') ??
            'application/octet-stream',
        },
      });
    } catch {
      throw new HttpError(HttpStatus.NotFound);
    }
  }

  private resolveRoutePath(basePath: RoutePath, path: RoutePath): RoutePath {
    return basePath === '/'
      ? path
      : (`${basePath}${
          path[0] !== '/' && basePath.split('').pop() !== '/' ? '/' : ''
        }${path}` as RoutePath);
  }

  public baseUrl(): Url {
    return `${
      this.app.state.tls.enabled ? 'https' : 'http'
    }://${this.app.state.host}${
      this.app.state.isProduction ? '' : `:${this.app.state.port}`
    }`;
  }

  public createRouteDecorator<
    THttpMethods extends EnumValuesUnion<HttpMethod>[] | undefined = undefined,
  >(httpMethods?: THttpMethods): RouteDecoratorFunction<THttpMethods> {
    const decoratorCallback = (
      path: RoutePath,
      methods: EnumValuesUnion<HttpMethod>[],
      options: RouteOptions = {},
    ): MethodDecorator => {
      return (originalMethod, context) => {
        if (context.private) {
          throw new Error(
            `Controller route method "${
              context.name as string
            }" must be public`,
          );
        }

        if (context.static) {
          throw new Error(
            `Controller route method "${
              context.name as string
            }" cannot be static`,
          );
        }

        Reflector.defineMetadata<Partial<Route>>(
          'route',
          {
            methods,
            path,
            ...options,
          },
          originalMethod,
        );

        return originalMethod;
      };
    };

    return (
      Array.isArray(httpMethods)
        ? (path: RoutePath, options: RouteOptions = {}) => {
            return decoratorCallback(path, httpMethods, options);
          }
        : (
            methods: EnumValuesUnion<HttpMethod>[],
            path: RoutePath,
            options: RouteOptions = {},
          ) => {
            return decoratorCallback(path, methods, options);
          }
    ) as RouteDecoratorFunction<THttpMethods>;
  }

  public any(
    path: RoutePath,
    action: (...args: unknown[]) => Promise<unknown>,
    options: RouteOptions = {},
  ): void {
    this.registerRoute(path, Object.values(HttpMethod), action, options);
  }

  public copy(
    path: RoutePath,
    action: (...args: unknown[]) => Promise<unknown>,
    options: RouteOptions = {},
  ): void {
    this.registerRoute(path, [HttpMethod.Copy], action, options);
  }

  public delete(
    path: RoutePath,
    action: (...args: unknown[]) => Promise<unknown>,
    options: RouteOptions = {},
  ): void {
    this.registerRoute(path, [HttpMethod.Delete], action, options);
  }

  public except(
    methods: EnumValuesUnion<HttpMethod>[],
    path: RoutePath,
    action: (...args: unknown[]) => Promise<unknown>,
    options: RouteOptions = {},
  ): void {
    this.registerRoute(
      path,
      Object.values(HttpMethod).filter(
        (httpMethod) => !methods.includes(httpMethod),
      ),
      action,
      options,
    );
  }

  public get(
    path: RoutePath,
    action: (...args: unknown[]) => Promise<unknown>,
    options: RouteOptions = {},
  ): void {
    this.registerRoute(path, [HttpMethod.Get], action, options);
  }

  public head(
    path: RoutePath,
    action: (...args: unknown[]) => Promise<unknown>,
    options: RouteOptions = {},
  ): void {
    this.registerRoute(path, [HttpMethod.Head], action, options);
  }

  public lock(
    path: RoutePath,
    action: (...args: unknown[]) => Promise<unknown>,
    options: RouteOptions = {},
  ): void {
    this.registerRoute(path, [HttpMethod.Lock], action, options);
  }

  public mkcol(
    path: RoutePath,
    action: (...args: unknown[]) => Promise<unknown>,
    options: RouteOptions = {},
  ): void {
    this.registerRoute(path, [HttpMethod.Mkcol], action, options);
  }

  public move(
    path: RoutePath,
    action: (...args: unknown[]) => Promise<unknown>,
    options: RouteOptions = {},
  ): void {
    this.registerRoute(path, [HttpMethod.Move], action, options);
  }

  public options(
    path: RoutePath,
    action: (...args: unknown[]) => Promise<unknown>,
    options: RouteOptions = {},
  ): void {
    this.registerRoute(path, [HttpMethod.Options], action, options);
  }

  public patch(
    path: RoutePath,
    action: (...args: unknown[]) => Promise<unknown>,
    options: RouteOptions = {},
  ): void {
    this.registerRoute(path, [HttpMethod.Patch], action, options);
  }

  public post(
    path: RoutePath,
    action: (...args: unknown[]) => Promise<unknown>,
    options: RouteOptions = {},
  ): void {
    this.registerRoute(path, [HttpMethod.Post], action, options);
  }

  public propFind(
    path: RoutePath,
    action: (...args: unknown[]) => Promise<unknown>,
    options: RouteOptions = {},
  ): void {
    this.registerRoute(path, [HttpMethod.PropFind], action, options);
  }

  public propPatch(
    path: RoutePath,
    action: (...args: unknown[]) => Promise<unknown>,
    options: RouteOptions = {},
  ): void {
    this.registerRoute(path, [HttpMethod.PropPatch], action, options);
  }

  public put(
    path: RoutePath,
    action: (...args: unknown[]) => Promise<unknown>,
    options: RouteOptions = {},
  ): void {
    this.registerRoute(path, [HttpMethod.Put], action, options);
  }

  public search(
    path: RoutePath,
    action: (...args: unknown[]) => Promise<unknown>,
    options: RouteOptions = {},
  ): void {
    this.registerRoute(path, [HttpMethod.Search], action, options);
  }

  public trace(
    path: RoutePath,
    action: (...args: unknown[]) => Promise<unknown>,
    options: RouteOptions = {},
  ): void {
    this.registerRoute(path, [HttpMethod.Trace], action, options);
  }

  public unlock(
    path: RoutePath,
    action: (...args: unknown[]) => Promise<unknown>,
    options: RouteOptions = {},
  ): void {
    this.registerRoute(path, [HttpMethod.Unlock], action, options);
  }

  public methods(
    methods: EnumValuesUnion<HttpMethod>[],
    path: RoutePath,
    action: (...args: unknown[]) => Promise<unknown>,
    options: RouteOptions = {},
  ): void {
    this.registerRoute(path, methods, action, options);
  }

  public registerController(controller: Constructor<Controller>): void {
    const controllerInstance = inject(controller);

    const controllerProperties = Object.getOwnPropertyNames(
      Object.getPrototypeOf(controllerInstance),
    );

    const controllerRouteMethods = controllerProperties.filter((property) => {
      return (
        property !== 'constructor' &&
        property[0] !== '_' &&
        typeof Object.getPrototypeOf(controllerInstance)[property] ===
          'function'
      );
    });

    for (const controllerRouteMethod of controllerRouteMethods) {
      const controllerMethodRef = Object.getPrototypeOf(controllerInstance)[
        controllerRouteMethod
      ] as (...args: unknown[]) => unknown;

      const handler = Reflector.getMetadata<{ statusCode?: HttpStatus }>(
        'httpErrorHandler',
        controllerMethodRef,
      );

      if (handler) {
        this.customHttpHandlers.set(
          handler.statusCode,
          async (statusCode: HttpStatus) => {
            const methodResult = controllerMethodRef.call(
              controllerInstance,
              statusCode,
            );

            return methodResult instanceof Promise
              ? await methodResult
              : methodResult;
          },
        );

        continue;
      }

      const { methods, path } = Reflector.getMetadata<Exclude<Route, 'action'>>(
        'route',
        controllerMethodRef,
      )!;

      const basePath =
        Reflector.getMetadata<RoutePath>(
          'basePath',
          Object.getPrototypeOf(controllerInstance),
        ) ?? '/';

      const resolvedPath = this.resolveRoutePath(basePath, path);

      this.registerRoute(resolvedPath, methods, async (...args: unknown[]) => {
        const methodResult = controllerMethodRef.call(
          controllerInstance,
          ...args,
        );

        return methodResult instanceof Promise
          ? await methodResult
          : methodResult;
      });
    }
  }

  public registerRoute(
    path: RoutePath,
    methods: EnumValuesUnion<HttpMethod>[],
    action: (...args: unknown[]) => unknown | Promise<unknown>,
    options: RouteOptions = {},
  ): void {
    this.routeStore.routes.push({
      action,
      methods,
      path,
      ...options,
    });
  }

  public async respond(
    request: HttpRequest,
  ): Promise<{ content: string; headers: Headers; statusCode: HttpStatus }> {
    try {
      const requestMethod = await request.method();

      for (const { action, methods, path } of this.routeStore.routes) {
        if (!methods.includes(requestMethod)) {
          continue;
        }

        const urlPattern = new URLPattern({
          pathname: path,
        });

        for (const method of methods) {
          if (requestMethod === method && urlPattern.test(request.url())) {
            const paramGroups =
              urlPattern.exec(request.url())?.pathname.groups ?? {};

            for (const [paramName, paramValue] of Object.entries(paramGroups)) {
              if (paramValue === '') {
                paramGroups[paramName] = undefined;
              }
            }

            const resolvedParams = Object.values(paramGroups);

            return await this.createResponse(
              request,
              await action(resolvedParams, request),
              {
                statusCode,
              },
            );
          }
        }
      }

      if (requestMethod === HttpMethod.Get && request.path().includes('.')) {
        return await this.createStaticFileResponse(request);
      }

      throw new HttpError(HttpStatus.NotFound);
    } catch (error) {
      const { file, line } = this.errorHandler.handle(error as Error);

      if (
        this.configurator.entries.isProduction ||
        error instanceof HttpError
      ) {
        return await this.createAbortResponse(
          request,
          error instanceof HttpError
            ? error.statusCode
            : HttpStatus.InternalServerError,
        );
      }

      const stackTrace = (error as Error).stack
        ?.split('\n')
        .map((line) => line.trim().replace('at ', ''))
        .filter((line) => !line.startsWith('file'))
        .slice(1, 3);

      let fileContent: string | undefined;

      try {
        fileContent = await Deno.readTextFile(file ?? '');
      } catch {
        fileContent = undefined;
      }

      return await this.createResponse(
        request,
        await inject(TemplateCompiler).render(
          errorPage,
          {
            codeSnippet: fileContent
              ?.split('\n')
              .map((content, index) => ({
                content,
                line: index + 1,
              }))
              .slice(line ? line - 2 : 0, line ? line + 2 : undefined),
            error,
            errorLine: line,
            stackTrace,
            fullStackTrace: (error as Error).stack,
          },
          {
            request,
          },
        ),
        {
          statusCode: HttpStatus.InternalServerError,
        },
      );
    }
  }
}
