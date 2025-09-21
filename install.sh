#!/bin/bash

# Script de instalação da extensão Auto Power Profile
# Para instalar a extensão diretamente do GitHub

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

EXTENSION_ID="auto-power-profile@andrecesarvieira.github.io"
EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_ID"
TEMP_DIR="/tmp/auto-power-profile-install"

echo -e "${BLUE}🚀 Instalador da Extensão Auto Power Profile${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Verificar se o GNOME Shell está disponível
if ! command -v gnome-shell &> /dev/null; then
    echo -e "${RED}❌ GNOME Shell não encontrado. Esta extensão requer GNOME Shell.${NC}"
    exit 1
fi

# Verificar versão do GNOME Shell
GNOME_VERSION=$(gnome-shell --version | grep -oP '\d+' | head -1)
if [[ $GNOME_VERSION -lt 45 ]]; then
    echo -e "${RED}❌ GNOME Shell versão $GNOME_VERSION não é suportada. Requer versão 45 ou superior.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ GNOME Shell versão $GNOME_VERSION detectado${NC}"

# Verificar dependências
echo -e "${YELLOW}📋 Verificando dependências...${NC}"

if ! command -v powerprofilesctl &> /dev/null; then
    echo -e "${RED}❌ power-profiles-daemon não encontrado.${NC}"
    echo -e "${YELLOW}💡 Para instalar no Fedora: sudo dnf install power-profiles-daemon${NC}"
    echo -e "${YELLOW}💡 Para instalar no Ubuntu: sudo apt install power-profiles-daemon${NC}"
    exit 1
fi

if ! powerprofilesctl list &> /dev/null; then
    echo -e "${RED}❌ power-profiles-daemon não está funcionando.${NC}"
    echo -e "${YELLOW}💡 Tente: sudo systemctl enable --now power-profiles-daemon${NC}"
    exit 1
fi

echo -e "${GREEN}✅ power-profiles-daemon funcionando${NC}"

# Criar diretório temporário
echo -e "${YELLOW}📁 Preparando instalação...${NC}"
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"
cd "$TEMP_DIR"

# Baixar extensão do GitHub
echo -e "${YELLOW}📥 Baixando extensão do GitHub...${NC}"
if command -v git &> /dev/null; then
    git clone --depth 1 https://github.com/andrecesarvieira/auto-power-profile.git .
else
    echo -e "${YELLOW}⬇️ Git não encontrado, baixando via curl...${NC}"
    curl -L https://github.com/andrecesarvieira/auto-power-profile/archive/main.tar.gz | tar xz --strip-components=1
fi

# Build da extensão
echo -e "${YELLOW}🔧 Compilando extensão...${NC}"
chmod +x build.sh
./build.sh > /dev/null 2>&1

# Desabilitar extensão se estiver ativa
echo -e "${YELLOW}⏹️ Desabilitando extensão anterior...${NC}"
gnome-extensions disable $EXTENSION_ID 2>/dev/null || true

# Remover instalação anterior
if [ -d "$EXTENSION_DIR" ]; then
    echo -e "${YELLOW}🧹 Removendo instalação anterior...${NC}"
    rm -rf "$EXTENSION_DIR"
fi

# Instalar extensão
echo -e "${YELLOW}📦 Instalando extensão...${NC}"
mkdir -p "$EXTENSION_DIR"

# Copiar apenas arquivos necessários
cp -r extension.js prefs.js metadata.json "$EXTENSION_DIR/"
cp -r lib/ ui/ schemas/ locale/ po/ "$EXTENSION_DIR/"

# Verificar se a extensão foi instalada corretamente
if [ ! -f "$EXTENSION_DIR/metadata.json" ]; then
    echo -e "${RED}❌ Erro na instalação da extensão${NC}"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Limpeza
rm -rf "$TEMP_DIR"

# Verificar se estamos em uma sessão Wayland/X11
if [ "$XDG_SESSION_TYPE" = "wayland" ] || [ -n "$WAYLAND_DISPLAY" ]; then
    SESSION_TYPE="Wayland"
else
    SESSION_TYPE="X11"
fi

echo ""
echo -e "${GREEN}🎉 Instalação concluída com sucesso!${NC}"
echo ""
echo -e "${YELLOW}🔄 IMPORTANTE: Reinicie o GNOME Shell para ativar a extensão${NC}"
if [ "$SESSION_TYPE" = "X11" ]; then
    echo -e "${BLUE}   X11: Pressione ${YELLOW}Alt+F2${BLUE}, digite ${YELLOW}'r'${BLUE} e pressione Enter${NC}"
else
    echo -e "${BLUE}   Wayland: Faça logout e login novamente${NC}"
fi
echo ""
echo -e "${BLUE}📋 Após reiniciar o GNOME Shell:${NC}"
echo -e "   1. Habilite a extensão: ${YELLOW}gnome-extensions enable $EXTENSION_ID${NC}"
echo -e "   2. Configure: ${YELLOW}gnome-extensions prefs $EXTENSION_ID${NC}"
echo -e "   3. Ative 'Desabilitar animações na bateria' para economia extra"
echo ""
echo -e "${BLUE}ℹ️ Informações:${NC}"
echo -e "   • Repositório: https://github.com/andrecesarvieira/auto-power-profile"
echo -e "   • Versão instalada: $(grep -o '"version": [0-9]*' "$EXTENSION_DIR/metadata.json" | grep -o '[0-9]*')"
echo ""
echo -e "${GREEN}✨ Após reiniciar, a extensão gerenciará automaticamente a energia!${NC}"