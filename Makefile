# Makefile for Auto Power Profile GNOME Shell Extension

UUID = auto-power-profile@dmy3k.github.io
SCHEMAS_DIR = schemas
PO_DIR = po
UI_DIR = ui
LIB_DIR = lib
TESTS_DIR = tests

.PHONY: all build install uninstall enable disable test clean update-translation-template update-translations

all: build

build:
	@echo "Building extension..."
	@glib-compile-schemas $(SCHEMAS_DIR)/
	@gnome-extensions pack --force --podir=$(PO_DIR) --extra-source=$(UI_DIR) --extra-source=$(LIB_DIR) .
	@echo "Build complete: $(UUID).shell-extension.zip"

install: build
	@echo "Installing extension..."
	@gnome-extensions install --force $(UUID).shell-extension.zip
	@echo "Extension installed. Restart Gnome session (logout & login) to be able to activate the extension"

uninstall:
	@gnome-extensions uninstall $(UUID) || true
	@echo "Extension uninstalled."

enable:
	@echo "Enabling extension..."
	@gnome-extensions enable $(UUID) || echo ">>> Restart Gnome session (logout & login) and run this command again"

disable:
	@echo "Disabling extension..."
	@gnome-extensions disable $(UUID)

test:
	@echo "Running tests..."
	@cd $(TESTS_DIR) && yarn check --verify-tree || yarn install --ignore-optional --non-interactive; yarn test

clean:
	@rm -f $(SCHEMAS_DIR)/*.compiled
	@rm -f $(PO_DIR)/*.mo
	@rm -f $(UUID).shell-extension.zip
	@echo "Cleaned build artifacts."

update-translation-template:
	@echo "Updating translation template..."
	@xgettext \
		--from-code=UTF-8 \
		--package-name="Auto Power Profile" \
		--output="$(PO_DIR)/auto-power-profile.pot" \
		--keyword=_ \
		*.js \
		$(UI_DIR)/*.ui
	@echo "Translation template updated: $(PO_DIR)/auto-power-profile.pot"

update-translations: update-translation-template
	@echo "Merging translations..."
	@for po in $(PO_DIR)/*.po; do \
		if [ -f "$$po" ]; then \
			echo "  Updating $$(basename $$po)"; \
			msgmerge --update --backup=none $$po $(PO_DIR)/auto-power-profile.pot; \
		fi \
	done
	@echo "All translations merged."
