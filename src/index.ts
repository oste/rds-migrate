import * as rds from '@aws-cdk/aws-rds';
import * as ssm from '@aws-cdk/aws-ssm';
import * as cdk from '@aws-cdk/core';
import * as baseStack from '@milltechfx/base-aws-stack';

/**
 * Store DB config in SSM to be used by rds-migrate
 * @param scope
 * @param database rds.ServerlessCluster
 */
export function configureMigration(
  scope: cdk.Construct,
  database: rds.ServerlessCluster
) {
  new ssm.StringParameter(scope, 'RdsMigrationConfig', {
    description: 'RDS Migration Config',
    parameterName: baseStack.getSsmName(
      process.env.STAGE || 'dev',
      database.stack.stackName,
      baseStack.ResourceType.DATABASE_CLUSTER,
      'rdsMigrationConfig'
    ),
    stringValue: JSON.stringify({
      secretArn: database.secret!.secretArn,
      secretName: database.secret?.secretName,
      clusterArn: database.clusterArn,
    }),
  });
}
