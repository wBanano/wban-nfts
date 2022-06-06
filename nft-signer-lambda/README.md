

## Testing locally

### Install Serverless CLI
`npm install -g serverless`

### Running offline stack
`sls offline`

### Running local DynamoDB

#### Local installation
Install sls plugin:
`sls dynamodb install`

Run it with:
`sls dynamodb start --port 9000` or

#### Docker setup (usefully if testing with MBP M1)
`docker run -d -p 9000:9000 amazon/dynamodb-local -jar DynamoDBLocal.jar -port 9000 -sharedDb -inMemory`

### Copying S3 file with local provider
`aws --endpoint http://localhost:8000 --profile s3local s3 cp bridges-users.csv s3://wban-nfts-dev/bridges-users.csv`
