import { ClassDecorator } from '../../utils/types/class-decorator.type';
import { Constructor } from '../../utils/interfaces/constructor.interface';
import { Reflector } from '../../utils/reflector.class';

export function Inject(dependencies: Constructor[]): ClassDecorator {
  return (originalClass) => {
    Reflector.defineMetadata<Constructor[]>(
      'dependencies',
      dependencies,
      originalClass,
    );
  };
}
