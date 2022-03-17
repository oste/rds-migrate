const executeSpy = jest.fn();
const SQL_FOLDER = 'assets/sql';
jest.mock('fs');
const fs = require('fs');
import {History} from '../src/history';

const historyMockData = require('./mockData/history.json');

describe('history', () => {
  beforeEach(() => {
    jest.resetAllMocks();

    executeSpy.mockResolvedValue({
      records: historyMockData.db,
    });
  });

  describe('migrate', () => {
    it('should store downgrade scripts when upgrading', async () => {
      jest
        .spyOn(fs, 'readdirSync')
        .mockReturnValueOnce(
          historyMockData.repo.map((item: {name: string}) => item.name)
        );

      historyMockData.repo.forEach((item: {sqlCode: string}) => {
        jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(item.sqlCode);
      });

      await new History(executeSpy, false, SQL_FOLDER).migrate({});
      expect(executeSpy).toBeCalledWith(historyMockData.repo[2].sqlCode);
      expect(executeSpy).toBeCalledWith(
        expect.any(String),
        expect.objectContaining({
          downgradeSqlCode: historyMockData.repo[3].sqlCode,
        })
      );
      expect(executeSpy).not.toBeCalledWith(historyMockData.repo[1].sqlCode);
      expect(executeSpy).not.toBeCalledWith(historyMockData.repo[0].sqlCode);
    });

    it('should store history from v2 of this package', async () => {
      jest
        .spyOn(fs, 'readdirSync')
        .mockReturnValueOnce(
          historyMockData.repo.map((item: {name: string}) => item.name)
        );

      historyMockData.repo.forEach((item: {sqlCode: string}) => {
        jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(item.sqlCode);
      });

      await new History(executeSpy, false, SQL_FOLDER).migrate({
        currentLegacyVersion: 1,
      });
      expect(executeSpy).toBeCalledWith(
        expect.stringContaining('INSERT INTO MIGRATIONS.history'),
        expect.objectContaining({
          sqlCode: historyMockData.repo[0].sqlCode,
        })
      );
    });

    it('should downgrade if repo is behind db and it is allowed', async () => {
      jest
        .spyOn(fs, 'readdirSync')
        .mockReturnValueOnce(
          [historyMockData.repo[0]].map((item: {name: string}) => item.name)
        );

      historyMockData.repo.forEach((item: {sqlCode: string}) => {
        jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(item.sqlCode);
      });

      await new History(executeSpy, false, SQL_FOLDER).migrate({
        allowDowngrade: true,
      });
      expect(executeSpy).toBeCalledWith(historyMockData.db[1][4].stringValue);
    });

    it('should not downgrade without the flag present', async () => {
      jest
        .spyOn(fs, 'readdirSync')
        .mockReturnValueOnce(
          [historyMockData.repo[0]].map((item: {name: string}) => item.name)
        );

      historyMockData.repo.forEach((item: {sqlCode: string}) => {
        jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(item.sqlCode);
      });

      await new History(executeSpy, false, SQL_FOLDER).migrate({});
      expect(executeSpy).not.toBeCalledWith(
        historyMockData.db[1][4].stringValue
      );
    });

    it('should not do anything if target is the current version', async () => {
      jest
        .spyOn(fs, 'readdirSync')
        .mockReturnValueOnce(
          [historyMockData.repo[0]].map((item: {name: string}) => item.name)
        );

      historyMockData.repo.forEach((item: {sqlCode: string}) => {
        jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(item.sqlCode);
      });

      await new History(executeSpy, false, SQL_FOLDER).migrate({
        targetVersion: 2,
      });
      expect(executeSpy).not.toBeCalledWith(historyMockData.repo[2].sqlCode);
    });

    it('should downgrade to common ancestor then upgrade new ones in repo ', async () => {
      jest
        .spyOn(fs, 'readdirSync')
        .mockReturnValueOnce(
          historyMockData.repo.map((item: {name: string}) => item.name)
        );

      executeSpy.mockClear();
      executeSpy.mockResolvedValue({
        records: [...historyMockData.db, ...historyMockData.dbAhead],
      });

      historyMockData.repo.forEach((item: {sqlCode: string}) => {
        jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(item.sqlCode);
      });

      await new History(executeSpy, false, SQL_FOLDER).migrate({
        allowDowngrade: true,
      });
      expect(executeSpy).toBeCalledWith(
        historyMockData.dbAhead[0][4].stringValue
      );
      expect(executeSpy).toBeCalledWith(historyMockData.repo[2].sqlCode);
    });
  });

  describe('createVersionFile', () => {
    beforeEach(() => {
      jest.resetAllMocks();
    });

    it("should create the folder if path doesn't exist", async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValueOnce(false);

      const mkdirSpy = jest.spyOn(fs, 'mkdirSync');

      await History.createVersionFile(SQL_FOLDER);
      expect(mkdirSpy).toBeCalled();
    });

    it('should create both up and down files', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValueOnce(true);

      const createFileSpy = jest.spyOn(fs, 'openSync');

      await History.createVersionFile(SQL_FOLDER);
      expect(createFileSpy).toBeCalledTimes(2);
    });
  });
});
