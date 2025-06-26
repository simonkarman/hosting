import {
  Stack, StackProps, Fn, aws_s3 as s3, aws_s3_deployment as s3d, aws_cloudfront as cf, aws_cloudfront_origins as cfo,
  aws_certificatemanager as cm, aws_lambda as lambda,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';

/**
 * A set of website to set up static file hosting for in AWS.
 */
export class HostingStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & {
    /**
     * The list of website that should be created as part of this hosting stack.
     *
     * For each website a storage bucket (AWS S3), a TLS certificate (AWS Certificate Manager), and a distribution (AWS CloudFront) will be created.
     *  The distribution will be set up to ensure that any request on a resource without an extends will be redirected to the /index.hml file. For
     *  example both 'example.org/abc' and 'example.org/abc/' will resolve to 'example.org/abc/index.html'.
     *
     *  Note: The certificates need to be manually validated. For this a CNAME record has to be added to DNS entries of your domain. You can find the
     *   values of these records in the CloudFormation stack as you're deploying a change that is adding one or more new (alternative) domains.
     */
    websites: {
      /**
       * The human-readable name of this website in CamelCase. The name must be unique across all websites.
       *
       * Example: ExampleOrg
       */
      name: string,

      /**
       * The main domain name of the website. The `www.` will always be added as an alternative domain name.
       *
       * Example: example.org
       */
      domainName: string,

      /**
       * Whether the `domains/<domain-name>` directory should be deployed into the website during deployment.
       *
       * Default: false
       * Example: false
       */
      deployment?: boolean,

      /**
       * The alternative domain names under which this website should be made available. The `www.` of the main domain name and each alternative
       *  domain name will always be added to this list if not present.
       *
       * Example: example.com
       */
      alternativeDomainNames?: string[]
    }[]
  }) {
    super(scope, id, props);

    const hostingBucket = new s3.Bucket(this, 'Bucket', {
      bucketName: Fn.sub('${account}-${region}-hosting', { account: this.account, region: this.region }),
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    props.websites.forEach(website => {
      const alternativeDomainNames = this.withWwwDomains(website.domainName, website.alternativeDomainNames);

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
        subjectAlternativeNames: alternativeDomainNames,
      });

      const viewerRequestFunction = new cf.experimental.EdgeFunction(this, `${website.name}ViewerRequestFunction`, {
        runtime: lambda.Runtime.NODEJS_LATEST,
        handler: 'index.handler',
        code: lambda.Code.fromAsset(path.join(__dirname, 'viewer-request-function')),
      });

      new cf.Distribution(this, `${website.name}Distribution`, {
        certificate,
        domainNames: [website.domainName, ...alternativeDomainNames],
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
            responsePagePath: '/403.html',
            responseHttpStatus: 200
          },
          {
            httpStatus: 404,
            responsePagePath: '/404.html',
            responseHttpStatus: 200
          }
        ],
      });
    });
  }

  /**
   * Creates a list of domain names including a www. subdomain for each non www. subdomain entry that isn't already present.
   *
   * @param domainName The main domain name.
   * @param alternativeDomainNames The alternative domain names.
   * @private
   */
  private withWwwDomains(domainName: string, alternativeDomainNames: string[] | undefined): string[] {
    const domains = [domainName, ...(alternativeDomainNames || [])];
    for (let i = domains.length - 1; i >= 0; i--) {
      // Skip www. subdomains
      const domain = domains[i];
      if (domain.startsWith('www.')) {
        continue;
      }

      // Skip www. subdomains that are already provided as part of the alternative domain names
      const domainWithWww = `www.${domain}`;
      if (domains.includes(domainWithWww)) {
        continue;
      }

      // Add the www. subdomain
      domains.push(domainWithWww);
    }

    // Return only the alternative domains, leaving out the domain name.
    return domains.slice(1);
  }
}
