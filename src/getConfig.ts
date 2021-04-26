import {DbConfig} from './types';
const baseStack = require('@milltechfx/base-aws-stack');
const aws = require('aws-sdk');
require('dotenv').config();

export async function getConfig(
  stage: string,
  region: string
): Promise<DbConfig> {
  if (!process.env.STACK_NAME) {
    throw new Error('Error: STACK_NAME environment variable missing');
  }

  try {
    const options = {
      signatureVersion: 'v4',
      region: region,
    };

    const fullStackName = baseStack.getResourceName(
      process.env.STACK_NAME,
      baseStack.ResourceType.STACK,
      stage,
      region
    );

    const ssm = new aws.SSM(options);
    const ssmData = await ssm
      .getParameters({
        Names: [
          baseStack.getSsmName(
            stage,
            fullStackName,
            baseStack.ResourceType.DATABASE_CLUSTER,
            'rdsMigrationConfig'
          ),
        ],
      })
      .promise();

    const ssmConfig = JSON.parse(ssmData.Parameters[0].Value);

    const secretsManager = new aws.SecretsManager(options);

    const secretData = await secretsManager
      .getSecretValue({SecretId: ssmConfig.secretName})
      .promise();

    const secretConfig = JSON.parse(secretData.SecretString);

    return {
      resourceArn: ssmConfig.clusterArn,
      secretArn: ssmConfig.secretArn,
      database: secretConfig.dbname,
      engine: secretConfig.engine,
    };
  } catch (error) {
    throw new Error(`reading config: ${JSON.stringify(error)}`);
  }
}
