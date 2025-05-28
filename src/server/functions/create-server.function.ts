import { inject } from '../../injector/functions/inject.function';
import { Server } from '../server.service';
import { ServerOptions } from '../interfaces/server-options.interface';

export function createServer(options: ServerOptions = {}): Server {
  const server = inject(Server);

  return server.setup(options);
}
