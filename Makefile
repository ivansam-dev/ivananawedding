COMPOSE := docker compose
DEV_PORT := 8081
DEV     := WEB_PORT=$(DEV_PORT) $(COMPOSE) -p wedding-dev -f docker-compose.yml -f docker-compose.dev.yml
TUNNEL  := $(shell grep -qsE '^CLOUDFLARE_TUNNEL_TOKEN=.+' .env && echo --profile tunnel)
STAMP   := $(shell date +%Y%m%d-%H%M%S)
PORT    := $(or $(shell sed -nE 's/^WEB_PORT=([0-9]+).*/\1/p' .env 2>/dev/null),8080)

.DEFAULT_GOAL := help
.PHONY: help dev up down logs ps export-db restore-db set-password test fonts

help: ## List the commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-14s %s\n", $$1, $$2}'

.env:
	@cp .env.example .env
	@echo "Created .env. Set ROOT_ADMIN_PASSWORD and LINK_ADMIN_PASSWORD in it, then run make again."
	@exit 1

dev: .env ## Run locally with live reload and a separate database (Ctrl-C to stop)
	@echo "Starting dev on http://localhost:$(DEV_PORT) (separate database from prod)"
	$(DEV) up --build

up: .env ## Run in the background, plus the Cloudflare tunnel if a token is set
	$(COMPOSE) $(TUNNEL) up -d --build --remove-orphans
	@echo "Running on http://localhost:$(PORT)"
	@echo "$(if $(TUNNEL),Cloudflare tunnel: running,Cloudflare tunnel: not started (no CLOUDFLARE_TUNNEL_TOKEN in .env))"

down: ## Stop everything
	$(COMPOSE) --profile tunnel down

logs: ## Follow the logs
	$(COMPOSE) --profile tunnel logs -f --tail=100

ps: ## Show what's running
	$(COMPOSE) --profile tunnel ps

export-db: ## Download a copy of the database to ./exports/ (site must be running)
	@mkdir -p exports
	@$(COMPOSE) exec -T api python -m app.cli backup /data/export.db
	@$(COMPOSE) cp api:/data/export.db exports/wedding-$(STAMP).db
	@$(COMPOSE) exec -T api rm -f /data/export.db
	@echo "Saved exports/wedding-$(STAMP).db"

restore-db: ## Replace the database with a copy: make restore-db FILE=exports/wedding-....db
	@test -n "$(FILE)" || { echo "Usage: make restore-db FILE=exports/wedding-YYYYMMDD-HHMMSS.db"; exit 1; }
	@test -f "$(FILE)" || { echo "No such file: $(FILE)"; exit 1; }
	@printf "This replaces the whole guest list with $(FILE). Type yes to continue: "; read ok; [ "$$ok" = yes ]
	@$(COMPOSE) cp "$(FILE)" api:/data/restore.db
	@$(COMPOSE) exec -T api python -m app.cli restore /data/restore.db
	@$(COMPOSE) exec -T api rm -f /data/restore.db

set-password: ## Change an admin password: make set-password ROLE=root (or ROLE=link)
	@test "$(ROLE)" = root -o "$(ROLE)" = link || { echo "Usage: make set-password ROLE=root|link"; exit 1; }
	@$(COMPOSE) exec api python -m app.cli set-password $(ROLE)

test: ## Run the backend tests (in Docker)
	docker build -q --target test -t wedding-api-test ./backend >/dev/null
	docker run --rm wedding-api-test

fonts: ## Rebuild the card's fonts after changing any Chinese or Vietnamese wording (in Docker)
	docker run --rm -v "$(CURDIR)/frontend:/w" -w /w python:3.12-slim \
		sh -c "pip install -q --root-user-action=ignore fonttools brotli && python tools/subset_fonts.py"
