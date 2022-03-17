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

export interface Script {
  id: number;
  version: number;
  filename: string;
  sqlCode: string;
  downgradeSqlCode?: string;
  executed?: string;
}

export interface ScriptDiff {
  upgrade: Script[];
  downgrade: Script[];
}

export interface StatementParameters {
  [key: string]: string;
}
