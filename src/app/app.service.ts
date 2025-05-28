import { AppConfig } from './interfaces/app-config.interface';
import { DeepPartial } from '../utils/types/deep-partial.type';
import { EnvVariable } from '../utils/types/env-variable.type';
import { Utils } from '../utils/utils.class';

export class App {
  private configuration?: AppConfig;

  private validateConfiguration(): void {
    if (this.state.encryption.key.length < 16) {
      throw new Error(
        'Encryption key length must be greater than or equal to 16',
      );
    }
  }

  public env<TValue extends EnvVariable>(key: string): TValue | undefined {
    if (!(key in process.env)) {
      return undefined;
    }

    try {
      return JSON.parse(process.env[key]?.toString() ?? 'null') as
        | TValue
        | undefined;
    } catch {
      return process.env[key] as TValue;
    }
  }

  public option<TValue = string>(
    entry: keyof AppConfig,
    defaultValue: TValue,
  ): TValue {
    return (this.state[entry] as TValue) ?? defaultValue;
  }

  public setup(configuration: DeepPartial<AppConfig> = {}): this {
    this.configuration = Utils.mergeDeep(this.state, configuration);

    this.validateConfiguration();

    return this;
  }

  public get state(): AppConfig {
    if (!this.configuration) {
      this.configuration = {
        encryption: {
          key: this.env<string>('ENCRYPTION_KEY') ?? crypto.randomUUID(),
        },
        host: this.env<string>('HOST') ?? 'localhost',
        isProduction: this.env<boolean>('PRODUCTION') ?? false,
        logger: {
          enabled: true,
        },
        port: this.env<number>('PORT') ?? 5050,
        tls: {
          enabled: this.env<boolean>('TLS') ?? false,
          key: this.env<string>('TLS_KEY') ?? '',
          cert: this.env<string>('TLS_CERT') ?? '',
        },
      };
    }

    return this.configuration;
  }

  public set(keyInDotNotation: string, value: unknown): void {
    const keys = keyInDotNotation.split('.');

    let current: Record<string, unknown> = this.state;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }

      current = current[keys[i]] as Record<string, unknown>;
    }

    current[keys[keys.length - 1]] = value;
  }
}
