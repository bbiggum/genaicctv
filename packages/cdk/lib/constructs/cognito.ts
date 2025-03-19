import { Aws, RemovalPolicy } from 'aws-cdk-lib';
import { UserPool, UserPoolClient, OAuthScope} from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface CognitoProps {}

export class Cognito extends Construct {
  readonly userPool: UserPool;
  readonly userPoolClient: UserPoolClient;

  constructor(scope: Construct, id: string, props: CognitoProps) {
    super(scope, id);

    // Cognito UserPool
    const userPool = new UserPool(this, 'UserPool', {
      // SignUp
      selfSignUpEnabled: true, // Disable Self Sign Up
      userInvitation: {
        emailSubject: 'GenAI CCTV User Registration',
        emailBody: 'Hello {username}, Your temporary password is {####}',
        smsMessage: 'Hello {username}, Your temporary password is {####}',
      },
      // SignIn
      signInAliases: {
        email: true,
      },
      passwordPolicy: {
        requireUppercase: true,
        requireSymbols: true,
        requireDigits: true,
        minLength: 8,
      },
      signInCaseSensitive: false,
      removalPolicy: RemovalPolicy.DESTROY,
      deletionProtection: false,
      // advancedSecurityMode: AdvancedSecurityMode.ENFORCED,
    });

    const appClient = userPool.addClient('Client',{
      userPoolClientName: "GenAICCTVClient",
      oAuth: {
          scopes: [
            OAuthScope.OPENID,
            OAuthScope.EMAIL,
            OAuthScope.PROFILE,
          ],
          flows: {authorizationCodeGrant: true},
      },
    });

    userPool.addDomain('CognitoDomain', {
      cognitoDomain: {
        domainPrefix: `genai-cctv-${Aws.ACCOUNT_ID}`,
      },
    });

    this.userPool = userPool;
    this.userPoolClient = appClient;
  }
}
