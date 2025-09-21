#!/bin/bash

# Build script para extensão Auto Power Profile
# Compila traduções .po para .mo automaticamente

set -e

EXTENSION_DIR="$1"
if [ -z "$EXTENSION_DIR" ]; then
    EXTENSION_DIR="$(pwd)"
fi

echo "🔧 Buildando extensão Auto Power Profile..."
echo "📁 Diretório: $EXTENSION_DIR"
echo ""

# 1. Compilar schemas
echo "📋 Compilando schemas..."
if [ -d "$EXTENSION_DIR/schemas" ]; then
    cd "$EXTENSION_DIR/schemas"
    glib-compile-schemas .
    echo "✅ Schemas compilados"
else
    echo "❌ Diretório schemas não encontrado"
fi

# 2. Compilar traduções
echo ""
echo "🌍 Compilando traduções..."
cd "$EXTENSION_DIR"

if [ -d "po" ]; then
    # Criar diretório de locale se não existir
    mkdir -p locale
    
    # Compilar cada arquivo .po
    for po_file in po/*.po; do
        if [ -f "$po_file" ]; then
            # Extrair código do idioma (ex: pt_BR.po -> pt_BR)
            lang=$(basename "$po_file" .po)
            
            # Criar diretório para o idioma
            mkdir -p "locale/$lang/LC_MESSAGES"
            
            # Compilar .po para .mo
            msgfmt "$po_file" -o "locale/$lang/LC_MESSAGES/org.gnome.shell.extensions.auto-power-profile.mo"
            
            echo "✅ $lang: $po_file -> locale/$lang/LC_MESSAGES/org.gnome.shell.extensions.auto-power-profile.mo"
        fi
    done
else
    echo "❌ Diretório po não encontrado"
fi

echo ""
echo "🎉 Build concluído!"
echo ""
echo "📦 Para instalar:"
echo "   cp -r * ~/.local/share/gnome-shell/extensions/auto-power-profile@andrecesarvieira.github.io/"
echo "   gnome-extensions enable auto-power-profile@andrecesarvieira.github.io"