import { AnonymousRoute } from '../../router/types/anonymous-route.type';
import { Constructor } from '../../utils/interfaces/constructor.interface';
import { Controller } from '../../router/controller.class';
import { Module } from '../../server/interfaces/module.interface';

export interface Plugin {
  controllers?: Constructor<Controller>[];
  modules?: Constructor<Module>[];
  name: string;
  onLoad?: () => void | Promise<void>;
  routes?: AnonymousRoute[];
}
