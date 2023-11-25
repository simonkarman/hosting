# Hosting
The hosting for static websites of [Simon Karman](https://www.simonkarman.nl), such as [simonkarman.nl](https://www.simonkarman.nl) and [karman.dev](https://www.karman.dev). 

To deploy first make sure that you have added the distributions of the domains to `domains/<domain-name>/` directory and then run `AWS_REGION=us-east-1 npm run cdk deploy`.

> Note: due to CloudFront certificate region restrictions this has to be deployed to the us-east-1 AWS region.
