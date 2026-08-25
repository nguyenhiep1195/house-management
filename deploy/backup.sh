#!/bin/sh
# Nightly MySQL backup -> any S3-compatible object storage (including Vultr).
#
# Dumps the database from the running mysql container, gzips it, uploads it to
# S3, and prunes local copies older than 7 days.
#
# Prerequisites on the server:
#   - AWS CLI installed and configured with an object-storage access key.
#   - The values below match deploy/.env.prod.
#
# Schedule it with cron, e.g. every night at 02:30:
#   30 2 * * * /opt/house-management/deploy/backup.sh >> /var/log/hm-backup.log 2>&1
#
# Restore later after loading MYSQL_ROOT_PASSWORD and MYSQL_DATABASE:
#   gunzip -c backup.sql.gz | docker exec -i -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" hm-mysql mysql -uroot "$MYSQL_DATABASE"

set -e

# Override these from cron/systemd if your paths or bucket differ.
HM_CONTAINER=${HM_CONTAINER:-hm-mysql}
HM_S3_BUCKET=${HM_S3_BUCKET:-s3://your-backup-bucket/house-management}
HM_S3_ENDPOINT=${HM_S3_ENDPOINT:-}
HM_LOCAL_DIR=${HM_LOCAL_DIR:-/var/backups/house-management}
HM_ENV_FILE=${HM_ENV_FILE:-/opt/house-management/deploy/.env.prod}

MYSQL_ROOT_PASSWORD=$(grep -E '^MYSQL_ROOT_PASSWORD=' "$HM_ENV_FILE" | cut -d= -f2-)
MYSQL_DATABASE=$(grep -E '^MYSQL_DATABASE=' "$HM_ENV_FILE" | cut -d= -f2-)

if [ -z "$MYSQL_ROOT_PASSWORD" ] || [ -z "$MYSQL_DATABASE" ]; then
  echo "Missing MYSQL_ROOT_PASSWORD or MYSQL_DATABASE in $HM_ENV_FILE" >&2
  exit 1
fi

STAMP=$(date +%Y-%m-%d_%H%M%S)
FILE="$HM_LOCAL_DIR/${MYSQL_DATABASE}_${STAMP}.sql.gz"

mkdir -p "$HM_LOCAL_DIR"

echo "[$(date)] Dumping $MYSQL_DATABASE ..."
docker exec -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" "$HM_CONTAINER" mysqldump \
  -uroot \
  --single-transaction --quick --routines --events \
  "$MYSQL_DATABASE" | gzip > "$FILE"

echo "[$(date)] Uploading to $HM_S3_BUCKET ..."
if [ -n "$HM_S3_ENDPOINT" ]; then
  aws --endpoint-url "$HM_S3_ENDPOINT" s3 cp "$FILE" "$HM_S3_BUCKET/"
else
  aws s3 cp "$FILE" "$HM_S3_BUCKET/"
fi

echo "[$(date)] Pruning local backups older than 7 days ..."
find "$HM_LOCAL_DIR" -name '*.sql.gz' -mtime +7 -delete

echo "[$(date)] Backup done: $FILE"
