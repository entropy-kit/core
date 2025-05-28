import { Constructor } from '../../utils/interfaces/constructor.interface';
import { Controller } from '../../router/controller.class';
import { AnonymousRoute } from '../../router/types/anonymous-route.type';

export interface Module {
  readonly controllers?: Constructor<Controller>[];
  readonly routes?: AnonymousRoute[];
  readonly submodules?: Constructor<Module>[];
}
