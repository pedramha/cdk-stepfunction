
import cdk = require("@aws-cdk/core");
import apigateway = require("@aws-cdk/aws-apigateway");
import dynamodb = require("@aws-cdk/aws-dynamodb");
import lambda = require("@aws-cdk/aws-lambda");
import { RemovalPolicy } from "@aws-cdk/core";
import { BillingMode } from "@aws-cdk/aws-dynamodb";
import * as stepfunctions from "@aws-cdk/aws-stepfunctions";
import * as iam from "@aws-cdk/aws-iam";
import * as fs from "fs";


export class CdkStepfunctionStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    //create a step function

    //create a roleARN for step function
    const roleARN = new iam.Role(this, 'StepFunctionRole', {
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole')
      ]
    });

    const file = fs.readFileSync('./logic/stepfunction.json.asl', 'utf8');
    

    const cdfnStepFunction=new stepfunctions.CfnStateMachine(this, 'cdfnStepFunction',
    {
      roleArn: roleARN.roleArn,
      definitionString: file.toString(),
    });
    
    //create a dynamodb
    const table = new dynamodb.Table(this, "OrdersTable", {
      billingMode: BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "id",
        type: dynamodb.AttributeType.STRING
      },
      removalPolicy: RemovalPolicy.DESTROY,
      tableName: "OrdersTable",
      timeToLiveAttribute: "ttl",
    });

    //create a step function


    const stepFuncStarter = new lambda.Function(this, "StepFuncHandler", {
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset("./src"),
      handler: "index.handler",
      timeout: cdk.Duration.seconds(10),
      environment: {
        TABLE_NAME: table.tableName,
        PRIMARY_KEY:'id',
        STEPFUNCTION_ARN: cdfnStepFunction.attrArn
      },
    });
    table.grantReadWriteData(stepFuncStarter);
    stepFuncStarter.addToRolePolicy(new iam.PolicyStatement({
      actions: ["states:StartExecution"],
      resources: [cdfnStepFunction.attrArn]
    }));

    //create a api gateway
    const api = new apigateway.RestApi(this, "StepFuncApi", {
      restApiName: "StepFuncApi",
      description: "StepFuncApi",
      endpointTypes: [apigateway.EndpointType.REGIONAL]
    });

    //add api gateway resource
    const resource = api.root.addResource("orders");
    const stepFuncIntegration = new apigateway.LambdaIntegration(stepFuncStarter);
    resource.addMethod("POST", stepFuncIntegration);

    
  }
}
