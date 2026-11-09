# Loja ImportFácil: Bagisto 2.5 + B2B Suite em português, com o catálogo e as regras da ImportFácil
# (pacote ImportFacil\Loja em pacote/) e o app instalável (PWA).
# O banco (MySQL 8) roda em outro contêiner; veja docker-compose.yml.
FROM php:8.4-cli-bookworm

ENV COMPOSER_ALLOW_SUPERUSER=1 COMPOSER_NO_INTERACTION=1

ADD --chmod=0755 https://github.com/mlocati/docker-php-extension-installer/releases/latest/download/install-php-extensions /usr/local/bin/

RUN apt-get update \
 && apt-get install -y --no-install-recommends git unzip ca-certificates librsvg2-bin fonts-dejavu-core python3 \
 && rm -rf /var/lib/apt/lists/* \
 && install-php-extensions calendar intl gd zip pdo_mysql bcmath exif opcache pcntl @composer \
 && printf "memory_limit=1G\nupload_max_filesize=20M\npost_max_size=25M\nmax_execution_time=0\ndate.timezone=America/Sao_Paulo\n" > /usr/local/etc/php/conf.d/demo.ini

ARG BAGISTO_VERSAO=v2.5.1
ARG B2B_VERSAO=^3.0

WORKDIR /var/www
RUN git clone --depth 1 --branch ${BAGISTO_VERSAO} https://github.com/bagisto/bagisto.git bagisto \
 && cd bagisto \
 && cp .env.example .env \
 && composer install --no-dev --prefer-dist --optimize-autoloader \
 && composer require "bagisto/b2b-suite:${B2B_VERSAO}" --update-no-dev --prefer-dist \
 # a B2B Suite é registrada no iniciar.sh, depois da instalação do Bagisto (ela consulta o banco ao iniciar)
 # imagens com endereço relativo (/storage/...): funcionam em qualquer endereço (localhost, Codespaces, AWS)
 && sed -i "s|'url' => env('APP_URL').'/storage',|'url' => env('PUBLIC_STORAGE_URL', env('APP_URL').'/storage'),|" config/filesystems.php \
 && grep -q PUBLIC_STORAGE_URL config/filesystems.php \
 && mkdir -p app/Console/Commands

COPY catalogo-importfacil.json /opt/demo/
COPY dados/ncm.json /opt/demo/ncm.json
COPY scripts /opt/demo/scripts
COPY marca /opt/demo/marca
RUN python3 /opt/demo/scripts/gerar-imagens.py /opt/demo/catalogo-importfacil.json /opt/demo/imagens \
 && python3 /opt/demo/scripts/gerar-marca.py /opt/demo/marca

COPY app/ImportfacilDemo.php /var/www/bagisto/app/Console/Commands/ImportfacilDemo.php
COPY lang/shop/pt_BR/app.php /var/www/bagisto/lang/vendor/shop/pt_BR/app.php
COPY iniciar.sh /opt/demo/iniciar.sh

# regras da ImportFácil em PHP (pedido mínimo, múltiplo de venda, Pix, boleto pelo crédito, cartão, parcelas, app)
COPY pacote /var/www/bagisto/packages/ImportFacil/Loja
RUN cd /var/www/bagisto \
 && php -r '$f="composer.json"; $j=json_decode(file_get_contents($f), true); $j["autoload"]["psr-4"]["ImportFacil\\Loja\\"]="packages/ImportFacil/Loja/src/"; file_put_contents($f, json_encode($j, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE)."\n");' \
 && composer dump-autoload -o --no-dev \
 && mkdir -p public/importfacil && cp -r packages/ImportFacil/Loja/public/. public/importfacil/ \
 && sed -i 's|^];|    ImportFacil\\Loja\\Providers\\ImportFacilServiceProvider::class,\n];|' bootstrap/providers.php \
 && grep -q ImportFacilServiceProvider bootstrap/providers.php

WORKDIR /var/www/bagisto
EXPOSE 8000
CMD ["bash", "/opt/demo/iniciar.sh"]
