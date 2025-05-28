import { EnumValuesUnion } from '../../utils/types/enum-values-union.type';
import { HttpMethod } from '../../http/enums/http-method.enum';
import { RouteOptions } from './route-options.interface';
import { RoutePath } from '../types/route-path.type';

export interface Route extends RouteOptions {
  action: (...args: unknown[]) => unknown | Promise<unknown>;
  methods: EnumValuesUnion<HttpMethod>[];
  path: RoutePath;
}
