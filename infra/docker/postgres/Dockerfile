# CCIP postgres image: postgres:16-bookworm + pg_partman 5.x + pg_cron 1.4+
# §10.5 T-22 — ADR-010 audit_log partitioning
FROM postgres:16-bookworm

RUN set -ex; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        postgresql-16-partman \
        postgresql-16-cron; \
    rm -rf /var/lib/apt/lists/*

RUN echo "shared_preload_libraries='pg_cron'" >> /usr/share/postgresql/postgresql.conf.sample

COPY 00-cron-database.sh /docker-entrypoint-initdb.d/00-cron-database.sh
RUN chmod +x /docker-entrypoint-initdb.d/00-cron-database.sh

RUN set -ex; \
    PARTMAN_MAJOR=$(grep "^default_version" /usr/share/postgresql/16/extension/pg_partman.control \
                    | sed -E "s/.*'([0-9]+)\..*'/\1/"); \
    CRON_VER=$(grep "^default_version"      /usr/share/postgresql/16/extension/pg_cron.control \
               | sed -E "s/.*'([0-9]+\.[0-9]+).*'/\1/"); \
    test "$PARTMAN_MAJOR" = "5" \
        || { echo "FAIL R-1: pg_partman major must be 5, got $PARTMAN_MAJOR"; exit 1; }; \
    awk -v v="$CRON_VER" 'BEGIN { split(v,a,"."); exit !(a[1]>1 || (a[1]==1 && a[2]>=4)) }' \
        || { echo "FAIL R-2: pg_cron must be >=1.4, got $CRON_VER"; exit 1; }; \
    echo "OK — pg_partman=${PARTMAN_MAJOR}.x, pg_cron=${CRON_VER}"
