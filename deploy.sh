#!/usr/bin/env bash
set -euo pipefail

# ===================== КОНФИГ =====================
APP_NAME="binar-tree"
DOMAIN="binar.neo.pw"
SERVER_IP="178.105.155.207"
APP_PORT="3210"
DB_NAME="treebuilder"
DB_USER="treebuilder"
ADMIN_EMAIL="ok4ami@gmail.com"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_USER="$(whoami)"
# ==================================================

log()  { echo -e "\n\033[1;36m==> $*\033[0m"; }
ok()   { echo -e "\033[1;32m  ok:\033[0m $*"; }
warn() { echo -e "\033[1;33m  внимание:\033[0m $*"; }

if [ "$(id -u)" = "0" ]; then
  warn "Скрипт запущен из-под root. Лучше запускать обычным пользователем с sudo."
  DEPLOY_USER="${SUDO_USER:-root}"
fi

log "Проверка sudo"
sudo -v
ok "sudo доступен"

# ---------- 1. Node.js ----------
log "Проверка Node.js"
NODE_OK=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -v | sed 's/v//' | cut -d. -f1)"
  if [ "$NODE_MAJOR" -ge 18 ]; then NODE_OK=1; fi
fi
if [ "$NODE_OK" = "0" ]; then
  log "Устанавливаю Node.js 20 LTS"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
ok "Node $(node -v), npm $(npm -v)"

# ---------- 2. .env (генерируется один раз) ----------
log "Настройка .env"
ENV_FILE="$APP_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  DB_URL_LINE="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
  DB_PASS="$(echo "$DB_URL_LINE" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')"
  ok ".env уже существует — переиспользую пароль БД"
else
  DB_PASS="$(openssl rand -hex 16)"
  cat > "$ENV_FILE" <<EOF
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}
PORT=${APP_PORT}
HOST=127.0.0.1
EOF
  ok ".env создан (пароль БД сгенерирован автоматически)"
fi

# ---------- 3. PostgreSQL: отдельная роль и база ----------
log "Настройка PostgreSQL (изолированно, чужие базы не трогаем)"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';
  ELSE
    ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASS}';
  END IF;
END\$\$;
SQL
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
  ok "База ${DB_NAME} создана"
else
  ok "База ${DB_NAME} уже есть"
fi
sudo -u postgres psql -d "${DB_NAME}" -c "GRANT ALL ON SCHEMA public TO ${DB_USER};" >/dev/null
ok "Роль и права настроены"

# ---------- 4. Зависимости и миграции ----------
log "Установка npm-зависимостей"
cd "$APP_DIR"
npm install --no-audit --no-fund
ok "Зависимости установлены"

log "Применение миграций"
npm run migrate
ok "Миграции применены"

# ---------- 5. systemd-сервис ----------
log "Настройка systemd-сервиса ${APP_NAME}"
NODE_BIN="$(command -v node)"
sudo tee "/etc/systemd/system/${APP_NAME}.service" >/dev/null <<EOF
[Unit]
Description=Tree Builder Panel (${DOMAIN})
After=network.target postgresql.service

[Service]
Type=simple
User=${DEPLOY_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=${NODE_BIN} ${APP_DIR}/server/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable "${APP_NAME}" >/dev/null 2>&1 || true
sudo systemctl restart "${APP_NAME}"
sleep 1
sudo systemctl --no-pager --lines=0 status "${APP_NAME}" || true
ok "Сервис запущен на 127.0.0.1:${APP_PORT}"

# ---------- 6. nginx (отдельный server-блок) ----------
log "Настройка nginx для ${DOMAIN}"
NGINX_CONF="/etc/nginx/sites-available/${DOMAIN}"
sudo tee "$NGINX_CONF" >/dev/null <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
sudo ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/${DOMAIN}"
sudo nginx -t
sudo systemctl reload nginx
ok "nginx настроен (HTTP)"

# ---------- 7. SSL (если DNS уже указывает на сервер) ----------
log "Проверка DNS и выпуск SSL-сертификата"
DOMAIN_IP="$(getent hosts "${DOMAIN}" | awk '{print $1}' | head -1 || true)"
if [ "${DOMAIN_IP}" = "${SERVER_IP}" ]; then
  if ! command -v certbot >/dev/null 2>&1; then
    sudo apt-get install -y certbot python3-certbot-nginx
  fi
  sudo certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${ADMIN_EMAIL}" --redirect
  ok "HTTPS включён: https://${DOMAIN}"
else
  warn "DNS для ${DOMAIN} указывает на '${DOMAIN_IP:-ничего}', а нужно ${SERVER_IP}."
  warn "SSL пропущен. Настройте A-запись, затем выполните:"
  echo   "    sudo certbot --nginx -d ${DOMAIN} --agree-tos -m ${ADMIN_EMAIL} --redirect"
fi

# ---------- Итог ----------
log "Готово"
echo "  Приложение:  http://127.0.0.1:${APP_PORT} (внутренний)"
echo "  Сайт:        http://${DOMAIN}  (после настройки DNS — https)"
echo "  Сервис:      sudo systemctl status ${APP_NAME}"
echo "  Логи:        sudo journalctl -u ${APP_NAME} -f"
echo "  База:        ${DB_NAME} (роль ${DB_USER}, пароль в ${ENV_FILE})"
