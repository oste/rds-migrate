export interface DbConfig {
  resourceArn: string;
  secretArn: string;
  database: string;
  engine: string;
}

export interface SqlStatement {
  postgres: string;
  mysql: string;
  [key: string]: string;
}
