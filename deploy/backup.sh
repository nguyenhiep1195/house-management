#!/bin/sh
# Nightly MySQL backup -> Amazon S3.
#
# Dumps the database from the running mysql container, gzips it, uploads it to
# S3, and prunes local copies older than 7 days.
#
# Prerequisites on the server:
#   - AWS CLI installed and credentials available (an EC2 IAM role with
#     s3:PutObject on the bucket is the safest option — no keys on disk).
#   - The values below match deploy/.env.prod.
#
# Schedule it with cron (run `crontab -e`), e.g. every night at 02:30:
#   30 2 * * * /home/ubuntu/house-management/deploy/backup.sh >> /var/log/hm-backup.log 2>&1
#
# Restore later with:
#   gunzip -c backup.sql.gz | docker exec -i hm-mysql mysql -uroot -p"$PASS" house_management

set -e

# --- Config (edit to match your setup) --------------------------------------
CONTAINER=hm-mysql
DB_NAME=house_management
S3_BUCKET=s3://your-backup-bucket/house-management
LOCAL_DIR=/home/ubuntu/hm-backups
# Read the DB password from the prod env file so it isn't duplicated here.
ENV_FILE=/home/ubuntu/house-management/deploy/.env.prod
# ----------------------------------------------------------------------------

MYSQL_ROOT_PASSWORD=$(grep -E '^MYSQL_ROOT_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)

STAMP=$(date +%Y-%m-%d_%H%M%S)
FILE="$LOCAL_DIR/${DB_NAME}_${STAMP}.sql.gz"

mkdir -p "$LOCAL_DIR"

echo "[$(date)] Dumping $DB_NAME ..."
docker exec "$CONTAINER" mysqldump \
  -uroot -p"$MYSQL_ROOT_PASSWORD" \
  --single-transaction --quick --routines --events \
  "$DB_NAME" | gzip > "$FILE"

echo "[$(date)] Uploading to $S3_BUCKET ..."
aws s3 cp "$FILE" "$S3_BUCKET/"

echo "[$(date)] Pruning local backups older than 7 days ..."
find "$LOCAL_DIR" -name '*.sql.gz' -mtime +7 -delete

echo "[$(date)] Backup done: $FILE"
