# Báo cáo kiểm thử lại toàn bộ source code (dry-run)

> Ngôn ngữ: Tiếng Việt
> Phạm vi: Toàn bộ code trong `src/`, `bin/`, `scripts/`.
> Hình thức: Dry-run (giả lập dữ liệu đầu vào/đầu ra), dựa trên phân tích mã nguồn.

## 1. Mục tiêu & phạm vi

- Xác minh luồng nghiệp vụ từ CLI/library đến việc tạo tunnel, cấu hình DNS và chạy cloudflared.
- Đánh giá cú pháp `require`, đường dẫn module, cách xử lý cấu hình, xử lý lỗi và log.
- Mô phỏng dữ liệu đầu vào/đầu ra và phản hồi API theo đúng logic hiện tại.
- Đánh giá khả năng chạy trên GitHub Actions, Azure Pipelines, Linux/Ubuntu, Windows.

## 2. Tổng quan kiến trúc & luồng nghiệp vụ

### 2.1. Luồng tổng quát (CLI)

1. CLI đọc env, parse cấu hình (`parseInput`).
2. Khởi tạo logger và log cấu hình (đã che thông tin nhạy cảm).
3. Validate cấu hình (`validate`).
4. Lập kế hoạch (`plan`) với 1 tunnel + nhiều service.
5. `TunnelManager.execute()` thực hiện:
   - Cài cloudflared (nếu cần).
   - Tạo thư mục `.runner-data` và các subdir.
   - Tạo tunnel/credentials/DNS record.
   - Sinh `config.yml`.
   - Spawn tiến trình `cloudflared`.
   - Xác minh tiến trình và log.
6. Kết xuất report.

### 2.2. Luồng tổng quát (Library)

`startTunnels()` chạy pipeline giống CLI nhưng cho phép truyền `options` để override.

### 2.3. Các module chính

- `src/cli/commands.js`: CLI command và orchestration.
- `src/core/config.js`: parse env, validate, cung cấp path `.runner-data`.
- `src/core/plan.js`: gom các dịch vụ về 1 tunnel.
- `src/core/tunnel-manager.js`: luồng chính tạo tunnel/DNS/khởi động.
- `src/core/cloudflare-client.js`: gọi Cloudflare API.
- `src/core/cloudflared-installer.js`: cài/định vị cloudflared.
- `src/adapters/*`: FS, HTTP, Process adapter.
- `src/utils/*`: logger, errors, retry, time.

## 3. Đúng cú pháp require/import, đường dẫn, quotes

- Toàn bộ mã dùng CommonJS `require()` với đường dẫn tương đối rõ ràng (`../`), không dùng `import`.
- Đường dẫn file khớp với cấu trúc trong repo (`src/...`, `bin/...`).
- Sử dụng nhất quán dấu nháy đơn `'` cho string (và một số nơi dùng `"` khi log). Không thấy lỗi cú pháp hoặc đường dẫn sai.

## 4. Dry-run theo luồng nghiệp vụ (ví dụ đầu vào/đầu ra)

### 4.1. Input giả lập (env)

```bash
CLOUDFLARED_API_KEY=api-key-xxx
CLOUDFLARED_EMAIL=dev@example.com
CLOUDFLARED_ACCOUNT_ID=acc-123
CLOUDFLARED_TUNNEL_1=ci-tunnel:ssh.example.com:localhost:22
CLOUDFLARED_TUNNEL_2=ci-tunnel:web.example.com:localhost:8080
CLOUDFLARED_ZONE_NAME=example.com
CLOUDFLARED_LOG_LEVEL=verbose
CLOUDFLARED_TIMEOUT=30000
CLOUDFLARED_VERIFY_RETRIES=3
CLOUDFLARED_VERIFY_DELAY=3000
```

### 4.2. Dry-run chi tiết từng bước (CLI)

> Thực thi: `cloudflared-tunnel-start --verbose`

**Bước 1: parseInput**
- Tách env `CLOUDFLARED_TUNNEL_1..N` theo `:` => 4 phần: `name`, `hostname`, `ip`, `port`.
- Kết quả giả lập:

```json
{
  "apiKey": "api-key-xxx",
  "email": "dev@example.com",
  "accountId": "acc-123",
  "tunnelToken": "",
  "zoneId": "",
  "zoneName": "example.com",
  "tunnels": [
    {"index":1, "name":"ci-tunnel", "hostname":"ssh.example.com", "ip":"localhost", "port":"22"},
    {"index":2, "name":"ci-tunnel", "hostname":"web.example.com", "ip":"localhost", "port":"8080"}
  ],
  "cwd": "<working-dir>",
  "cloudflaredPath": "",
  "logLevel": "verbose",
  "timeout": 30000,
  "verifyRetries": 3,
  "verifyDelay": 3000
}
```

**Bước 2: validate**
- Kiểm tra bắt buộc: apiKey/email/accountId/tunnels.
- Validate port 1..65535, tên tunnel thống nhất, hostname không trùng.
- Với input trên => hợp lệ.

**Bước 3: plan**
- `tunnelName = ci-tunnel`, `services` = 2 entry.
- Plan output:

```json
{
  "tunnelName": "ci-tunnel",
  "services": [
    {"name":"ci-tunnel", "hostname":"ssh.example.com", "ip":"localhost", "port":"22"},
    {"name":"ci-tunnel", "hostname":"web.example.com", "ip":"localhost", "port":"8080"}
  ],
  "totalServices": 2
}
```

**Bước 4: install cloudflared**
- Linux: tải binary `cloudflared-linux-amd64` về `.runner-data/tmp`, move vào `.runner-data/bin/cloudflared` (có sudo fallback).
- Windows: ưu tiên `choco install cloudflared -y`, nếu không có thì tải `cloudflared-windows-amd64.exe`.
- Dry-run giả lập kết quả: đã tải thành công và path = `.runner-data/bin/cloudflared`.

**Bước 5: setup directories**
- Tạo `.runner-data/` và các thư mục `logs`, `pid`, `credentials`, `config`, `tmp`, `bin`.

**Bước 6: processTunnel**
- `getOrCreateTunnel("ci-tunnel")`:
  - Nếu tunnel tồn tại: trả tunnelInfo + `tunnelSecret: null`.
  - Nếu chưa tồn tại: tạo mới và có `tunnelSecret`.
- `getTunnelToken(tunnelId)` nếu chưa có `CLOUDFLARED_TUNNEL_TOKEN`.
- Tạo credentials file `credentials/<tunnelId>.json`:

```json
{
  "AccountTag": "acc-123",
  "TunnelSecret": "<tunnelSecret OR token>",
  "TunnelID": "<tunnelId>"
}
```

- Setup DNS record cho từng hostname:
  - `ssh.example.com` -> `CNAME` trỏ `<tunnelId>.cfargotunnel.com`.
  - `web.example.com` -> tương tự.

**Bước 7: generateConfigFile**
- Sinh `config.yml`:

```yaml
tunnel: <tunnelId>
credentials-file: <cwd>/.runner-data/credentials/<tunnelId>.json
ingress:
  -
    hostname: ssh.example.com
    service: localhost:22
  -
    hostname: web.example.com
    service: localhost:8080
  -
    service: http_status:404
```

**Bước 8: startTunnels**
- Spawn: `cloudflared tunnel --config <config.yml> run`.
- Ghi PID vào `.runner-data/pid/cloudflared.pid`.
- Log vào `.runner-data/logs/cloudflared/cloudflared.log`.

**Bước 9: verifyTunnels**
- Đọc PID file, kiểm tra tiến trình sống.
- Kiểm tra log: nếu có `error`/`failed` thì báo lỗi.
- Nếu có `Registered tunnel connection` thì success.

**Bước 10: report**
- Trả report:

```json
{
  "success": true,
  "tunnelsConfigured": 1,
  "tunnels": [
    {
      "name": "ci-tunnel",
      "hostname": "ssh.example.com",
      "service": "localhost:22",
      "tunnelId": "<tunnelId>",
      "status": "running"
    },
    {
      "name": "ci-tunnel",
      "hostname": "web.example.com",
      "service": "localhost:8080",
      "tunnelId": "<tunnelId>",
      "status": "running"
    }
  ],
  "configFile": "<cwd>/.runner-data/config/config.yml",
  "logFile": "<cwd>/.runner-data/logs/cloudflared/cloudflared.log",
  "pidFile": "<cwd>/.runner-data/pid/cloudflared.pid"
}
```

## 5. Bảng lỗi & tình huống đầu vào

| Nhóm lỗi | Điều kiện đầu vào | Mã lỗi/Exit code | Hành vi hiện tại | Gợi ý xử lý |
|---|---|---|---|---|
| Thiếu env | Thiếu `CLOUDFLARED_API_KEY`/`EMAIL`/`ACCOUNT_ID` | `ValidationError` (exit 2) | Dừng với thông báo lỗi | Thiết lập đầy đủ env bắt buộc |
| Thiếu tunnel | Không có `CLOUDFLARED_TUNNEL_1` | `ValidationError` (exit 2) | Dừng với thông báo lỗi | Cấu hình ít nhất 1 tunnel |
| Sai format tunnel | `CLOUDFLARED_TUNNEL_1` không đủ 4 phần | `ConfigError` (exit 2) | Dừng ngay khi parse | Sửa format `name:hostname:ip:port` |
| Port không hợp lệ | `port` không là số hoặc ngoài 1..65535 | `ValidationError` (exit 2) | Dừng validate | Sửa port |
| Tunnel name khác nhau | `CLOUDFLARED_TUNNEL_1`/`2` khác tên | `ValidationError` (exit 2) | Dừng validate | Đồng nhất tên tunnel |
| Duplicate hostname | 2 tunnel dùng chung hostname | `ValidationError` (exit 2) | Dừng validate | Dùng hostname khác |
| Không có quyền ghi | Không thể tạo `.runner-data` | `ProcessError` hoặc throw từ FS | Dừng và gợi ý quyền | Cấp quyền ghi/thư mục |
| Không có cloudflared | Không có `cloudflared`/choco | `ProcessError` (exit 20) | Thử tải binary; nếu fail dừng | Cấp mạng/tải thủ công |
| Không có mạng | Gọi API lỗi, timeout | `NetworkError` (exit 10) | Retry 3 lần rồi fail | Kiểm tra mạng/proxy |
| API trả lỗi | API key sai/permission | `CloudflareApiError` (exit 10) | Dừng và log response | Cấp quyền/đổi key |
| Không thấy zone | `zoneId/zoneName` sai | `CloudflareApiError` | Dừng khi tạo DNS record | Chỉ định `CLOUDFLARED_ZONE_ID` đúng |
| Log báo error | Log cloudflared chứa `error`/`failed` | `ProcessError` (exit 20) | Dừng và in log cuối | Xem log để fix |

## 6. Tổng hợp lệnh cURL & response mong đợi (Cloudflare API)

> Headers bắt buộc:
> - `X-Auth-Email: <email>`
> - `X-Auth-Key: <api-key>`
> - `Content-Type: application/json`

### 6.1. List tunnels
```bash
curl -sS -X GET \
  "https://api.cloudflare.com/client/v4/accounts/<accountId>/cfd_tunnel" \
  -H "X-Auth-Email: <email>" \
  -H "X-Auth-Key: <api-key>" \
  -H "Content-Type: application/json"
```
**Response mong đợi:**
```json
{ "success": true, "result": [ { "id": "<tunnelId>", "name": "ci-tunnel" } ] }
```

### 6.2. Create tunnel
```bash
curl -sS -X POST \
  "https://api.cloudflare.com/client/v4/accounts/<accountId>/cfd_tunnel" \
  -H "X-Auth-Email: <email>" \
  -H "X-Auth-Key: <api-key>" \
  -H "Content-Type: application/json" \
  --data '{"name":"ci-tunnel","tunnel_secret":"<base64>"}'
```
**Response mong đợi:**
```json
{ "success": true, "result": { "id": "<tunnelId>", "name": "ci-tunnel" } }
```

### 6.3. Get tunnel token
```bash
curl -sS -X GET \
  "https://api.cloudflare.com/client/v4/accounts/<accountId>/cfd_tunnel/<tunnelId>/token" \
  -H "X-Auth-Email: <email>" \
  -H "X-Auth-Key: <api-key>" \
  -H "Content-Type: application/json"
```
**Response mong đợi:**
```json
{ "success": true, "result": "<tunnelToken>" }
```

### 6.4. List zones
```bash
curl -sS -X GET \
  "https://api.cloudflare.com/client/v4/zones" \
  -H "X-Auth-Email: <email>" \
  -H "X-Auth-Key: <api-key>" \
  -H "Content-Type: application/json"
```
**Response mong đợi:**
```json
{ "success": true, "result": [ { "id": "<zoneId>", "name": "example.com" } ] }
```

### 6.5. List DNS records
```bash
curl -sS -X GET \
  "https://api.cloudflare.com/client/v4/zones/<zoneId>/dns_records" \
  -H "X-Auth-Email: <email>" \
  -H "X-Auth-Key: <api-key>" \
  -H "Content-Type: application/json"
```
**Response mong đợi:**
```json
{ "success": true, "result": [ { "name": "ssh.example.com" } ] }
```

### 6.6. Create DNS record (CNAME)
```bash
curl -sS -X POST \
  "https://api.cloudflare.com/client/v4/zones/<zoneId>/dns_records" \
  -H "X-Auth-Email: <email>" \
  -H "X-Auth-Key: <api-key>" \
  -H "Content-Type: application/json" \
  --data '{"type":"CNAME","name":"ssh.example.com","content":"<tunnelId>.cfargotunnel.com","proxied":true,"ttl":1}'
```
**Response mong đợi:**
```json
{ "success": true, "result": { "id": "<recordId>", "name": "ssh.example.com" } }
```

## 7. Đánh giá khả thi & khác biệt môi trường

### 7.1. GitHub Actions (Ubuntu)
- Cần quyền sudo để cài cloudflared vào `.runner-data/bin` (đã có sudo fallback).
- Mạng ra internet phải mở để tải cloudflared và gọi API.
- Rủi ro: Rate limit hoặc API key thiếu quyền => `CloudflareApiError`.

### 7.2. Azure Pipelines (Ubuntu)
- Tương tự GitHub Actions.
- Biến CI `AZURE_PIPELINES`/`TF_BUILD` hỗ trợ detection, nhưng không ảnh hưởng logic chính.

### 7.3. Linux/Ubuntu (Self-hosted)
- Nếu user không có sudo, install vẫn cố gắng download và chạy trong `.runner-data/tmp`.
- Cần quyền ghi `.runner-data`.

### 7.4. Windows
- Nếu có Chocolatey: tự cài cloudflared.
- Nếu không: tải `cloudflared.exe` vào `.runner-data/bin` và chạy path đó.
- Kiểm tra quyền ghi trong workspace.

### 7.5. Kịch bản lỗi khả thi & xử lý hiện tại
- Không có network: `NetworkError` (retry 3 lần), báo hint kiểm tra mạng.
- Cloudflare zone không tìm thấy: throw `CloudflareApiError`.
- PID file không tồn tại: `ProcessError` (tunnel fail).
- Log cloudflared có `error`/`failed`: `ProcessError`.

## 8. Gợi ý cải tiến (không thay đổi code)

- Thêm dry-run flag để chỉ in kế hoạch mà không gọi API/khởi chạy cloudflared.
- Thêm log chi tiết cho response API lỗi (hiện đã có verbose log).
- Thêm retry khi tạo DNS record nếu zone đã tồn tại nhưng API transient lỗi.

---

*Báo cáo này được tạo dựa trên phân tích mã nguồn, không chạy thực tế trên môi trường CI/CD.*
