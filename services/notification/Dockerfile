# ==========================================
# Stage 1: Vendor build using Composer
# ==========================================
FROM composer:2 AS vendor

WORKDIR /app

COPY composer.json composer.lock ./

RUN composer install \
    --no-dev \
    --no-interaction \
    --prefer-dist \
    --optimize-autoloader \
    --no-scripts \
    --ignore-platform-reqs

# ==========================================
# Stage 2: Runtime image (Using cached php:8.3-cli)
# ==========================================
FROM php:8.3-cli AS runtime

WORKDIR /app

# Install only minimal librdkafka-dev for C headers
RUN apt-get update && apt-get install -y --no-install-recommends \
    librdkafka-dev \
    && rm -rf /var/lib/apt/lists/*

# Install php extensions via official extension installer
ADD --chmod=0755 https://github.com/mlocati/docker-php-extension-installer/releases/download/2.7.13/install-php-extensions /usr/local/bin/

RUN install-php-extensions \
    bcmath \
    mbstring \
    pcntl \
    sockets \
    redis \
    rdkafka \
    opcache \
    zip

# Copy application codebase
COPY . .

# Copy production vendor dependencies from vendor stage
COPY --from=vendor /app/vendor /app/vendor

# Create runtime directories and set ownership for non-root user
RUN mkdir -p storage/framework/cache/data \
             storage/framework/sessions \
             storage/framework/views \
             storage/logs \
             bootstrap/cache \
    && rm -f bootstrap/cache/*.php \
    && php artisan package:discover --ansi \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

USER www-data

ENV PORT=4006

EXPOSE 4006

CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=4006"]
