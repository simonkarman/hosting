import {
  Stack, StackProps, Fn, aws_s3 as s3, aws_s3_deployment as s3d, aws_cloudfront as cf, aws_cloudfront_origins as cfo,
  aws_certificatemanager as cm, aws_lambda as lambda,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';

export class HostingStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & {
    websites: { name: string, domainName: string, deployment: boolean, alternativeDomainNames?: string[] }[]
  }) {
    super(scope, id, props);

    const hostingBucket = new s3.Bucket(this, 'Bucket', {
      bucketName: Fn.sub('${account}-${region}-hosting', { account: this.account, region: this.region }),
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    props.websites.forEach(website => {
      if (website.deployment) {
        new s3d.BucketDeployment(this, `${website.name}BucketDeployment`, {
          sources: [s3d.Source.asset(`./domains/${website.domainName}`)],
          destinationBucket: hostingBucket,
          destinationKeyPrefix: `${website.domainName}/`,
        });
      }

      const origin = new cfo.S3Origin(hostingBucket, {
        originPath: `/${website.domainName}`,
        originAccessIdentity: new cf.OriginAccessIdentity(this, `${website.name}OAC`, {
          comment: `Allows CloudFront to reach ${website.domainName} in the hosting bucket`
        })
      });

      const certificate = new cm.Certificate(this, `${website.name}Certificate`, {
        domainName: website.domainName,
        validation: cm.CertificateValidation.fromDns(),
        subjectAlternativeNames: [
          `www.${website.domainName}`,
          ...(website.alternativeDomainNames || [])
        ],
      });

      const viewerRequestFunction = new cf.experimental.EdgeFunction(this, `${website.name}ViewerRequestFunction`, {
        runtime: lambda.Runtime.NODEJS_LATEST,
        handler: 'index.handler',
        code: lambda.Code.fromAsset(path.join(__dirname, 'viewer-request-function')),
      });

      new cf.Distribution(this, `${website.name}Distribution`, {
        certificate,
        domainNames: [website.domainName, `www.${website.domainName}`],
        defaultBehavior: {
          origin,
          viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cf.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          edgeLambdas: [
            {
              functionVersion: viewerRequestFunction.currentVersion,
              eventType: cf.LambdaEdgeEventType.VIEWER_REQUEST,
            }
          ],
        },
        errorResponses: [
          {
            httpStatus: 403,
            responsePagePath: '/index.html',
            responseHttpStatus: 200
          },
          {
            httpStatus: 404,
            responsePagePath: '/index.html',
            responseHttpStatus: 200
          }
        ],
      });
    });
  }
}
