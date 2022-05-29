# Downnloads Redis database
STAGE=$1

scp jeje@pve:/apps/wban/prod-redis-dump/dump.rdb ./dump.bsc.rdb
scp jeje@pve:/apps/wban/prod-polygon-redis-dump/dump.rdb ./dump.polygon.rdb

# Export BSC data
cp ./dump.bsc.rdb ./dump.rdb
redis-server &
sleep 5
redis-cli --scan --pattern 'claims:*' | cut -d: -f2,3 | tr : , > bridge-bsc-users.csv
pkill -9 redis-server

# Export Polygon data
cp ./dump.polygon.rdb ./dump.rdb
redis-server &
sleep 5
redis-cli --scan --pattern 'claims:*' | cut -d: -f2,3 | tr : , > bridge-polygon-users.csv
pkill -9 redis-server

# Export to S3
aws s3 cp bridge-bsc-users.csv s3://wban-bridges-users-${STAGE}
aws s3 cp bridge-polygon-users.csv s3://wban-bridges-users-${STAGE}

# Cleanup
rm *.rdb bridge-bsc-users.csv bridge-polygon-users.csv
