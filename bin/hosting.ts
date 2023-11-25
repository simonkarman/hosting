#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { HostingStack } from '../lib/hosting-stack';

const app = new cdk.App();
new HostingStack(app, 'HostingStack', {
  env: { account: '343891447419', region: 'us-east-1' /* MUST be us-east-1 */ },
  websites: [
    { name: 'SimonKarmanNl', domainName: 'simonkarman.nl', deployment: true, alternativeDomainNames: ['www.simonkarman.com', 'simonkarman.com'] },
    { name: 'KarmanDev', domainName: 'karman.dev', deployment: true },
    { name: 'Similization', domainName: 'similization.nl', deployment: true },
  ]
});
