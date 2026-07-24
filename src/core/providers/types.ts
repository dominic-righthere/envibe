export interface SecretProvider {
  readonly id: string;
  detect(): Promise<boolean>;
  pull(): Promise<Record<string, string>>;
  push?(secrets: Record<string, string>): Promise<void>;
}

