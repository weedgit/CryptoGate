# PaymentGate — portal SPA (shared by platform / agent / merchant subdomains)
root /root/PaymentGate/apps/web/dist;
index index.html;
client_max_body_size 2m;

location = /health {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location = /v1/auth/login {
    limit_req zone=cg_auth burst=12 nodelay;
    limit_req_status 429;
    include /root/PaymentGate/deploy/nginx-api-proxy.inc;
}

location = /v1/auth/forgot-password {
    limit_req zone=cg_auth burst=8 nodelay;
    limit_req_status 429;
    include /root/PaymentGate/deploy/nginx-api-proxy.inc;
}

location = /v1/auth/reset-password {
    limit_req zone=cg_auth burst=8 nodelay;
    limit_req_status 429;
    include /root/PaymentGate/deploy/nginx-api-proxy.inc;
}

location /v1/ {
    limit_req zone=cg_api burst=40 nodelay;
    limit_req_status 429;
    include /root/PaymentGate/deploy/nginx-api-proxy.inc;
}

location /assets/ {
    expires 7d;
    add_header Cache-Control "public, immutable";
    try_files $uri =404;
}

# Legacy invite links pointed at /invite?token= — set-password lives at /reset-password.
location = /invite {
    return 301 /reset-password$is_args$args;
}

# Always revalidate the SPA shell so deploys pick up new hashed chunk names.
location = /index.html {
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    add_header Pragma "no-cache" always;
    add_header Expires "0" always;
    try_files $uri =404;
}

location / {
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    add_header Pragma "no-cache" always;
    add_header Expires "0" always;
    try_files $uri $uri/ /index.html;
}
