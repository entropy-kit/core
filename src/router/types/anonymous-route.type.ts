import { EnumValuesUnion } from '../../utils/types/enum-values-union.type';
import { HttpMethod } from '../../http/enums/http-method.enum';
import { RouteOptions } from '../interfaces/route-options.interface';
import { RoutePath } from './route-path.type';

export type AnonymousRoute = [
  RoutePath,
  EnumValuesUnion<HttpMethod>[],
  (...args: unknown[]) => unknown | Promise<unknown>,
  RouteOptions?,
];
