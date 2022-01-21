import {getConfig} from '../src/getConfig';
const aws = require('aws-sdk');
jest.mock('aws-sdk');

const ssmData = {
  Parameters: [
    {
      Value: JSON.stringify({
        clusterArn: 'someClusterArn',
        secretArn: 'someSecretArn',
      }),
    },
  ],
};
const secretManagerData = {
  SecretString: JSON.stringify({
    dbname: 'someDbName',
    engine: 'someEngine',
  }),
};

describe('getConfig', () => {
  it('should retrieve correct values from SSM and secret manager', async () => {
    delete process.env.STACK_NAME;

    await expect(getConfig('dev', 'eu-west-1')).rejects.toThrow(
      'Error: STACK_NAME environment variable missing'
    );

    process.env.STACK_NAME = 'someStack';
  });

  it('should call SSM with correct parameters', async () => {
    jest.spyOn(aws, 'SSM').mockImplementationOnce(() => ({
      getParameters: jest.fn().mockReturnValueOnce({
        promise: jest.fn().mockReturnValueOnce(ssmData),
      }),
    }));

    jest.spyOn(aws, 'SecretsManager').mockImplementationOnce(() => ({
      getSecretValue: jest.fn().mockReturnValueOnce({
        promise: jest.fn().mockReturnValueOnce(secretManagerData),
      }),
    }));

    const result = await getConfig('dev', 'eu-west-1');

    expect(result).toStrictEqual({
      resourceArn: 'someClusterArn',
      secretArn: 'someSecretArn',
      database: 'someDbName',
      engine: 'someEngine',
    });
  });
});
