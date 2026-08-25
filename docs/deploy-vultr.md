# Deploy production lên Vultr bằng Docker Compose

Stack chạy trên một Vultr Cloud Compute instance:

```text
Internet -> Caddy :80/:443
              |-> Next.js web :3000 (private)
              |-> NestJS API  :3001 (private)
                       |-> MySQL :3306 (private + named volume)
```

Chỉ Caddy publish port ra host. Web, API và MySQL chỉ giao tiếp trong Docker
network; không mở `3000`, `3001` hoặc `3306` trên Vultr Firewall.

## 1. Tạo server và DNS

1. Tạo Cloud Compute instance ở region gần người dùng (Singapore cho Việt Nam),
   Ubuntu 24.04 LTS, SSH key authentication. Khuyến nghị 2 vCPU / 4 GB RAM để
   build cả Next.js và NestJS ngay trên máy; 2 GB có thể dùng cho tải nhỏ nếu có
   swap, nhưng build dễ thiếu RAM hơn.
2. Gắn Vultr Firewall Group với inbound rules:
   - TCP 22 chỉ từ IP quản trị.
   - TCP 80 từ mọi nơi.
   - TCP 443 và UDP 443 từ mọi nơi.
   - Không mở 3000, 3001, 3306.
3. Dùng IP hiện tại hoặc gắn Reserved IP, rồi tạo hai DNS A records:
   - `house.example.com` -> IP server.
   - `api.house.example.com` -> IP server.

## 2. Cài Docker Engine

Dùng repository chính thức của Docker, không dùng convenience script cho prod:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Đăng xuất/đăng nhập lại, sau đó kiểm tra:

```bash
docker version
docker compose version
```

Nếu máy chỉ có 2 GB RAM, thêm 2 GB swap trước khi build:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 3. Chuẩn bị source và secrets

```bash
sudo mkdir -p /opt/house-management
sudo chown "$USER":"$USER" /opt/house-management
git clone <repo-url> /opt/house-management
cd /opt/house-management
cp deploy/.env.prod.example deploy/.env.prod
chmod 600 deploy/.env.prod
nano deploy/.env.prod
```

Điền đầy đủ:

- `MYSQL_ROOT_PASSWORD` và `MYSQL_PASSWORD`: hai chuỗi khác nhau từ
  `openssl rand -hex 24`.
- `JWT_SECRET`: `openssl rand -hex 32`.
- `APP_DOMAIN`, `API_DOMAIN`, `TLS_EMAIL`, `WEB_URL` theo DNS thật.
- SMTP thật và mật khẩu admin ban đầu mạnh.

Không dùng ký tự chưa URL-encode trong `MYSQL_PASSWORD`; template khuyến nghị
chuỗi hex để Compose tạo `DATABASE_URL` an toàn.

Validate cấu hình trước khi chạy:

```bash
docker compose --env-file deploy/.env.prod -f docker-compose.prod.yml config --quiet
```

## 4. Deploy và kiểm tra

```bash
docker compose --env-file deploy/.env.prod -f docker-compose.prod.yml up -d --build
docker compose --env-file deploy/.env.prod -f docker-compose.prod.yml ps
docker compose --env-file deploy/.env.prod -f docker-compose.prod.yml logs --tail=200 api web caddy
```

API entrypoint tự chạy `prisma migrate deploy`, rồi seed admin theo kiểu
idempotent trước khi start. Caddy chỉ bắt đầu khi API và web đều healthy.

Kiểm tra public endpoints:

```bash
curl --fail --show-error https://api.house.example.com/health
curl --fail --show-error --head https://house.example.com/login
```

Sau đó kiểm tra thủ công các luồng: đăng nhập, phòng, khách thuê, hợp đồng, cập
nhật chỉ số điện/nước, tạo/thanh toán hóa đơn, loại phí, người dùng và reset mật
khẩu qua SMTP.

## 5. Backup bắt buộc

Bật Vultr Automatic Backups cho instance, đồng thời giữ logical MySQL dump ở
một nơi khác server. Script `deploy/backup.sh` hỗ trợ S3 và Vultr Object Storage
(S3-compatible):

```bash
sudo apt install -y awscli
sudo mkdir -p /var/backups/house-management
sudo chown "$USER":"$USER" /var/backups/house-management

HM_S3_BUCKET=s3://your-bucket/house-management \
HM_S3_ENDPOINT=https://your-vultr-object-storage-endpoint \
./deploy/backup.sh
```

Chỉ thêm cron sau khi chạy thử và tải một file dump về để restore thử. Ví dụ:

```cron
30 2 * * * HM_S3_BUCKET=s3://your-bucket/house-management HM_S3_ENDPOINT=https://your-endpoint /opt/house-management/deploy/backup.sh >> /var/log/hm-backup.log 2>&1
```

## 6. Cập nhật và vận hành

```bash
cd /opt/house-management
git pull --ff-only
docker compose --env-file deploy/.env.prod -f docker-compose.prod.yml up -d --build
docker compose --env-file deploy/.env.prod -f docker-compose.prod.yml ps
docker compose --env-file deploy/.env.prod -f docker-compose.prod.yml logs --tail=200 api web caddy
```

Không chạy `docker compose down -v`: tùy chọn `-v` xóa volume MySQL. Trước mỗi
schema migration quan trọng, tạo logical dump và xác minh backup gần nhất.

## Tài liệu chính thức

- Vultr Firewall rules: https://docs.vultr.com/products/network/firewall-groups/management/rules
- Vultr Cloud Compute networking/Reserved IP: https://docs.vultr.com/products/compute/instances/cloud-compute/networking
- Vultr Automatic Backups: https://docs.vultr.com/products/compute/instances/cloud-compute/features/auto-backups
- Vultr Object Storage S3 compatibility: https://docs.vultr.com/products/storage/object-storage/s3-compatibility-matrix
- Docker Engine on Ubuntu: https://docs.docker.com/engine/install/ubuntu/
