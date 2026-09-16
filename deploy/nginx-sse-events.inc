# Long-lived SSE for dashboard live events (same-origin via portal proxy).
# Must be included before the generic `location /v1/` block.
location = /v1/events {
    limit_req zone=cg_api burst=20 nodelay;
    limit_req_status 429;
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Cookie $http_cookie;
    proxy_hide_header X-Powered-By;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    chunked_transfer_encoding off;
}
