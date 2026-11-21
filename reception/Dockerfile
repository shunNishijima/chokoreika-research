# 旧試作（受付のみ・データは端末内）を配信する静的サーバー
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html app.js core.js /usr/share/nginx/html/
