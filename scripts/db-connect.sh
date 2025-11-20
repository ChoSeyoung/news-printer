#!/bin/bash

# News Printer - Database Connection Script
# Usage: ./scripts/db-connect.sh [option]

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Default values
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-3306}
DB_NAME=${DB_NAME:-news_printer}
DB_USER=${DB_USER:-news_user}
DB_PASSWORD=${DB_PASSWORD:-newspassword}
DB_ROOT_PASSWORD=${DB_ROOT_PASSWORD:-rootpassword}

case "$1" in
    "docker"|"d")
        # Docker 컨테이너 내부에서 접속
        echo "Connecting to MySQL via Docker container..."
        docker exec -it news-printer-mysql mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME"
        ;;
    "root"|"r")
        # Root 권한으로 접속
        echo "Connecting to MySQL as root..."
        docker exec -it news-printer-mysql mysql -u root -p"$DB_ROOT_PASSWORD"
        ;;
    "local"|"l")
        # 로컬 MySQL 클라이언트로 접속
        echo "Connecting to MySQL via local client..."
        mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME"
        ;;
    "stats"|"s")
        # 통계 조회
        echo "Fetching database statistics..."
        docker exec -it news-printer-mysql mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
            SELECT 'Total Published' as metric, COUNT(*) as value FROM published_news
            UNION ALL
            SELECT 'Longform', COUNT(*) FROM published_news WHERE videoType = 'longform'
            UNION ALL
            SELECT 'Shorts', COUNT(*) FROM published_news WHERE videoType = 'shorts'
            UNION ALL
            SELECT 'Today', COUNT(*) FROM published_news WHERE DATE(publishedAt) = CURDATE();
        "
        ;;
    "recent"|"rc")
        # 최근 발행 뉴스 조회
        echo "Fetching recent published news..."
        docker exec -it news-printer-mysql mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
            SELECT id, title, videoType, publishedAt
            FROM published_news
            ORDER BY publishedAt DESC
            LIMIT 10;
        "
        ;;
    "help"|"h"|"")
        echo "Usage: ./scripts/db-connect.sh [option]"
        echo ""
        echo "Options:"
        echo "  docker, d    - Connect via Docker container"
        echo "  root, r      - Connect as root user"
        echo "  local, l     - Connect via local MySQL client"
        echo "  stats, s     - Show database statistics"
        echo "  recent, rc   - Show recent published news"
        echo "  help, h      - Show this help message"
        echo ""
        echo "Examples:"
        echo "  ./scripts/db-connect.sh docker"
        echo "  ./scripts/db-connect.sh stats"
        ;;
    *)
        echo "Unknown option: $1"
        echo "Use './scripts/db-connect.sh help' for usage information"
        exit 1
        ;;
esac
