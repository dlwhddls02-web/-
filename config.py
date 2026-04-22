import os
from dotenv import load_dotenv

load_dotenv()

# Core
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
MODEL = "claude-sonnet-4-6"
DB_PATH = os.getenv("DB_PATH", "sales_team.db")
MAX_TOKENS = 4096

# Meta Graph API (Instagram + Facebook)
META_ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")
FACEBOOK_PAGE_ID = os.getenv("FACEBOOK_PAGE_ID", "")
INSTAGRAM_ACCOUNT_ID = os.getenv("INSTAGRAM_ACCOUNT_ID", "")

# Unsplash
UNSPLASH_ACCESS_KEY = os.getenv("UNSPLASH_ACCESS_KEY", "")

# Notion
NOTION_API_KEY = os.getenv("NOTION_API_KEY", "")
NOTION_CUSTOMERS_DB_ID = os.getenv("NOTION_CUSTOMERS_DB_ID", "")
NOTION_CONTRACTS_DB_ID = os.getenv("NOTION_CONTRACTS_DB_ID", "")
NOTION_REPORTS_DB_ID = os.getenv("NOTION_REPORTS_DB_ID", "")

# Kakao
KAKAO_REST_API_KEY = os.getenv("KAKAO_REST_API_KEY", "")
KAKAO_ACCESS_TOKEN = os.getenv("KAKAO_ACCESS_TOKEN", "")
KAKAO_CHANNEL_PUBLIC_ID = os.getenv("KAKAO_CHANNEL_PUBLIC_ID", "")

# n8n
N8N_BASE_URL = os.getenv("N8N_BASE_URL", "http://localhost:5678")
N8N_API_KEY = os.getenv("N8N_API_KEY", "")
