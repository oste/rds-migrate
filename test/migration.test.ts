import {RDSDataService} from 'aws-sdk';
import {Migration} from '../src/migration';
import {History} from '../src/history';
const AWS = require('aws-sdk');

const executeStatementSpy = jest.fn();
const commitTransactionSpy = jest.fn().mockReturnValue({
  promise: jest.fn().mockReturnValue({
    transactionId: 'someId',
  }),
});

const beginTransactionSpy = jest.fn().mockReturnValue({
  promise: jest.fn().mockReturnValue({
    transactionId: 'someId',
  }),
});

jest.spyOn(AWS, 'RDSDataService').mockImplementation(() => ({
  executeStatement: executeStatementSpy,
  beginTransaction: beginTransactionSpy,
  commitTransaction: commitTransactionSpy,
}));

jest.spyOn(global.console, 'info').mockImplementation(jest.fn());

const dbConfig = {
  resourceArn: 'someClusterArn',
  secretArn: 'someSecretArn',
  database: 'someDbName',
  engine: 'postgres',
};

describe('migrate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should migrate from v2 structure properly', async () => {
    executeStatementSpy.mockImplementation(
      (params: RDSDataService.Types.ExecuteStatementRequest) => {
        if (params.sql.includes('FROM information_schema.columns')) {
          return {
            promise: jest.fn().mockResolvedValueOnce({records: ['oldTable']}),
          };
        }

        if (params.sql.includes('')) {
          return {
            promise: jest.fn().mockResolvedValueOnce({
              records: [
                [
                  {
                    longValue: '3',
                  },
                ],
              ],
            }),
          };
        }

        return {
          promise: jest.fn(),
        };
      }
    );

    const historyMigrateSpy = jest
      .spyOn(History.prototype, 'migrate')
      .mockImplementationOnce(jest.fn());

    await new Migration(dbConfig, 'assets/sql').migrate();
    expect(beginTransactionSpy).toBeCalledTimes(1);
    expect(commitTransactionSpy).toBeCalledTimes(1);
    expect(historyMigrateSpy).toBeCalledWith({
      targetVersion: false,
      currentLegacyVersion: 3,
      allowDowngrade: false,
    });
    expect(executeStatementSpy).toBeCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('DROP TABLE migrations'),
      })
    );
    expect(executeStatementSpy).toBeCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('CREATE SCHEMA IF NOT EXISTS MIGRATIONS'),
      })
    );
  });

  it('should not migrate from version 2 when already at 3', async () => {
    executeStatementSpy.mockImplementation(
      (params: RDSDataService.Types.ExecuteStatementRequest) => {
        if (params.sql.includes('FROM information_schema.columns')) {
          return {
            promise: jest.fn().mockResolvedValueOnce({records: []}),
          };
        }

        return {
          promise: jest.fn(),
        };
      }
    );

    const historyMigrateSpy = jest
      .spyOn(History.prototype, 'migrate')
      .mockImplementationOnce(jest.fn());

    await new Migration(dbConfig, 'assets/sql').migrate(3, true);
    expect(beginTransactionSpy).toBeCalledTimes(1);
    expect(commitTransactionSpy).toBeCalledTimes(1);
    expect(historyMigrateSpy).toBeCalledWith({
      targetVersion: 3,
      currentLegacyVersion: false,
      allowDowngrade: true,
    });
    expect(executeStatementSpy).not.toBeCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('DROP TABLE migrations'),
      })
    );

    expect(executeStatementSpy).toBeCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('CREATE SCHEMA IF NOT EXISTS MIGRATIONS'),
      })
    );
  });
});
